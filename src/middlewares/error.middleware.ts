import type { Request, Response, NextFunction } from "express";
import { ENV } from "../config/env.js";
import logger from "../utils/logger.js";

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  
  if(ENV.NODE_ENV === "development"){
    console.error(err);
  }
  else {
    logger.error(`\nstatus: ${err.status || err.statusCode || 500}, \t${err.message || "Internal Server Error"}`)
  }

  res.status(err.status || err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};
