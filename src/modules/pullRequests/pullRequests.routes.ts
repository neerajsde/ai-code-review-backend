import express from "express";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { getPullRequests, getPullRequest } from "./pullRequests.controller.js";

const router = express.Router();

router.get("/", authenticate, getPullRequests);
router.get("/:id", authenticate, getPullRequest);

export default router;
