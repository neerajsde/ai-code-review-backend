import express from "express";
import { getMongoStatus } from "../config/database.js";
import { getRedisStatus } from "../config/redis.config.js";
import authRoutes from "../modules/auth/auth.routes.js";
import githubRoutes from "../modules/github/github.routes.js";
import repositoriesRoutes from "../modules/repositories/repositories.routes.js";
import reviewsRoutes from "../modules/reviews/reviews.routes.js";
import pullRequestsRoutes from "../modules/pullRequests/pullRequests.routes.js";
import settingsRoutes from "../modules/settings/settings.routes.js";
import webhookRoutes from "../modules/webhooks/webhook.routes.js";

const router = express.Router();

// Health check
router.get("/health", (_req, res) => {
  const mongoStatus = getMongoStatus();
  const redisStatus = getRedisStatus();
  const healthy = mongoStatus === "connected" && redisStatus === "connected";

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? "healthy" : "degraded",
    services: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
router.use("/auth", authRoutes);

// GitHub App routes
router.use("/github", githubRoutes);

// Resource routes
router.use("/repositories", repositoriesRoutes);
router.use("/reviews", reviewsRoutes);
router.use("/pull-requests", pullRequestsRoutes);
router.use("/settings", settingsRoutes);

// Webhook (raw body handling done inside)
router.use("/webhooks", webhookRoutes);

export default router;
