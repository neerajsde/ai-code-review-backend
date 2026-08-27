import mongoose, { type Document, type Model, Schema } from "mongoose";

export type AccountType = "User" | "Organization";

export interface IRepositoryAccess {
  githubRepositoryId: number;
  name: string;
  fullName: string;
}

export interface IGitHubInstallation extends Document {
  installationId: number;
  githubAccountId: number;
  githubAccountLogin: string;
  githubAccountType: AccountType;
  githubAccountAvatarUrl: string;
  userId: mongoose.Types.ObjectId;
  permissions: Record<string, string>;
  repositorySelection: "all" | "selected";
  repositories: IRepositoryAccess[];
  active: boolean;
  installedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const repositoryAccessSchema = new Schema<IRepositoryAccess>(
  {
    githubRepositoryId: { type: Number, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
  },
  { _id: false }
);

const gitHubInstallationSchema = new Schema<IGitHubInstallation>(
  {
    installationId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    githubAccountId: { type: Number, required: true },
    githubAccountLogin: { type: String, required: true, trim: true },
    githubAccountType: {
      type: String,
      enum: ["User", "Organization"] as AccountType[],
      required: true,
    },
    githubAccountAvatarUrl: { type: String, default: "" },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    permissions: {
      type: Map,
      of: String,
      default: {},
    },
    repositorySelection: {
      type: String,
      enum: ["all", "selected"],
      default: "selected",
    },
    repositories: {
      type: [repositoryAccessSchema],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    installedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const GitHubInstallationModel: Model<IGitHubInstallation> =
  mongoose.model<IGitHubInstallation>(
    "GitHubInstallation",
    gitHubInstallationSchema
  );
