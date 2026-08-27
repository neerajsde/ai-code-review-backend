import "dotenv/config";
import z from "zod";

const envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  APP_NAME: z.string().default("ai-code-review"),
  API_VERSION: z.string().default("1.0.0"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Database
  MONGO_URI: z.string(),

  // Redis
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_URL: z.string().optional(),

  // Frontend
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

  // Backend URL
  BACKEND_URL: z.string().url().default("http://localhost:4000"),

  // JWT
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Cookie / Session
  COOKIE_SECRET: z.string(),
  COOKIE_SECURE: z.coerce.boolean().default(false),

  // GitHub OAuth App credentials
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),

  // GitHub App credentials
  GITHUB_APP_ID: z.string(),
  GITHUB_APP_PRIVATE_KEY: z.string(), // PEM string, newlines as \n
  GITHUB_WEBHOOK_SECRET: z.string(),
  GITHUB_APP_SLUG: z.string().default("ai-code-review-app"),

  // AI Provider
  AI_PROVIDER: z.enum(["openai", "gemini", "mock"]).default("mock"),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),

  // AI Cost Controls
  MAX_FILES_PER_REVIEW: z.coerce.number().default(30),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(100000),
  MAX_REVIEW_TOKENS: z.coerce.number().default(100000),
  MAX_AI_RETRIES: z.coerce.number().default(3),

  // Logging
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:\n",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const ENV = parsed.data;