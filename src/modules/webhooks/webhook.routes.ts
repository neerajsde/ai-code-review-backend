import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { ENV } from "../../config/env.js";
import { WebhookEventModel } from "../../models/WebhookEvent.model.js";
import { ReviewModel } from "../../models/Review.model.js";
import { PullRequestModel } from "../../models/PullRequest.model.js";
import { RepositoryModel } from "../../models/Repository.model.js";
import { GitHubInstallationModel } from "../../models/GitHubInstallation.model.js";
import { ReviewConfigurationModel } from "../../models/ReviewConfiguration.model.js";
import { codeReviewQueue, repositorySyncQueue } from "../../queues/index.js";
import { ApiError } from "../../utils/api-error.js";
import logger from "../../utils/logger.js";

const router = express.Router();



// ─── Signature Verification ───────────────────────────────────────────────────
function verifyWebhookSignature(
  payload: Buffer,
  signature: string | undefined
): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", ENV.GITHUB_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Main Webhook Handler ─────────────────────────────────────────────────────
router.post(
  "/github",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawBody = (req as any).rawBody as Buffer;
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const eventName = req.headers["x-github-event"] as string | undefined;
      const deliveryId = req.headers["x-github-delivery"] as string | undefined;

      // 1. Verify signature
      if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
        logger.warn(
          { deliveryId, eventName },
          "webhook.signature.invalid"
        );
        res.status(401).json({
          success: false,
          error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" },
        });
        return;
      }

      if (!eventName || !deliveryId) {
        res.status(400).json({
          success: false,
          error: { code: "MISSING_HEADERS", message: "Missing required GitHub headers" },
        });
        return;
      }

      // 2. Payload is already parsed by express.json
      const payload = req.body;

      const action = (payload.action as string) ?? null;
      const installationId = (payload.installation as any)?.id ?? null;

      logger.info(
        { deliveryId, eventName, action, installationId },
        "webhook.received"
      );

      // 3. Check for duplicate delivery (idempotency)
      const existing = await WebhookEventModel.findOne({ deliveryId });
      if (existing) {
        logger.info({ deliveryId }, "webhook.duplicate - skipping");
        res.status(200).json({ success: true, message: "Duplicate event ignored" });
        return;
      }

      // 4. Store webhook event (trimmed — no source code)
      const trimmedPayload = buildTrimmedPayload(eventName, payload);
      const webhookEvent = await WebhookEventModel.create({
        githubEventId: deliveryId,
        deliveryId,
        eventName,
        action,
        installationId,
        payload: trimmedPayload,
        status: "PENDING",
      });

      // 5. Return 200 immediately — never process AI synchronously
      res.status(200).json({ success: true, message: "Webhook received" });

      // 6. Process asynchronously
      await handleWebhookEvent(
        eventName,
        action,
        payload,
        installationId,
        webhookEvent._id.toString()
      );
    } catch (err) {
      next(err);
    }
  }
);

// ─── Trimmed Payload (no source code stored) ──────────────────────────────────
function buildTrimmedPayload(
  eventName: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const base = {
    action: payload.action,
    installation: { id: (payload.installation as any)?.id },
  };

  if (eventName === "pull_request") {
    const pr = payload.pull_request as any;
    return {
      ...base,
      pull_request: {
        id: pr?.id,
        number: pr?.number,
        title: pr?.title,
        state: pr?.state,
        draft: pr?.draft,
        merged: pr?.merged,
        head: { sha: pr?.head?.sha, ref: pr?.head?.ref },
        base: { sha: pr?.base?.sha, ref: pr?.base?.ref },
        user: { login: pr?.user?.login },
        html_url: pr?.html_url,
        additions: pr?.additions,
        deletions: pr?.deletions,
        changed_files: pr?.changed_files,
      },
      repository: {
        id: (payload.repository as any)?.id,
        full_name: (payload.repository as any)?.full_name,
        name: (payload.repository as any)?.name,
      },
      sender: { login: (payload.sender as any)?.login },
    };
  }

  return base;
}

// ─── Event Dispatcher ─────────────────────────────────────────────────────────
async function handleWebhookEvent(
  eventName: string,
  action: string | null,
  payload: Record<string, unknown>,
  installationId: number | null,
  webhookEventId: string
): Promise<void> {
  try {
    switch (eventName) {
      case "pull_request":
        await handlePullRequestEvent(action, payload, installationId, webhookEventId);
        break;

      case "installation":
        await handleInstallationEvent(action, payload, installationId);
        break;

      case "installation_repositories":
        await handleInstallationRepositoriesEvent(action, payload, installationId);
        break;

      default:
        await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
          status: "SKIPPED",
          processedAt: new Date(),
        });
        break;
    }
  } catch (err) {
    logger.error({ err, webhookEventId }, "webhook.processing.error");
    await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
      processedAt: new Date(),
    }).catch(() => {});
  }
}

// ─── Pull Request Events ──────────────────────────────────────────────────────
async function handlePullRequestEvent(
  action: string | null,
  payload: Record<string, unknown>,
  installationId: number | null,
  webhookEventId: string
): Promise<void> {
  const pr = payload.pull_request as any;
  const repo = payload.repository as any;

  if (!pr || !repo || !installationId) {
    logger.warn("pull_request event missing required fields");
    return;
  }

  // Don't review closed/merged PRs
  if (action === "closed") {
    // Update PR status
    await PullRequestModel.findOneAndUpdate(
      { githubPrId: pr.id },
      {
        status: pr.merged ? "MERGED" : "CLOSED",
        mergedAt: pr.merged ? new Date(pr.merged_at) : null,
        closedAt: new Date(pr.closed_at),
      }
    );

    await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
      status: "SKIPPED",
      processedAt: new Date(),
    });
    return;
  }

  // Only trigger reviews for these actions
  const reviewableActions = ["opened", "synchronize", "reopened"];
  if (!action || !reviewableActions.includes(action)) {
    await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
      status: "SKIPPED",
      processedAt: new Date(),
    });
    return;
  }

  // Find our repository record
  const repository = await RepositoryModel.findOne({
    githubRepositoryId: repo.id,
  });

  if (!repository || !repository.enabled) {
    logger.info({ repoId: repo.id }, "Repository not found or disabled — skipping review");
    await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
      status: "SKIPPED",
      processedAt: new Date(),
    });
    return;
  }

  // Check config
  const config = await ReviewConfigurationModel.findOne({
    repositoryId: repository._id,
  });

  if (config) {
    if (!repository.reviewEnabled) {
      await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
        status: "SKIPPED",
        processedAt: new Date(),
      });
      return;
    }
    if (pr.draft && !config.reviewDraftPRs) {
      await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
        status: "SKIPPED",
        processedAt: new Date(),
      });
      return;
    }
    if (action === "opened" && !config.reviewOnOpen) {
      await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
        status: "SKIPPED",
        processedAt: new Date(),
      });
      return;
    }
    if (action === "synchronize" && !config.reviewOnSync) {
      await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
        status: "SKIPPED",
        processedAt: new Date(),
      });
      return;
    }
  }

  // Find installation
  const installation = await GitHubInstallationModel.findOne({
    installationId,
    active: true,
  });

  if (!installation) {
    logger.warn({ installationId }, "Installation not found or inactive");
    return;
  }

  // Upsert PR
  const headSha = pr.head.sha as string;
  const pullRequest = await PullRequestModel.findOneAndUpdate(
    { repositoryId: repository._id, number: pr.number },
    {
      $set: {
        githubPrId: pr.id,
        title: pr.title,
        description: pr.body,
        author: pr.user?.login ?? "",
        authorAvatarUrl: pr.user?.avatar_url ?? "",
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        headSha,
        baseSha: pr.base.sha,
        status: "OPEN",
        draft: pr.draft ?? false,
        githubUrl: pr.html_url,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFiles: pr.changed_files ?? 0,
        openedAt: new Date(pr.created_at),
      },
      $setOnInsert: {
        repositoryId: repository._id,
        userId: repository.userId,
        number: pr.number,
        githubPrId: pr.id,
      },
    },
    { upsert: true, new: true }
  );

  // Idempotency: check if review already exists for this commit SHA
  const existingReview = await ReviewModel.findOne({
    pullRequestId: pullRequest._id,
    commitSha: headSha,
    status: { $in: ["QUEUED", "PROCESSING", "COMPLETED"] },
  });

  if (existingReview) {
    logger.info(
      { reviewId: existingReview._id, headSha },
      "webhook.duplicate - review already exists for this SHA"
    );
    await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
      status: "SKIPPED",
      processedAt: new Date(),
    });
    return;
  }

  // Create review record
  const review = await ReviewModel.create({
    pullRequestId: pullRequest._id,
    repositoryId: repository._id,
    userId: repository.userId,
    installationId: installation._id,
    status: "QUEUED",
    trigger: "WEBHOOK",
    commitSha: headSha,
  });

  // Queue the job
  const job = await codeReviewQueue.add(
    `review-${review._id}`,
    {
      reviewId: review._id.toString(),
      repositoryId: repository._id.toString(),
      pullRequestId: pullRequest._id.toString(),
      installationId: installation._id.toString(),
      installationGithubId: installation.installationId,
      commitSha: headSha,
      prNumber: pr.number,
      repoOwner: repo.owner?.login ?? repo.full_name.split("/")[0],
      repoName: repo.name,
      trigger: "WEBHOOK",
    },
    { jobId: `review-${review._id}` }
  );

  // Update review with job ID
  await ReviewModel.findByIdAndUpdate(review._id, { jobId: job.id });

  // Update webhook event
  await WebhookEventModel.findByIdAndUpdate(webhookEventId, {
    status: "PROCESSED",
    processedAt: new Date(),
    repositoryId: repository._id,
    reviewId: review._id,
  });

  logger.info(
    {
      reviewId: review._id,
      jobId: job.id,
      prNumber: pr.number,
      headSha,
    },
    "webhook.review.queued"
  );
}

// ─── Installation Events ──────────────────────────────────────────────────────
async function handleInstallationEvent(
  action: string | null,
  payload: Record<string, unknown>,
  installationId: number | null
): Promise<void> {
  if (!installationId) return;

  if (action === "deleted" || action === "suspend") {
    await GitHubInstallationModel.findOneAndUpdate(
      { installationId },
      { active: false }
    );
    // Disable repositories for this installation
    const installation = await GitHubInstallationModel.findOne({ installationId });
    if (installation) {
      await RepositoryModel.updateMany(
        { installationId: installation._id },
        { enabled: false, reviewEnabled: false }
      );
    }
    logger.info({ installationId, action }, "Installation deactivated");
  } else if (action === "created" || action === "unsuspend") {
    // Queue repository sync
    const installation = await GitHubInstallationModel.findOne({ installationId });
    if (installation) {
      await GitHubInstallationModel.findOneAndUpdate(
        { installationId },
        { active: true }
      );
      await repositorySyncQueue.add(
        `sync-${installationId}`,
        {
          installationId: installation._id.toString(),
          installationGithubId: installationId,
          userId: installation.userId.toString(),
        }
      );
    }
  }
}

async function handleInstallationRepositoriesEvent(
  action: string | null,
  payload: Record<string, unknown>,
  installationId: number | null
): Promise<void> {
  if (!installationId) return;
  const installation = await GitHubInstallationModel.findOne({ installationId });
  if (!installation) return;

  await repositorySyncQueue.add(
    `sync-repos-${installationId}-${Date.now()}`,
    {
      installationId: installation._id.toString(),
      installationGithubId: installationId,
      userId: installation.userId.toString(),
    }
  );
}

export default router;
