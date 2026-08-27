import "dotenv/config";
import z from "zod";

const envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  APP_NAME: z.string().default("ai-code-review"),
  API_VERSION: z.string().default("1.0.0"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(10),

  MONGO_URI: z.string(),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number().default(6379),

  EMAIL_HOST: z.string(),
  EMAIL_PORT: z.enum(["465", "587"]),
  EMAIL_SECURE: z.coerce.boolean().default(false),
  EMAIL_USER: z.string(),
  EMAIL_PASS: z.string(),
  EMAIL_FROM: z.string(),

  JWT_ACCESS_SECRET: z.string(),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string(),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  JWT_ADMIN_ACCESS_SECRET: z.string(),
  JWT_ADMIN_REFRESH_SECRET: z.string(),

  ALLOWED_ORIGINS: z.string().default("*"),

  APP_URL: z.string(),
  LOGO_URL: z.string(),
  SUPPORT_EMAIL: z.string(),

  BACKEND_URL: z.url(),
});

export const ENV = envSchema.parse(process.env);