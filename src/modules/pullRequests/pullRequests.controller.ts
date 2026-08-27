import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { PullRequestModel } from "../../models/PullRequest.model.js";
import { ReviewModel } from "../../models/Review.model.js";

export const getPullRequests = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const { status, repositoryId } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { userId };
  if (status) filter.status = status;
  if (repositoryId) filter.repositoryId = repositoryId;

  const [prs, total] = await Promise.all([
    PullRequestModel.find(filter)
      .populate("repositoryId", "name fullName owner")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PullRequestModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: prs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getPullRequest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const pr = await PullRequestModel.findOne({ _id: id, userId })
    .populate("repositoryId", "name fullName owner htmlUrl")
    .lean();

  if (!pr) {
    throw new ApiError(404, "Pull request not found", "PR_NOT_FOUND");
  }

  const reviews = await ReviewModel.find({ pullRequestId: id })
    .sort({ createdAt: -1 })
    .select("status score totalFindings criticalFindings highFindings createdAt commitSha trigger")
    .lean();

  res.json({ success: true, data: { pullRequest: pr, reviews } });
});
