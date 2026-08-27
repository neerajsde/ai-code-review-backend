import mongoose, { type Document, type Model, Schema } from "mongoose";

export type WebhookEventStatus = "PENDING" | "PROCESSED" | "SKIPPED" | "FAILED";

export interface IWebhookEvent extends Document {
  githubEventId: string;
  deliveryId: string;
  eventName: string;
  action: string | null;
  repositoryId: mongoose.Types.ObjectId | null;
  installationId: number | null;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  processedAt: Date | null;
  error: string | null;
  reviewId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    githubEventId: {
      type: String,
      required: true,
      index: true,
    },
    deliveryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventName: { type: String, required: true },
    action: { type: String, default: null },
    repositoryId: {
      type: Schema.Types.ObjectId,
      ref: "Repository",
      default: null,
      index: true,
    },
    installationId: { type: Number, default: null },
    // Store trimmed payload for debugging (no source code)
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSED", "SKIPPED", "FAILED"] as WebhookEventStatus[],
      default: "PENDING",
      index: true,
    },
    processedAt: { type: Date, default: null },
    error: { type: String, default: null },
    reviewId: {
      type: Schema.Types.ObjectId,
      ref: "Review",
      default: null,
    },
  },
  { timestamps: true }
);

// TTL — auto-delete webhook events after 30 days
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const WebhookEventModel: Model<IWebhookEvent> =
  mongoose.model<IWebhookEvent>("WebhookEvent", webhookEventSchema);
