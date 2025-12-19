import mongoose, { Schema } from "mongoose";

/**
 * Audit Logs Model - System Database
 * Tracks all important actions across all tenants
 */
const auditLogsSchema = new Schema(
  {
    // Company/Tenant reference
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    // User who performed the action
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Company", // Can be company user or team member
      required: true,
    },

    // Action details
    action: {
      type: String,
      required: true,
      enum: [
        "login",
        "logout",
        "create",
        "update",
        "delete",
        "export",
        "import",
        "payment",
        "subscription_change",
        "settings_change",
        "api_call",
        "crm_sync",
        "email_sent",
      ],
      index: true,
    },

    // Resource affected
    resource: {
      type: String,
      required: true,
      enum: [
        "lead",
        "form",
        "company",
        "subscription",
        "dealHealth",
        "nextBestAction",
        "crmIntegration",
        "user",
        "settings",
        "billing",
      ],
    },

    resourceId: {
      type: Schema.Types.ObjectId,
    },

    // Action details
    details: {
      type: Schema.Types.Mixed,
    },

    // Request metadata
    ipAddress: String,
    userAgent: String,
    method: String,
    endpoint: String,

    // Status
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "success",
    },

    errorMessage: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
auditLogsSchema.index({ companyId: 1, createdAt: -1 });
auditLogsSchema.index({ userId: 1, createdAt: -1 });
auditLogsSchema.index({ action: 1, resource: 1 });
auditLogsSchema.index({ createdAt: -1 });

// Create model on default (system) connection
export const AuditLogs = mongoose.model("AuditLogs", auditLogsSchema);
