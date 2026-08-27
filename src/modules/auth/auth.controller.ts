import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  initiateGitHubAuth,
  handleGitHubCallback,
  getCurrentUser,
} from "./auth.service.js";
import { ENV } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import logger from "../../utils/logger.js";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: ENV.COOKIE_SECURE,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  signed: true,
};

export const githubLogin = asyncHandler(async (req: Request, res: Response) => {
  const { url, state } = initiateGitHubAuth();
  // Store state in signed cookie for CSRF protection
  res.cookie("oauth_state", state, {
    ...COOKIE_OPTS,
    maxAge: 10 * 60 * 1000, // 10 min
  });
  res.redirect(url);
});

export const githubCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const { code, state } = req.query as { code: string; state: string };

    if (!code || !state) {
      throw new ApiError(400, "Missing code or state parameter", "MISSING_PARAMS");
    }

    // Validate state cookie
    const cookieState = req.signedCookies["oauth_state"] as string | undefined;
    if (!cookieState || cookieState !== state) {
      throw new ApiError(400, "State mismatch — possible CSRF attack", "STATE_MISMATCH");
    }

    res.clearCookie("oauth_state");

    const { user, token } = await handleGitHubCallback(code, state);

    // Set auth token in signed HttpOnly cookie
    res.cookie("auth_token", token, COOKIE_OPTS);

    logger.info({ userId: user.id }, "GitHub OAuth callback completed");

    // Redirect to frontend dashboard
    res.redirect(`${ENV.FRONTEND_URL}/dashboard`);
  }
);

export const logout = asyncHandler(async (req: Request, res: Response) => {
  res.clearCookie("auth_token");
  res.json({ success: true, message: "Logged out successfully" });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
  }

  const user = await getCurrentUser(userId);
  res.json({ success: true, data: user });
});