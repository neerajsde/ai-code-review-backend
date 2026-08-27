import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface IReviewConfiguration extends Document {
  repositoryId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  // Trigger settings
  reviewOnOpen: boolean;
  reviewOnSync: boolean;
  reviewOnReopen: boolean;
  reviewDraftPRs: boolean;
  // Quality gates
  minimumSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  // File exclusions
  ignoredFilePatterns: string[];
  ignoredDirectories: string[];
  // Category toggles
  enabledCategories: string[];
  // AI settings
  aiProvider: string | null;
  aiModel: string | null;
  reviewStrictness: "strict" | "balanced" | "lenient";
  // Limits
  maxFilesPerReview: number;
  createdAt: Date;
  updatedAt: Date;
}

const reviewConfigurationSchema = new Schema<IReviewConfiguration>(
  {
    repositoryId: {
      type: Schema.Types.ObjectId,
      ref: "Repository",
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviewOnOpen: { type: Boolean, default: true },
    reviewOnSync: { type: Boolean, default: true },
    reviewOnReopen: { type: Boolean, default: true },
    reviewDraftPRs: { type: Boolean, default: false },
    minimumSeverity: {
      type: String,
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
      default: "LOW",
    },
    ignoredFilePatterns: {
      type: [String],
      default: [
        "*.lock",
        "*.min.js",
        "*.min.css",
        "*.generated.*",
        "*.pb.go",
        "*.pb.ts",
      ],
    },
    ignoredDirectories: {
      type: [String],
      default: [
        "node_modules",
        "dist",
        "build",
        ".next",
        "coverage",
        "vendor",
        ".git",
      ],
    },
    enabledCategories: {
      type: [String],
      default: [
        "BUG",
        "SECURITY",
        "PERFORMANCE",
        "CODE_QUALITY",
        "ARCHITECTURE",
        "MAINTAINABILITY",
        "ERROR_HANDLING",
      ],
    },
    aiProvider: { type: String, default: null },
    aiModel: { type: String, default: null },
    reviewStrictness: {
      type: String,
      enum: ["strict", "balanced", "lenient"],
      default: "balanced",
    },
    maxFilesPerReview: { type: Number, default: 30 },
  },
  { timestamps: true }
);

export const ReviewConfigurationModel: Model<IReviewConfiguration> =
  mongoose.model<IReviewConfiguration>(
    "ReviewConfiguration",
    reviewConfigurationSchema
  );
