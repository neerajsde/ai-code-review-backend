import express from "express";
import { githubLogin, githubCallback, logout, getMe } from "./auth.controller.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

// Stricter rate limit for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT",
      message: "Too many authentication requests",
    },
  },
});

/**
 * @route GET /api/v1/auth/github
 * @desc  Initiate GitHub OAuth login
 */
router.get("/github", authRateLimit, githubLogin);

/**
 * @route GET /api/v1/auth/github/callback
 * @desc  GitHub OAuth callback
 */
router.get("/github/callback", githubCallback);

/**
 * @route POST /api/v1/auth/logout
 * @desc  Clear auth session
 */
router.post("/logout", authenticate, logout);

/**
 * @route GET /api/v1/auth/me
 * @desc  Get current authenticated user
 */
router.get("/me", authenticate, getMe);

export default router;
