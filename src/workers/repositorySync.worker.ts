import { Worker, type Job } from "bullmq";
import { ENV } from "../config/env.js";
import { getInstallationRepositories } from "../github/github.service.js";
import { RepositoryModel } from "../models/Repository.model.js";
import { GitHubInstallationModel } from "../models/GitHubInstallation.model.js";
import { ReviewConfigurationModel } from "../models/ReviewConfiguration.model.js";
import logger from "../utils/logger.js";

export function createRepositorySyncWorker() {
  const worker = new Worker(
    "repository-sync",
    async (job: Job) => {
      const { installationId, installationGithubId } = job.data;
      
      const installation = await GitHubInstallationModel.findById(installationId);
      if (!installation || !installation.active) {
        logger.info({ installationId }, "Installation not found or inactive, skipping sync");
        return;
      }

      const repos = await getInstallationRepositories(installationGithubId);

      const bulkOps = repos.map((repo: any) => ({
        updateOne: {
          filter: { githubRepositoryId: repo.githubRepositoryId },
          update: {
            $set: {
              name: repo.name,
              fullName: repo.fullName,
              owner: repo.fullName.split('/')[0],
              private: repo.private,
              htmlUrl: repo.htmlUrl,
              description: repo.description ?? "",
              defaultBranch: repo.defaultBranch,
              language: repo.language ?? "",
              installationId: installation._id,
              userId: installation.userId,
            },
          },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        const result = await RepositoryModel.bulkWrite(bulkOps as any);
        
        // Ensure default configurations exist for all created repositories
        const allRepos = await RepositoryModel.find({ installationId: installation._id });
        const configOps = allRepos.map((repo) => ({
          updateOne: {
            filter: { repositoryId: repo._id },
            update: {
              $setOnInsert: {
                repositoryId: repo._id,
              }
            },
            upsert: true
          }
        }));
        
        if (configOps.length > 0) {
          await ReviewConfigurationModel.bulkWrite(configOps as any);
        }

        logger.info(
          { installationId, modified: result.modifiedCount, upserted: result.upsertedCount },
          "Repository sync completed"
        );
      }
    },
    {
      connection: {
        host: ENV.REDIS_HOST,
        port: ENV.REDIS_PORT,
      },
      concurrency: 2,
    }
  );

  worker.on("error", (err) => logger.error({ err }, "repository-sync worker error"));
  return worker;
}
