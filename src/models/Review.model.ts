import mongoose, { type Document, type Model, Schema } from "mongoose";

export type ReviewStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ReviewTrigger = "WEBHOOK" | "MANUAL" | "RETRY";

export interface IReview extends Document {
  pullRequestId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  installationId: mongoose.Types.ObjectId;
  status: ReviewStatus;
  trigger: ReviewTrigger;
  commitSha: string;
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  // File stats
  filesReviewed: number;
  linesAdded: number;
  linesRemoved: number;
  // Findings summary
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  infoFindings: number;
  // Score (0–100)
  score: number | null;
  summary: string | null;
  // Error info
  error: string | null;
  retryCount: number;
  // GitHub
  githubReviewId: number | null;
  githubReviewUrl: string | null;
  // AI metadata
  aiProvider: string | null;
  aiModel: string | null;
  promptVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  // BullMQ job ID
  jobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    pullRequestId: {
      type: Schema.Types.ObjectId,
      ref: "PullRequest",
      required: true,
      index: true,
    },
    repositoryId: {
      type: Schema.Types.ObjectId,
      ref: "Repository",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    installationId: {
      type: Schema.Types.ObjectId,
      ref: "GitHubInstallation",
      required: true,
    },
    status: {
      type: String,
      enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as ReviewStatus[],
      default: "QUEUED",
      index: true,
    },
    trigger: {
      type: String,
      enum: ["WEBHOOK", "MANUAL", "RETRY"] as ReviewTrigger[],
      required: true,
    },
    commitSha: { type: String, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    duration: { type: Number, default: null },
    filesReviewed: { type: Number, default: 0 },
    linesAdded: { type: Number, default: 0 },
    linesRemoved: { type: Number, default: 0 },
    totalFindings: { type: Number, default: 0 },
    criticalFindings: { type: Number, default: 0 },
    highFindings: { type: Number, default: 0 },
    mediumFindings: { type: Number, default: 0 },
    lowFindings: { type: Number, default: 0 },
    infoFindings: { type: Number, default: 0 },
    score: { type: Number, default: null },
    summary: { type: String, default: null },
    error: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    githubReviewId: { type: Number, default: null },
    githubReviewUrl: { type: String, default: null },
    aiProvider: { type: String, default: null },
    aiModel: { type: String, default: null },
    promptVersion: { type: String, default: null },
    inputTokens: { type: Number, default: null },
    outputTokens: { type: Number, default: null },
    jobId: { type: String, default: null },
  },
  { timestamps: true }
);

// Idempotency: one review per PR + commit SHA
reviewSchema.index({ pullRequestId: 1, commitSha: 1 });
// Dashboard queries
reviewSchema.index({ repositoryId: 1, createdAt: -1 });
reviewSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const ReviewModel: Model<IReview> = mongoose.model<IReview>(
  "Review",
  reviewSchema
);
