import express from "express";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { getReviews, getReview, getReviewFindings, createReview, retryReview, getDashboardStats } from "./reviews.controller.js";

const router = express.Router();

router.get("/stats/dashboard", authenticate, getDashboardStats);
router.get("/", authenticate, getReviews);
router.get("/:id", authenticate, getReview);
router.get("/:id/findings", authenticate, getReviewFindings);
router.post("/", authenticate, createReview);
router.post("/:id/retry", authenticate, retryReview);

export default router;
