import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { ENV } from "../config/env.js";
import logger from "../utils/logger.js";

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const requestId = req.requestId;

  // ── ApiError (operational) ──────────────────────────────────────────────
  if (err instanceof ApiError) {
    logger.warn(
      { requestId, statusCode: err.statusCode, code: err.code },
      err.message
    );
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      requestId,
    });
    return;
  }

  // ── Zod validation error ────────────────────────────────────────────────
  if (err instanceof ZodError) {
    logger.warn({ requestId, issues: err.issues }, "Validation error");
    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input data",
        details: err.flatten().fieldErrors,
      },
      requestId,
    });
    return;
  }

  // ── Unknown / unexpected errors ─────────────────────────────────────────
  const error = err instanceof Error ? err : new Error(String(err));

  logger.error(
    { requestId, err: error, stack: error.stack },
    "Unexpected server error"
  );

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        ENV.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : error.message,
    },
    requestId,
    ...(ENV.NODE_ENV !== "production" && { stack: error.stack }),
  });
}
