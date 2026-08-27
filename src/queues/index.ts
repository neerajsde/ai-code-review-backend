import { Queue } from "bullmq";
import { ENV } from "../config/env.js";

const redisConnection = {
  host: ENV.REDIS_HOST,
  port: ENV.REDIS_PORT,
};

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000,
  },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};

// ─── Code Review Queue ────────────────────────────────────────────────────────
export interface CodeReviewJobData {
  reviewId: string;
  repositoryId: string;
  pullRequestId: string;
  installationId: string;
  installationGithubId: number;
  commitSha: string;
  prNumber: number;
  repoOwner: string;
  repoName: string;
  trigger: "WEBHOOK" | "MANUAL" | "RETRY";
}

export const codeReviewQueue = new Queue<CodeReviewJobData>("code-review", {
  connection: redisConnection,
  defaultJobOptions,
});

// ─── GitHub Comment Queue ─────────────────────────────────────────────────────
export interface GitHubCommentJobData {
  reviewId: string;
  repositoryId: string;
  pullRequestId: string;
  installationGithubId: number;
  prNumber: number;
  repoOwner: string;
  repoName: string;
  commitSha: string;
}

export const githubCommentQueue = new Queue<GitHubCommentJobData>(
  "github-comment",
  {
    connection: redisConnection,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 5, // Retry comment posting more aggressively
    },
  }
);

// ─── Repository Sync Queue ────────────────────────────────────────────────────
export interface RepositorySyncJobData {
  installationId: string;
  installationGithubId: number;
  userId: string;
}

export const repositorySyncQueue = new Queue<RepositorySyncJobData>(
  "repository-sync",
  {
    connection: redisConnection,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
    },
  }
);

export function getQueueConnection() {
  return redisConnection;
}
