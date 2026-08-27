import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { GitHubInstallationModel } from "../../models/GitHubInstallation.model.js";
import { RepositoryModel } from "../../models/Repository.model.js";
import { ReviewConfigurationModel } from "../../models/ReviewConfiguration.model.js";
import { repositorySyncQueue } from "../../queues/index.js";
import { getInstallationRepositories, getInstallationInfo } from "../../github/github.service.js";
import { ENV } from "../../config/env.js";
import logger from "../../utils/logger.js";

export const getInstallationUrl = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const appSlug = ENV.GITHUB_APP_SLUG;
  const installUrl = `https://github.com/apps/${appSlug}/installations/new?state=${userId}`;
  res.json({ success: true, data: { installUrl } });
});

export const handleInstallationCallback = asyncHandler(async (req: Request, res: Response) => {
  const { installation_id, setup_action } = req.query as {
    installation_id: string;
    setup_action: string;
  };

  if (!installation_id) {
    throw new ApiError(400, "Missing installation_id", "MISSING_INSTALLATION_ID");
  }

  const installationId = parseInt(installation_id, 10);
  const userId = req.user!.id;

  let installInfo: Awaited<ReturnType<typeof getInstallationInfo>>;
  try {
    installInfo = await getInstallationInfo(installationId);
  } catch (err) {
    logger.error({ err }, "Failed to fetch installation info");
    throw new ApiError(502, "Failed to fetch GitHub installation info", "GITHUB_INSTALL_FAILED");
  }

  const installation = await GitHubInstallationModel.findOneAndUpdate(
    { installationId },
    {
      $set: {
        installationId,
        githubAccountId: installInfo.account?.id ?? 0,
        githubAccountLogin: (installInfo.account as any)?.login ?? "",
        githubAccountType: (installInfo.account as any)?.type ?? "User",
        githubAccountAvatarUrl: (installInfo.account as any)?.avatar_url ?? "",
        userId,
        permissions: installInfo.permissions ?? {},
        repositorySelection: installInfo.repository_selection ?? "selected",
        active: true,
        installedAt: new Date(installInfo.created_at),
      },
    },
    { upsert: true, new: true }
  );

  // Queue repository sync
  await repositorySyncQueue.add(`sync-${installationId}`, {
    installationId: installation._id.toString(),
    installationGithubId: installationId,
    userId: userId.toString(),
  });

  logger.info({ installationId, userId }, "GitHub App installed");
  res.redirect(`${ENV.FRONTEND_URL}/dashboard?installed=true`);
});

export const getInstallations = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const installations = await GitHubInstallationModel.find({ userId, active: true });
  res.json({ success: true, data: installations });
});

export const syncRepositories = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { installationId } = req.params;

  const installation = await GitHubInstallationModel.findOne({
    _id: installationId,
    userId,
    active: true,
  });

  if (!installation) {
    throw new ApiError(404, "Installation not found", "INSTALLATION_NOT_FOUND");
  }

  await repositorySyncQueue.add(`sync-${installation.installationId}-${Date.now()}`, {
    installationId: installation._id.toString(),
    installationGithubId: installation.installationId,
    userId,
  });

  res.json({ success: true, message: "Repository sync queued" });
});

export const disconnectInstallation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { installationId } = req.params;

  const installation = await GitHubInstallationModel.findOne({
    _id: installationId,
    userId,
  });

  if (!installation) {
    throw new ApiError(404, "Installation not found", "INSTALLATION_NOT_FOUND");
  }

  await GitHubInstallationModel.findByIdAndUpdate(installationId, { active: false });
  await RepositoryModel.updateMany(
    { installationId, userId },
    { enabled: false, reviewEnabled: false }
  );

  logger.info({ installationId, userId }, "GitHub installation disconnected");
  res.json({ success: true, message: "GitHub installation disconnected" });
});
