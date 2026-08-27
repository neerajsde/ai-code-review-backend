import mongoose, { type Document, type Model, Schema } from "mongoose";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type FindingCategory =
  | "BUG"
  | "SECURITY"
  | "PERFORMANCE"
  | "CODE_QUALITY"
  | "ARCHITECTURE"
  | "STYLE"
  | "MAINTAINABILITY"
  | "TESTING"
  | "ERROR_HANDLING"
  | "DEPENDENCY";

export type FindingStatus = "OPEN" | "DISMISSED" | "RESOLVED";

export interface IReviewFinding extends Document {
  reviewId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  pullRequestId: mongoose.Types.ObjectId;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  filePath: string;
  lineStart: number | null;
  lineEnd: number | null;
  codeSnippet: string | null;
  suggestion: string | null;
  confidence: number;
  fingerprint: string;
  status: FindingStatus;
  githubCommentId: number | null;
  githubCommentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const reviewFindingSchema = new Schema<IReviewFinding>(
  {
    reviewId: {
      type: Schema.Types.ObjectId,
      ref: "Review",
      required: true,
      index: true,
    },
    repositoryId: {
      type: Schema.Types.ObjectId,
      ref: "Repository",
      required: true,
      index: true,
    },
    pullRequestId: {
      type: Schema.Types.ObjectId,
      ref: "PullRequest",
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as FindingSeverity[],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "BUG",
        "SECURITY",
        "PERFORMANCE",
        "CODE_QUALITY",
        "ARCHITECTURE",
        "STYLE",
        "MAINTAINABILITY",
        "TESTING",
        "ERROR_HANDLING",
        "DEPENDENCY",
      ] as FindingCategory[],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    filePath: { type: String, required: true },
    lineStart: { type: Number, default: null },
    lineEnd: { type: Number, default: null },
    codeSnippet: { type: String, default: null },
    suggestion: { type: String, default: null },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    fingerprint: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "DISMISSED", "RESOLVED"] as FindingStatus[],
      default: "OPEN",
    },
    githubCommentId: { type: Number, default: null },
    githubCommentUrl: { type: String, default: null },
  },
  { timestamps: true }
);

// Prevent duplicate findings via fingerprint
reviewFindingSchema.index({ fingerprint: 1 }, { unique: true });
reviewFindingSchema.index({ reviewId: 1, severity: 1 });

export const ReviewFindingModel: Model<IReviewFinding> =
  mongoose.model<IReviewFinding>("ReviewFinding", reviewFindingSchema);
