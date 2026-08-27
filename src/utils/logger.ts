import pino from "pino";
import { ENV } from "../config/env.js";

const logger = pino({
  level: ENV.LOG_LEVEL ?? "info",
  transport:
    ENV.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    app: ENV.APP_NAME,
    env: ENV.NODE_ENV,
  },
  redact: {
    paths: ["req.headers.authorization", "*.githubAccessToken", "*.password"],
    censor: "[REDACTED]",
  },
});

export default logger;
