import mongoose, { Document, Schema, Model } from "mongoose";

export type NotificationType =
  | "credential_issued"
  | "enrollment_confirmed"
  | "announcement"
  | "course_update"
  | "achievement_earned"
  | "assignment_graded"
  | "payment_confirmed"
  | "system_alert";

export interface INotification extends Document {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  category: "course" | "message" | "system" | "achievement";
  isRead: boolean;
  isDelivered: boolean;
  deliveredAt?: Date;
  priority: "low" | "medium" | "high";
  deliveryMethods: ("email" | "push" | "websocket")[];
  scheduledTime?: Date;
  sentTime?: Date;
  actionUrl?: string;
  metadata?: Record<string, any>;
  targetRoles?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "credential_issued",
        "enrollment_confirmed",
        "announcement",
        "course_update",
        "achievement_earned",
        "assignment_graded",
        "payment_confirmed",
        "system_alert",
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["course", "message", "system", "achievement"],
      required: true,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isDelivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    deliveryMethods: [
      {
        type: String,
        enum: ["email", "push", "websocket"],
      },
    ],
    scheduledTime: {
      type: Date,
    },
    sentTime: {
      type: Date,
    },
    actionUrl: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    targetRoles: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes for common queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ userId: 1, type: 1 });
NotificationSchema.index({ type: 1, createdAt: -1 });
NotificationSchema.index(
  { scheduledTime: 1 },
  { partialFilterExpression: { isDelivered: false } },
);
NotificationSchema.index(
  { userId: 1, isDelivered: 1 },
  { partialFilterExpression: { isDelivered: false } },
);

export const Notification: Model<INotification> = mongoose.model<INotification>(
  "Notification",
  NotificationSchema,
);

export interface INotificationPreference extends Document {
  userId: string;
  enabledCategories: string[];
  deliveryMethods: ("email" | "push" | "websocket")[];
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  updatedAt: Date;
}

const NotificationPreferenceSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    enabledCategories: [
      {
        type: String,
        enum: ["course", "message", "system", "achievement"],
      },
    ],
    deliveryMethods: [
      {
        type: String,
        enum: ["email", "push", "websocket"],
      },
    ],
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: "22:00" },
      end: { type: String, default: "08:00" },
    },
  },
  {
    timestamps: true,
  },
);

export const NotificationPreference: Model<INotificationPreference> =
  mongoose.model<INotificationPreference>(
    "NotificationPreference",
    NotificationPreferenceSchema,
  );
