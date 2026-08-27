import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { ENV } from "./env.js";
import logger from "../utils/logger.js";

export type AppRedisClient = RedisClientType;

const redisClient: AppRedisClient = createClient({
  socket: {
    host: ENV.REDIS_HOST ?? "127.0.0.1",
    port: ENV.REDIS_PORT ?? 6379,
    reconnectStrategy: (retries: number) => {
      logger.warn(`🔄 Redis reconnecting... Attempt: ${retries}`);
      if (retries > 20) {
        logger.error("❌ Redis max reconnect attempts reached");
        return new Error("Max reconnect attempts reached");
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

redisClient.on("connect", () => logger.info("✅ Redis socket connected"));
redisClient.on("ready", () => logger.info("🚀 Redis ready to use"));
redisClient.on("reconnecting", () => logger.warn("🔄 Redis reconnecting..."));
redisClient.on("end", () => logger.info("🚫 Redis connection closed"));
redisClient.on("error", (err: Error) =>
  logger.error({ err }, "❌ Redis Error")
);

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      logger.info("🔗 Redis connection established");
    } catch (error) {
      logger.error({ error }, "❌ Redis connection failed");
      throw error;
    }
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info("👋 Redis disconnected gracefully");
    }
  } catch (error) {
    logger.error({ error }, "❌ Error while disconnecting Redis");
  }
}

export function getRedisStatus(): "connected" | "disconnected" {
  return redisClient.isReady ? "connected" : "disconnected";
}

export async function deleteByPattern(pattern: string): Promise<number> {
  if (!redisClient.isOpen) {
    logger.warn("⚠️ Redis client is not open, cannot delete by pattern");
    return 0;
  }

  let cursor = "0";
  let totalDeleted = 0;

  try {
    do {
      const { cursor: nextCursor, keys } = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = nextCursor;
      if (keys.length > 0) {
        totalDeleted += await redisClient.del(keys);
      }
    } while (cursor !== "0");

    return totalDeleted;
  } catch (error) {
    logger.error({ error }, "❌ Error deleting Redis keys by pattern");
    return totalDeleted;
  }
}

export { redisClient };