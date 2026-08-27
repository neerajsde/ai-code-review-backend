import { Worker } from "bullmq";
import { ReviewModel } from "../models/Review.model.js";
import { ReviewFindingModel } from "../models/ReviewFinding.model.js";
import { RepositoryModel } from "../models/Repository.model.js";
import { ReviewConfigurationModel } from "../models/ReviewConfiguration.model.js";
import {
  getPullRequest,
  getPullRequestFiles,
  createPullRequestReview,
  type GitHubReviewComment,
} from "../github/github.service.js";
import {
  filterFiles,
  chunkFiles,
  generateFindingFingerprint,
  calculateScore,
  type FindingCounts,
} from "../services/diffProcessor.js";
import { getAIProvider } from "../ai/AIProviderFactory.js";
import { ENV } from "../config/env.js";
import { getQueueConnection } from "../queues/index.js";
import logger from "../utils/logger.js";
import type { CodeReviewJobData } from "../queues/index.js";
import type { FindingSeverity, FindingCategory } from "../models/ReviewFinding.model.js";

const SEVERITY_EMOJI: Record<FindingSeverity, string> = {
  CRITICAL: "🔴",
  HIGH: "🟠",
  MEDIUM: "🟡",
  LOW: "🔵",
  INFO: "⚪",
};

function formatGitHubReviewBody(params: {
  score: number;
  filesReviewed: number;
  counts: FindingCounts;
  summary: string;
  provider: string;
  model: string;
}): string {
  const { score, filesReviewed, counts, summary, provider, model } = params;
  return `## 🤖 AI Code Review

**Overall Score: ${score}/100** | **Files Reviewed: ${filesReviewed}**

### Findings Summary
| Severity | Count |
|----------|-------|
| 🔴 Critical | ${counts.critical} |
| 🟠 High | ${counts.high} |
| 🟡 Medium | ${counts.medium} |
| 🔵 Low | ${counts.low} |
| ⚪ Info | ${counts.info} |

### Summary
${summary}

---
*Reviewed by [AI Code Review](${ENV.FRONTEND_URL}) using ${provider}/${model}*`;
}

function formatInlineComment(finding: {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  suggestion: string | null;
  confidence: number;
}): string {
  const emoji = SEVERITY_EMOJI[finding.severity];
  const confidence = Math.round(finding.confidence * 100);
  return `${emoji} **${finding.severity} — ${finding.category}**

**${finding.title}**

${finding.description}
${finding.suggestion ? `\n**Suggested fix:**\n${finding.suggestion}` : ""}

*Confidence: ${confidence}%*`;
}

export async function processCodeReview(data: CodeReviewJobData): Promise<void> {
  const {
    reviewId, repositoryId, pullRequestId,
    installationGithubId, commitSha, prNumber,
    repoOwner, repoName,
  } = data;

  const reviewLogger = logger.child({ reviewId, repositoryId, prNumber });

  await ReviewModel.findByIdAndUpdate(reviewId, {
    status: "PROCESSING",
    startedAt: new Date(),
  });
  reviewLogger.info("review.started");

  const repoConfig = await ReviewConfigurationModel.findOne({ repositoryId });
  const repo = await RepositoryModel.findById(repositoryId);

  let pr: Awaited<ReturnType<typeof getPullRequest>>;
  try {
    pr = await getPullRequest(installationGithubId, repoOwner, repoName, prNumber);
  } catch (err) {
    reviewLogger.error({ err }, "Failed to fetch PR from GitHub");
    throw err;
  }

  let allFiles: Awaited<ReturnType<typeof getPullRequestFiles>>;
  try {
    allFiles = await getPullRequestFiles(installationGithubId, repoOwner, repoName, prNumber);
  } catch (err) {
    reviewLogger.error({ err }, "Failed to fetch PR files from GitHub");
    throw err;
  }

  const filteredFiles = filterFiles(allFiles, {
    ignoredFilePatterns: repoConfig?.ignoredFilePatterns ?? [],
    ignoredDirectories: repoConfig?.ignoredDirectories,
    maxFilesPerReview: repoConfig?.maxFilesPerReview ?? ENV.MAX_FILES_PER_REVIEW,
    maxFileSizeBytes: ENV.MAX_FILE_SIZE_BYTES,
  });

  reviewLogger.info({ total: allFiles.length, filtered: filteredFiles.length }, "Files filtered");

  if (filteredFiles.length === 0) {
    await ReviewModel.findByIdAndUpdate(reviewId, {
      status: "COMPLETED",
      completedAt: new Date(),
      duration: 0,
      filesReviewed: 0,
      summary: "No reviewable files found in this PR after filtering.",
      score: 100,
      totalFindings: 0,
    });
    reviewLogger.info("review.completed - no reviewable files");
    return;
  }

  const chunks = chunkFiles(filteredFiles, ENV.MAX_REVIEW_TOKENS);
  reviewLogger.info({ chunks: chunks.length }, "Files chunked for AI analysis");

  const aiProvider = getAIProvider();
  const allRawFindings: Array<{
    severity: FindingSeverity;
    category: FindingCategory;
    title: string;
    description: string;
    filePath: string;
    lineStart: number | null;
    lineEnd: number | null;
    codeSnippet: string | null;
    suggestion: string | null;
    confidence: number;
  }> = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let aiSummary = "";
  let aiProviderName = "";
  let aiModelName = "";
  let promptVersionUsed = "";

  for (const chunk of chunks) {
    reviewLogger.info({ chunk: chunk.chunkNumber, total: chunk.totalChunks }, "review.ai.chunk.started");

    const aiOutput = await aiProvider.reviewCode({
      repository: {
        fullName: `${repoOwner}/${repoName}`,
        owner: repoOwner,
        name: repoName,
        language: repo?.language ?? null,
      },
      pullRequest: {
        number: prNumber,
        title: pr.title,
        description: pr.body,
        baseBranch: pr.baseBranch,
        headBranch: pr.headBranch,
        author: pr.author,
      },
      files: chunk.files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
      configuration: {
        enabledCategories: repoConfig?.enabledCategories ?? ["BUG", "SECURITY", "PERFORMANCE", "CODE_QUALITY", "ERROR_HANDLING"],
        reviewStrictness: repoConfig?.reviewStrictness ?? "balanced",
        minimumSeverity: repoConfig?.minimumSeverity ?? "LOW",
      },
      promptVersion: "v1",
      ...(chunk.totalChunks > 1 && {
        chunkInfo: { chunkNumber: chunk.chunkNumber, totalChunks: chunk.totalChunks },
      }),
    });

    reviewLogger.info({ findings: aiOutput.findings.length, chunk: chunk.chunkNumber }, "review.ai.chunk.completed");

    if (chunk.chunkNumber === 1) {
      aiSummary = aiOutput.summary;
      aiProviderName = aiOutput.provider;
      aiModelName = aiOutput.model;
      promptVersionUsed = aiOutput.promptVersion;
    }

    totalInputTokens += aiOutput.inputTokens ?? 0;
    totalOutputTokens += aiOutput.outputTokens ?? 0;
    allRawFindings.push(...aiOutput.findings);
  }

  const counts: FindingCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let savedFindings = 0;

  const severityOrder = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const minSeverity = repoConfig?.minimumSeverity ?? "LOW";
  const enabledCats = repoConfig?.enabledCategories ?? [];

  for (const finding of allRawFindings) {
    if (severityOrder.indexOf(finding.severity) < severityOrder.indexOf(minSeverity)) continue;
    if (enabledCats.length > 0 && !enabledCats.includes(finding.category)) continue;

    const fingerprint = generateFindingFingerprint({
      repositoryId,
      pullRequestNumber: prNumber,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      category: finding.category,
      title: finding.title,
    });

    try {
      await ReviewFindingModel.create({
        reviewId, repositoryId, pullRequestId,
        severity: finding.severity,
        category: finding.category,
        title: finding.title,
        description: finding.description,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        codeSnippet: finding.codeSnippet,
        suggestion: finding.suggestion,
        confidence: finding.confidence,
        fingerprint,
        status: "OPEN",
      });

      const sev = finding.severity.toLowerCase() as keyof FindingCounts;
      if (sev in counts) counts[sev]++;
      savedFindings++;
    } catch (err: any) {
      if (err.code === 11000) {
        reviewLogger.debug({ fingerprint }, "Duplicate finding, skipping");
      } else {
        reviewLogger.warn({ err }, "Failed to save finding");
      }
    }
  }

  const score = calculateScore(counts);
  const storedFindings = await ReviewFindingModel.find({ reviewId });
  const githubComments: GitHubReviewComment[] = storedFindings
    .filter((f) => f.filePath && f.lineStart && f.lineStart > 0)
    .slice(0, 50)
    .map((finding) => ({
      path: finding.filePath,
      line: finding.lineStart!,
      body: formatInlineComment({
        severity: finding.severity,
        category: finding.category,
        title: finding.title,
        description: finding.description,
        suggestion: finding.suggestion,
        confidence: finding.confidence,
      }),
    }));

  const reviewBody = formatGitHubReviewBody({
    score,
    filesReviewed: filteredFiles.length,
    counts,
    summary: aiSummary,
    provider: aiProviderName,
    model: aiModelName,
  });

  let githubReviewId: number | null = null;
  let githubReviewUrl: string | null = null;

  try {
    const githubReview = await createPullRequestReview(
      installationGithubId, repoOwner, repoName,
      prNumber, commitSha, reviewBody, githubComments
    );
    githubReviewId = githubReview.id;
    githubReviewUrl = githubReview.htmlUrl;
    reviewLogger.info({ githubReviewId, comments: githubComments.length }, "review.github.comment.created");
  } catch (err) {
    reviewLogger.error({ err }, "Failed to post GitHub review — review data preserved");
  }

  const completedAt = new Date();
  const review = await ReviewModel.findById(reviewId);
  const duration = completedAt.getTime() - (review?.startedAt?.getTime() ?? completedAt.getTime());

  await ReviewModel.findByIdAndUpdate(reviewId, {
    status: "COMPLETED",
    completedAt,
    duration,
    filesReviewed: filteredFiles.length,
    linesAdded: pr.additions,
    linesRemoved: pr.deletions,
    totalFindings: savedFindings,
    criticalFindings: counts.critical,
    highFindings: counts.high,
    mediumFindings: counts.medium,
    lowFindings: counts.low,
    infoFindings: counts.info,
    score,
    summary: aiSummary,
    githubReviewId,
    githubReviewUrl,
    aiProvider: aiProviderName,
    aiModel: aiModelName,
    promptVersion: promptVersionUsed,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    error: null,
  });

  await RepositoryModel.findByIdAndUpdate(repositoryId, {
    lastReviewedAt: completedAt,
    $inc: { totalReviews: 1 },
  });

  reviewLogger.info({ score, findings: savedFindings, duration }, "review.completed");
}

export function createCodeReviewWorker() {
  const worker = new Worker<CodeReviewJobData>(
    "code-review",
    async (job) => {
      const jobLogger = logger.child({ jobId: job.id });
      jobLogger.info("Code review job started");

      try {
        await processCodeReview(job.data);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await ReviewModel.findByIdAndUpdate(job.data.reviewId, {
          status: "FAILED",
          error: error.message,
          completedAt: new Date(),
        }).catch(() => {});
        jobLogger.error({ err }, "Code review job failed");
        throw err;
      }
    },
    {
      connection: getQueueConnection(),
      concurrency: 3,
      limiter: { max: 10, duration: 60000 },
    }
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "Code review job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "Code review job permanently failed"));

  return worker;
}
