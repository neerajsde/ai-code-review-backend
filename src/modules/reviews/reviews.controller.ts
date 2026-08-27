import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ReviewModel } from "../../models/Review.model.js";
import { ReviewFindingModel } from "../../models/ReviewFinding.model.js";
import { RepositoryModel } from "../../models/Repository.model.js";
import { PullRequestModel } from "../../models/PullRequest.model.js";
import { GitHubInstallationModel } from "../../models/GitHubInstallation.model.js";
import { codeReviewQueue } from "../../queues/index.js";
import logger from "../../utils/logger.js";

export const getReviews = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const { status, repositoryId } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { userId };
  if (status) filter.status = status;
  if (repositoryId) filter.repositoryId = repositoryId;

  const [reviews, total] = await Promise.all([
    ReviewModel.find(filter)
      .populate("pullRequestId", "number title headBranch baseBranch githubUrl")
      .populate("repositoryId", "name fullName owner")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ReviewModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: reviews,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getReview = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const review = await ReviewModel.findOne({ _id: id, userId })
    .populate("pullRequestId", "number title headBranch baseBranch githubUrl author")
    .populate("repositoryId", "name fullName owner htmlUrl")
    .lean();

  if (!review) {
    throw new ApiError(404, "Review not found", "REVIEW_NOT_FOUND");
  }

  res.json({ success: true, data: review });
});

export const getReviewFindings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { severity, category } = req.query as Record<string, string>;

  const review = await ReviewModel.findOne({ _id: id, userId });
  if (!review) {
    throw new ApiError(404, "Review not found", "REVIEW_NOT_FOUND");
  }

  const filter: Record<string, unknown> = { reviewId: id };
  if (severity) filter.severity = severity;
  if (category) filter.category = category;

  const findings = await ReviewFindingModel.find(filter)
    .sort({ severity: 1, confidence: -1 })
    .lean();

  res.json({ success: true, data: findings });
});

export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { repositoryId, pullRequestId } = req.body as { repositoryId: string; pullRequestId: string };

  if (!repositoryId || !pullRequestId) {
    throw new ApiError(400, "repositoryId and pullRequestId are required", "MISSING_FIELDS");
  }

  const repository = await RepositoryModel.findOne({ _id: repositoryId, userId });
  if (!repository) {
    throw new ApiError(404, "Repository not found or access denied", "REPOSITORY_NOT_FOUND");
  }

  const pullRequest = await PullRequestModel.findOne({ _id: pullRequestId, repositoryId, userId });
  if (!pullRequest) {
    throw new ApiError(404, "Pull request not found", "PR_NOT_FOUND");
  }

  const installation = await GitHubInstallationModel.findOne({
    _id: repository.installationId,
    userId,
    active: true,
  });
  if (!installation) {
    throw new ApiError(400, "GitHub installation not found or inactive", "INSTALLATION_NOT_FOUND");
  }

  // Check for existing active review
  const existingReview = await ReviewModel.findOne({
    pullRequestId,
    commitSha: pullRequest.headSha,
    status: { $in: ["QUEUED", "PROCESSING"] },
  });
  if (existingReview) {
    throw new ApiError(409, "A review for this commit is already in progress", "REVIEW_IN_PROGRESS");
  }

  const review = await ReviewModel.create({
    pullRequestId,
    repositoryId,
    userId,
    installationId: installation._id,
    status: "QUEUED",
    trigger: "MANUAL",
    commitSha: pullRequest.headSha,
  });

  const job = await codeReviewQueue.add(`review-${review._id}`, {
    reviewId: review._id.toString(),
    repositoryId: repository._id.toString(),
    pullRequestId: pullRequest._id.toString(),
    installationId: installation._id.toString(),
    installationGithubId: installation.installationId,
    commitSha: pullRequest.headSha,
    prNumber: pullRequest.number,
    repoOwner: repository.owner,
    repoName: repository.name,
    trigger: "MANUAL",
  }, { jobId: `review-${review._id}` });

  await ReviewModel.findByIdAndUpdate(review._id, { jobId: job.id });

  logger.info({ reviewId: review._id, jobId: job.id }, "Manual review created");
  res.status(202).json({ success: true, data: review });
});

export const retryReview = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const failedReview = await ReviewModel.findOne({ _id: id, userId, status: "FAILED" });
  if (!failedReview) {
    throw new ApiError(404, "Failed review not found", "REVIEW_NOT_FOUND");
  }

  const repository = await RepositoryModel.findById(failedReview.repositoryId);
  const installation = await GitHubInstallationModel.findById(failedReview.installationId);

  if (!repository || !installation) {
    throw new ApiError(400, "Repository or installation not available", "RESOURCE_NOT_FOUND");
  }

  const pullRequest = await PullRequestModel.findById(failedReview.pullRequestId);
  if (!pullRequest) {
    throw new ApiError(404, "Pull request not found", "PR_NOT_FOUND");
  }

  const retryReview = await ReviewModel.create({
    pullRequestId: failedReview.pullRequestId,
    repositoryId: failedReview.repositoryId,
    userId,
    installationId: failedReview.installationId,
    status: "QUEUED",
    trigger: "RETRY",
    commitSha: failedReview.commitSha,
    retryCount: failedReview.retryCount + 1,
  });

  const job = await codeReviewQueue.add(`review-${retryReview._id}`, {
    reviewId: retryReview._id.toString(),
    repositoryId: repository._id.toString(),
    pullRequestId: pullRequest._id.toString(),
    installationId: installation._id.toString(),
    installationGithubId: installation.installationId,
    commitSha: failedReview.commitSha,
    prNumber: pullRequest.number,
    repoOwner: repository.owner,
    repoName: repository.name,
    trigger: "RETRY",
  });

  await ReviewModel.findByIdAndUpdate(retryReview._id, { jobId: job.id });

  logger.info({ reviewId: retryReview._id, originalReviewId: id }, "Review retry queued");
  res.status(202).json({ success: true, data: retryReview });
});

export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalReviews, reviewsThisMonth, totalRepos, completedReviews, failedReviews] = await Promise.all([
    ReviewModel.countDocuments({ userId }),
    ReviewModel.countDocuments({ userId, createdAt: { $gte: startOfMonth } }),
    RepositoryModel.countDocuments({ userId, enabled: true }),
    ReviewModel.countDocuments({ userId, status: "COMPLETED" }),
    ReviewModel.countDocuments({ userId, status: "FAILED" }),
  ]);

  const avgScoreResult = await ReviewModel.aggregate([
    { $match: { userId: { $toString: userId }, status: "COMPLETED", score: { $ne: null } } },
    { $group: { _id: null, avg: { $avg: "$score" }, totalCritical: { $sum: "$criticalFindings" }, totalHigh: { $sum: "$highFindings" } } },
  ]);

  const stats = avgScoreResult[0] ?? { avg: null, totalCritical: 0, totalHigh: 0 };

  // Reviews over time (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const reviewsOverTime = await ReviewModel.aggregate([
    { $match: { userId: { $toString: userId }, createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 }, avgScore: { $avg: "$score" } } },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    success: true,
    data: {
      totalReviews,
      reviewsThisMonth,
      totalRepositories: totalRepos,
      completedReviews,
      failedReviews,
      avgScore: stats.avg !== null ? Math.round((stats.avg ?? 0) * 10) / 10 : null,
      totalCriticalFindings: stats.totalCritical ?? 0,
      totalHighFindings: stats.totalHigh ?? 0,
      reviewsOverTime,
    },
  });
});
