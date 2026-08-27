import type { Request, Response, NextFunction } from "express";
import { verifyJWT } from "../modules/auth/auth.service.js";
import { UserModel } from "../models/User.model.js";
import { ApiError } from "../utils/api-error.js";
import type { IUserPublic } from "../models/User.model.js";

// ─── Augment Express Request ───────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: IUserPublic;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract token from signed cookie or Authorization header
    let token: string | undefined =
      req.signedCookies["auth_token"] as string | undefined;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
    }

    // 2. Verify JWT
    let payload: { sub: string };
    try {
      payload = verifyJWT(token);
    } catch {
      throw new ApiError(401, "Invalid or expired token", "TOKEN_INVALID");
    }

    // 3. Load user
    const user = await UserModel.findById(payload.sub);
    if (!user) {
      throw new ApiError(401, "User not found", "USER_NOT_FOUND");
    }

    if (user.status === "suspended") {
      throw new ApiError(403, "Account suspended", "ACCOUNT_SUSPENDED");
    }

    // 4. Attach to request
    req.user = user.toPublic();

    next();
  } catch (err) {
    next(err);
  }
}

/** Middleware that tries to authenticate but does not fail if no token */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authenticate(req, res, () => {});
  } catch {
    // Not authenticated — continue anyway
  }
  next();
}
