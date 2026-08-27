import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";

export function notFoundMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(
    new ApiError(
      404,
      `Route not found: ${req.method} ${req.path}`,
      "ROUTE_NOT_FOUND"
    )
  );
}
