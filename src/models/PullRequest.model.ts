import mongoose, { type Document, type Model, Schema } from "mongoose";

export type PullRequestStatus = "OPEN" | "CLOSED" | "MERGED";

export interface IPullRequest extends Document {
  githubPrId: number;
  number: number;
  title: string;
  description: string | null;
  repositoryId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  author: string;
  authorAvatarUrl: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  baseSha: string;
  status: PullRequestStatus;
  draft: boolean;
  githubUrl: string;
  openedAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: Date;
  updatedAt: Date;
}

const pullRequestSchema = new Schema<IPullRequest>(
  {
    githubPrId: { type: Number, required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
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
    author: { type: String, required: true },
    authorAvatarUrl: { type: String, default: "" },
    baseBranch: { type: String, required: true },
    headBranch: { type: String, required: true },
    headSha: { type: String, required: true },
    baseSha: { type: String, required: true },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED", "MERGED"] as PullRequestStatus[],
      default: "OPEN",
    },
    draft: { type: Boolean, default: false },
    githubUrl: { type: String, default: "" },
    openedAt: { type: Date, default: Date.now },
    mergedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changedFiles: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unique per repo + PR number
pullRequestSchema.index({ repositoryId: 1, number: 1 }, { unique: true });
// Fast lookup for idempotency check
pullRequestSchema.index({ repositoryId: 1, headSha: 1 });
pullRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const PullRequestModel: Model<IPullRequest> =
  mongoose.model<IPullRequest>("PullRequest", pullRequestSchema);
