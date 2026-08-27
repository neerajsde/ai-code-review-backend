import express from "express";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import {
  getInstallationUrl,
  handleInstallationCallback,
  getInstallations,
  syncRepositories,
  disconnectInstallation,
} from "./github.controller.js";

const router = express.Router();

router.get("/install-url", authenticate, getInstallationUrl);
router.get("/callback", authenticate, handleInstallationCallback);
router.get("/installations", authenticate, getInstallations);
router.post("/installations/:installationId/sync", authenticate, syncRepositories);
router.delete("/installations/:installationId", authenticate, disconnectInstallation);

export default router;
