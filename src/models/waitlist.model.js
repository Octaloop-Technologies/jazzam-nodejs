import mongoose, { Schema } from "mongoose";

const waitlistSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      unique: true,
    },
    name: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      default: "website",
      enum: [
        "website",
        "social media",
        "email campaign",
        "referral",
        "event",
        "advertisement",
        "other",
      ],
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "converted"],
      default: "pending",
      index: true,
    },
    metadata: {
      type: Map,
      of: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better query performance
waitlistSchema.index({ status: 1, createdAt: -1 });
waitlistSchema.index({ createdAt: -1 });

// Pre-save middleware to validate email format
waitlistSchema.pre("save", function (next) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(this.email)) {
    return next(new Error("Invalid email format"));
  }
  next();
});

// Instance method to update status
waitlistSchema.methods.updateStatus = function (newStatus) {
  this.status = newStatus;
  return this.save();
};

// Static method to find by email
waitlistSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim(), isActive: true });
};

// Static method to get waitlist statistics
waitlistSchema.statics.getStats = function () {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalSignups: { $sum: 1 },
        pendingSignups: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        confirmedSignups: {
          $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
        },
        convertedSignups: {
          $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalSignups: 1,
        pendingSignups: 1,
        confirmedSignups: 1,
        convertedSignups: 1,
      },
    },
  ]);
};

export const Waitlist = mongoose.model("Waitlist", waitlistSchema);
