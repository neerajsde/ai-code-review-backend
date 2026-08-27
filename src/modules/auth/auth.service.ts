import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { ENV } from "../../config/env.js";
import { UserModel } from "../../models/User.model.js";
import {
  getAuthenticatedUser,
  buildGitHubOAuthUrl,
  exchangeCodeForToken,
} from "../../github/github.service.js";
import { ApiError } from "../../utils/api-error.js";
import logger from "../../utils/logger.js";
import type { IUser, IUserPublic } from "../../models/User.model.js";

// Simple in-memory OAuth state store (use Redis in production for multi-instance)
const oauthStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateState(): string {
  const state = randomBytes(32).toString("hex");
  oauthStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

function validateState(state: string): boolean {
  const expiry = oauthStates.get(state);
  oauthStates.delete(state);
  if (!expiry) return false;
  return Date.now() < expiry;
}

export function signJWT(userId: string): string {
  return jwt.sign({ sub: userId }, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN,
    issuer: "ai-code-review",
  } as jwt.SignOptions);
}

export function verifyJWT(token: string): { sub: string } {
  return jwt.verify(token, ENV.JWT_SECRET, {
    issuer: "ai-code-review",
  }) as { sub: string };
}

// ─── Auth Flow ────────────────────────────────────────────────────────────────

export function initiateGitHubAuth(): { url: string; state: string } {
  const state = generateState();
  const url = buildGitHubOAuthUrl(state);
  return { url, state };
}

export async function handleGitHubCallback(
  code: string,
  state: string
): Promise<{ user: IUserPublic; token: string }> {
  // 1. Validate OAuth state
  if (!validateState(state)) {
    throw new ApiError(400, "Invalid or expired OAuth state", "INVALID_OAUTH_STATE");
  }

  // 2. Exchange code for token
  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(code);
  } catch (err) {
    logger.error({ err }, "Failed to exchange GitHub OAuth code");
    throw new ApiError(502, "Failed to authenticate with GitHub", "GITHUB_AUTH_FAILED");
  }

  // 3. Fetch GitHub user info
  let githubUser: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    githubUser = await getAuthenticatedUser(accessToken);
  } catch (err) {
    logger.error({ err }, "Failed to fetch GitHub user info");
    throw new ApiError(502, "Failed to fetch user info from GitHub", "GITHUB_USER_FETCH_FAILED");
  }

  // 4. Upsert user in MongoDB
  const user = (await UserModel.findOneAndUpdate(
    { githubId: githubUser.githubId },
    {
      $set: {
        username: githubUser.username,
        displayName: githubUser.displayName,
        email: githubUser.email,
        avatarUrl: githubUser.avatarUrl,
        githubAccessToken: accessToken,
        lastLoginAt: new Date(),
        status: "active",
      },
      $setOnInsert: {
        githubId: githubUser.githubId,
        role: "user",
      },
    },
    { upsert: true, new: true, runValidators: true }
  )) as IUser;

  // 5. Issue JWT
  const token = signJWT((user._id as unknown as string).toString());

  logger.info(
    { userId: user._id, username: user.username },
    "User authenticated via GitHub OAuth"
  );

  return { user: user.toPublic(), token };
}

export async function getCurrentUser(userId: string): Promise<IUserPublic> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found", "USER_NOT_FOUND");
  }
  if (user.status === "suspended") {
    throw new ApiError(403, "Account suspended", "ACCOUNT_SUSPENDED");
  }
  return user.toPublic();
}
