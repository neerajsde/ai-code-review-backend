import { Worker, type Job } from "bullmq";
import { ENV } from "../config/env.js";
import { createPullRequestReview } from "../github/github.service.js";
import { ReviewModel } from "../models/Review.model.js";
import logger from "../utils/logger.js";

export function createGithubCommentWorker() {
  const worker = new Worker(
    "github-comment",
    async (job: Job) => {
      const { reviewId, installationGithubId, repoOwner, repoName, prNumber, commitSha, body, event, comments } = job.data;
      
      try {
        const result = await createPullRequestReview(
          installationGithubId,
          repoOwner,
          repoName,
          prNumber,
          commitSha,
          body,
          comments || []
        );
        
        await ReviewModel.findByIdAndUpdate(reviewId, {
          githubReviewUrl: result.htmlUrl
        });
        
        logger.info({ reviewId, commentUrl: result.htmlUrl }, "Successfully published GitHub review comment");
      } catch (error) {
        logger.error({ err: error, reviewId }, "Failed to publish GitHub review comment");
        throw error;
      }
    },
    {
      connection: {
        host: ENV.REDIS_HOST,
        port: ENV.REDIS_PORT,
      },
      concurrency: 5,
    }
  );

  worker.on("error", (err) => logger.error({ err }, "github-comment worker error"));
  return worker;
}
