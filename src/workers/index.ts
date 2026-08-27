import { createCodeReviewWorker } from "./codeReview.worker.js";
import { createRepositorySyncWorker } from "./repositorySync.worker.js";
import { createGithubCommentWorker } from "./githubComment.worker.js";
import logger from "../utils/logger.js";

let workers: any[] = [];

export function startWorkers(): void {
  workers.push(createCodeReviewWorker());
  workers.push(createRepositorySyncWorker());
  workers.push(createGithubCommentWorker());
  logger.info("✅ All workers started");
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
  logger.info("✅ All workers stopped");
}

// Start workers
startWorkers();
