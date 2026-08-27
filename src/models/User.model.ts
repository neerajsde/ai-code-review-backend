import mongoose, { type Document, type Model, Schema } from "mongoose";

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "suspended";

export interface IUser extends Document {
  githubId: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  role: UserRole;
  status: UserStatus;
  githubAccessToken?: string;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
  toPublic(): IUserPublic;
}

export interface IUserPublic {
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: Date;
  createdAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    githubId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    avatarUrl: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["user", "admin"] as UserRole[],
      default: "user",
    },
    status: {
      type: String,
      enum: ["active", "suspended"] as UserStatus[],
      default: "active",
    },
    // Never expose this via API responses — only used server-side
    githubAccessToken: {
      type: String,
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        delete ret.githubAccessToken;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.methods.toPublic = function (): IUserPublic {
  return {
    id: (this._id as mongoose.Types.ObjectId).toString(),
    githubId: this.githubId,
    username: this.username,
    displayName: this.displayName,
    email: this.email,
    avatarUrl: this.avatarUrl,
    role: this.role,
    status: this.status,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

export const UserModel: Model<IUser> = mongoose.model<IUser>(
  "User",
  userSchema
);
