import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { ENV } from "./config/env.js";
import requestLogger from "./middlewares/logger.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.js";
import apiRoutes from "./routes/api.routes.js";

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = ENV.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    credentials: true,
  })
);

// ─── Trust proxy ─────────────────────────────────────────────────────────────
app.set("trust proxy", 1);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalRateLimit = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS,
  max: ENV.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalRateLimit);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(
  express.json({
    limit: "10mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser(ENV.COOKIE_SECRET));
app.use(compression());

// ─── Request ID ───────────────────────────────────────────────────────────────
app.use(requestIdMiddleware);

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/v1", apiRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;