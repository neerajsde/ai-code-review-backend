import http from "http";
import chalk from "chalk";
import os from "os";
import app from "./app.js";
import { ENV } from "./config/env.js";
import { connectMongoDB, disconnectMongoDB } from "./config/database.js";
import { connectRedis, disconnectRedis } from "./config/redis.config.js";
import logger from "./utils/logger.js";

const server = http.createServer(app);

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`🛑 ${signal} received — shutting down gracefully`);

  server.close(async () => {
    try {
      await disconnectMongoDB();
      await disconnectRedis();
      logger.info("✅ Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "❌ Error during graceful shutdown");
      process.exit(1);
    }
  });

  // Force kill after 10s
  setTimeout(() => {
    logger.error("❌ Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "❌ Uncaught Exception");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "❌ Unhandled Rejection");
  gracefulShutdown("unhandledRejection");
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  try {
    await connectMongoDB();
    await connectRedis();

    const port = ENV.PORT;
    const host = ENV.HOST;

    server.listen(port, host, () => {
      console.clear();
      console.log(chalk.gray("──────────────────────────────────────"));
      console.log(chalk.greenBright.bold("🚀 AI Code Review API Started\n"));
      console.log(
        `${chalk.cyan("📍 URL:")}      ${chalk.white(`http://${host}:${port}`)}`
      );
      console.log(
        `${chalk.cyan("🌍 ENV:")}      ${chalk.yellow(ENV.NODE_ENV)}`
      );
      console.log(
        `${chalk.cyan("🧠 Node:")}     ${process.version}`
      );
      console.log(
        `${chalk.cyan("💻 Platform:")} ${os.platform()} (${os.arch()})`
      );
      console.log(chalk.gray("──────────────────────────────────────"));
    });
  } catch (error) {
    logger.error({ error }, "❌ Failed to start server");
    process.exit(1);
  }
}

bootstrap();
