import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { RepositoryModel } from "../../models/Repository.model.js";
import { ReviewModel } from "../../models/Review.model.js";

export const getRepositories = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const [repositories, total] = await Promise.all([
    RepositoryModel.find({ userId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RepositoryModel.countDocuments({ userId }),
  ]);

  res.json({
    success: true,
    data: repositories,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getRepository = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const repository = await RepositoryModel.findOne({ _id: id, userId });
  if (!repository) {
    throw new ApiError(404, "Repository not found", "REPOSITORY_NOT_FOUND");
  }

  res.json({ success: true, data: repository });
});

export const updateRepository = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { reviewEnabled, enabled } = req.body as { reviewEnabled?: boolean; enabled?: boolean };

  const repository = await RepositoryModel.findOneAndUpdate(
    { _id: id, userId },
    { $set: { ...(reviewEnabled !== undefined && { reviewEnabled }), ...(enabled !== undefined && { enabled }) } },
    { new: true }
  );

  if (!repository) {
    throw new ApiError(404, "Repository not found", "REPOSITORY_NOT_FOUND");
  }

  res.json({ success: true, data: repository });
});

export const getRepositoryStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const repository = await RepositoryModel.findOne({ _id: id, userId });
  if (!repository) {
    throw new ApiError(404, "Repository not found", "REPOSITORY_NOT_FOUND");
  }

  const [totalReviews, completedReviews, failedReviews] = await Promise.all([
    ReviewModel.countDocuments({ repositoryId: id }),
    ReviewModel.countDocuments({ repositoryId: id, status: "COMPLETED" }),
    ReviewModel.countDocuments({ repositoryId: id, status: "FAILED" }),
  ]);

  const avgScoreResult = await ReviewModel.aggregate([
    { $match: { repositoryId: repository._id, status: "COMPLETED", score: { $ne: null } } },
    { $group: { _id: null, avgScore: { $avg: "$score" } } },
  ]);

  const avgScore = avgScoreResult[0]?.avgScore ?? null;

  res.json({
    success: true,
    data: {
      totalReviews,
      completedReviews,
      failedReviews,
      avgScore: avgScore !== null ? Math.round(avgScore * 10) / 10 : null,
    },
  });
});
