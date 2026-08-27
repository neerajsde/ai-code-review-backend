import { createClient } from 'redis';
import type {RedisClientType} from 'redis'
import { REDIS_KEYS } from '../constants/redisKeys.js';
import { ENV } from '../config/env.js';

export type AppRedisClient = RedisClientType;

const redisClient: AppRedisClient = createClient({
  socket: {
    host: ENV.REDIS_HOST ?? '127.0.0.1',
    port: ENV.REDIS_PORT ? Number(ENV.REDIS_PORT) : 6379,

    // ✅ Correct v4 reconnect strategy
    reconnectStrategy: (retries: number) => {
      console.error(`🔄 Redis reconnecting... Attempt: ${retries}`);
      return Math.min(retries * 100, 3000); // max 3s
    },
  },
});

redisClient.on('connect', () => {
  console.log('✅ Redis socket connected');
});

redisClient.on('ready', () => {
  console.log('🚀 Redis ready to use');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

redisClient.on('end', () => {
  console.log('🚫 Redis connection closed');
});

redisClient.on('error', (err: Error) => {
  console.error('❌ Redis Error:', err.message);
});

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      console.log('🔗 Redis connection established');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      throw error;
    }
  }
}

const shutdownRedis = async (): Promise<void> => {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('👋 Redis disconnected gracefully');
    }
  } catch (error) {
    console.error('❌ Error while disconnecting Redis:', error);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdownRedis);
process.on('SIGTERM', shutdownRedis);

export async function deleteByPattern(pattern: string): Promise<number> {
  if (!redisClient.isOpen) {
    console.warn("⚠️ Redis client is not open, cannot delete by pattern");
    return 0;
  }

  let cursor: string = "0";
  let totalDeleted = 0;

  try {
    do {
      const { cursor: nextCursor, keys } = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      cursor = nextCursor;


      if (keys.length > 0) {
        const deletedCount = await redisClient.del(keys);
        totalDeleted += deletedCount;
      }
    } while (cursor !== "0");


    return totalDeleted;
  } catch (error) {
    console.error("❌ Error deleting Redis keys by pattern:", error);
    return totalDeleted;
  }
}

export { redisClient, REDIS_KEYS };