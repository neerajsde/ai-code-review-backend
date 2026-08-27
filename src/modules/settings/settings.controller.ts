import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ReviewConfigurationModel } from "../../models/ReviewConfiguration.model.js";
import { RepositoryModel } from "../../models/Repository.model.js";
import { UserModel } from "../../models/User.model.js";

export const getReviewSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { repositoryId } = req.params;

  const repo = await RepositoryModel.findOne({ _id: repositoryId, userId });
  if (!repo) {
    throw new ApiError(404, "Repository not found", "REPOSITORY_NOT_FOUND");
  }

  const config = await ReviewConfigurationModel.findOneAndUpdate(
    { repositoryId },
    { $setOnInsert: { repositoryId, userId } },
    { upsert: true, new: true }
  );

  res.json({ success: true, data: config });
});

export const updateReviewSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { repositoryId } = req.params;

  const repo = await RepositoryModel.findOne({ _id: repositoryId, userId });
  if (!repo) {
    throw new ApiError(404, "Repository not found", "REPOSITORY_NOT_FOUND");
  }

  const allowedFields = [
    "reviewOnOpen", "reviewOnSync", "reviewOnReopen", "reviewDraftPRs",
    "minimumSeverity", "ignoredFilePatterns", "ignoredDirectories",
    "enabledCategories", "aiProvider", "aiModel", "reviewStrictness", "maxFilesPerReview",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const config = await ReviewConfigurationModel.findOneAndUpdate(
    { repositoryId },
    { $set: updates, $setOnInsert: { repositoryId, userId } },
    { upsert: true, new: true }
  );

  res.json({ success: true, data: config });
});

export const updateAccountSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { displayName } = req.body as { displayName?: string };

  const updates: Record<string, unknown> = {};
  if (displayName && typeof displayName === "string") {
    updates.displayName = displayName.trim().slice(0, 100);
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields to update", "NO_UPDATES");
  }

  const user = await UserModel.findByIdAndUpdate(userId, { $set: updates }, { new: true });
  if (!user) {
    throw new ApiError(404, "User not found", "USER_NOT_FOUND");
  }

  res.json({ success: true, data: user.toPublic() });
});
