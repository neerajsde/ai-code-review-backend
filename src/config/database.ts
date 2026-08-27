import mongoose from "mongoose";
import { ENV } from "./env.js";
import logger from "../utils/logger.js";

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let isConnected = false;

export async function connectMongoDB(): Promise<void> {
  if (isConnected) return;

  try {
    mongoose.set("strictQuery", true);

    await mongoose.connect(ENV.MONGO_URI, MONGO_OPTIONS);

    isConnected = true;
    logger.info("✅ MongoDB connected successfully");

    mongoose.connection.on("disconnected", () => {
      logger.warn("⚠️ MongoDB disconnected");
      isConnected = false;
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("🔄 MongoDB reconnected");
      isConnected = true;
    });

    mongoose.connection.on("error", (err: Error) => {
      logger.error({ err }, "❌ MongoDB connection error");
      isConnected = false;
    });
  } catch (error) {
    logger.error({ error }, "❌ MongoDB connection failed");
    throw error;
  }
}

export async function disconnectMongoDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info("👋 MongoDB disconnected gracefully");
}

export function getMongoStatus(): "connected" | "disconnected" {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}
