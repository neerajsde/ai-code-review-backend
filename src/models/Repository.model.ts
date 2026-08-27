import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface IRepository extends Document {
  githubRepositoryId: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  description: string | null;
  htmlUrl: string;
  installationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  enabled: boolean;
  reviewEnabled: boolean;
  lastReviewedAt: Date | null;
  totalReviews: number;
  createdAt: Date;
  updatedAt: Date;
}

const repositorySchema = new Schema<IRepository>(
  {
    githubRepositoryId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    owner: { type: String, required: true, trim: true },
    private: { type: Boolean, default: false },
    defaultBranch: { type: String, default: "main" },
    language: { type: String, default: null },
    description: { type: String, default: null },
    htmlUrl: { type: String, default: "" },
    installationId: {
      type: Schema.Types.ObjectId,
      ref: "GitHubInstallation",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    enabled: { type: Boolean, default: true },
    reviewEnabled: { type: Boolean, default: true },
    lastReviewedAt: { type: Date, default: null },
    totalReviews: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Compound index for authorization checks
repositorySchema.index({ githubRepositoryId: 1, userId: 1 });
repositorySchema.index({ installationId: 1, enabled: 1 });

export const RepositoryModel: Model<IRepository> = mongoose.model<IRepository>(
  "Repository",
  repositorySchema
);
