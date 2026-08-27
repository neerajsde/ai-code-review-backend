import express from "express";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { getRepositories, getRepository, updateRepository, getRepositoryStats } from "./repositories.controller.js";

const router = express.Router();

router.get("/", authenticate, getRepositories);
router.get("/:id", authenticate, getRepository);
router.patch("/:id", authenticate, updateRepository);
router.get("/:id/stats", authenticate, getRepositoryStats);

export default router;
