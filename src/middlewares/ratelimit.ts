import rateLimit from "express-rate-limit";
import { ENV } from "../config/env.js";

export const authRateLimit = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: ENV.RATE_LIMIT_MAX_REQUESTS || 10,
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: Math.ceil(
      (ENV.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000) / 1000
    ),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many authentication attempts, please try again later."
    });
  },
});