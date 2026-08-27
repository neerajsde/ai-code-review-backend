import express from "express";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { getReviewSettings, updateReviewSettings, updateAccountSettings } from "./settings.controller.js";

const router = express.Router();

router.get("/review/:repositoryId", authenticate, getReviewSettings);
router.patch("/review/:repositoryId", authenticate, updateReviewSettings);
router.patch("/account", authenticate, updateAccountSettings);

export default router;
