import mongoose, { Schema } from "mongoose";

const crmIntegrationSchema = new Schema(
  {
    // Company Reference (One-to-One relationship)
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
    },

    // CRM Provider Information
    provider: {
      type: String,
      enum: [
        "zoho",
        "hubspot",
        "salesforce",
        "pipedrive",
        "freshworks",
        "monday",
      ],
      required: true,
    },

    // Integration Status
    status: {
      type: String,
      enum: ["active", "inactive", "error", "expired"],
      default: "inactive",
    },

    // Authentication Credentials (encrypted)
    credentials: {
      type: Schema.Types.Mixed,
      required: true,
    },

    // OAuth Tokens (encrypted)
    tokens: {
      accessToken: {
        type: String,
        required: true,
      },
      refreshToken: {
        type: String,
      },
      tokenExpiry: {
        type: Date,
      },
      scope: {
        type: String,
      },
    },

    // CRM Account Information
    accountInfo: {
      accountId: {
        type: String,
      },
      accountName: {
        type: String,
      },
      accountEmail: {
        type: String,
      },
      accountDomain: {
        type: String,
      },
    },

    // Integration Settings
    settings: {
      // Auto-sync settings
      autoSync: {
        enabled: {
          type: Boolean,
          default: true,
        },
        interval: {
          type: Number,
          default: 300, // 5 minutes in seconds
        },
        lastSyncAt: {
          type: Date,
        },
      },

      // Field Mapping
      fieldMapping: {
        // Lead fields mapping
        leadFields: {
          name: {
            type: String,
            default: "name",
          },
          email: {
            type: String,
            default: "email",
          },
          phone: {
            type: String,
            default: "phone",
          },
          company: {
            type: String,
            default: "company",
          },
          jobTitle: {
            type: String,
            default: "job_title",
          },
          source: {
            type: String,
            default: "source",
          },
        },

        // Custom fields mapping
        customFields: [
          {
            formField: {
              type: String,
              required: true,
            },
            crmField: {
              type: String,
              required: true,
            },
            fieldType: {
              type: String,
              enum: [
                "text",
                "email",
                "phone",
                "number",
                "date",
                "select",
                "multiselect",
              ],
              default: "text",
            },
          },
        ],
      },

      // Sync Direction
      syncDirection: {
        type: String,
        enum: ["to_crm", "from_crm", "bidirectional"],
        default: "to_crm",
      },

      // Notification Settings
      notifications: {
        syncErrors: {
          type: Boolean,
          default: true,
        },
        syncSuccess: {
          type: Boolean,
          default: false,
        },
        tokenExpiry: {
          type: Boolean,
          default: true,
        },
      },
    },

    // Integration Statistics
    stats: {
      totalLeadsSynced: {
        type: Number,
        default: 0,
      },
      successfulSyncs: {
        type: Number,
        default: 0,
      },
      failedSyncs: {
        type: Number,
        default: 0,
      },
      lastSyncStatus: {
        type: String,
        enum: ["success", "error", "pending"],
      },
      lastSyncMessage: {
        type: String,
      },
    },

    // Error Logging
    errorLogs: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        errorType: {
          type: String,
          enum: ["auth", "sync", "api", "validation"],
        },
        errorMessage: {
          type: String,
        },
        errorCode: {
          type: String,
        },
        resolved: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Webhook Configuration
    webhooks: {
      enabled: {
        type: Boolean,
        default: false,
      },
      url: {
        type: String,
      },
      secret: {
        type: String,
      },
      events: [
        {
          type: String,
          enum: [
            "lead_created",
            "lead_updated",
            "lead_deleted",
            "contact_created",
            "contact_updated",
          ],
        },
      ],
    },

    // Integration Metadata
    metadata: {
      version: {
        type: String,
        default: "1.0",
      },
      apiVersion: {
        type: String,
      },
      rateLimit: {
        requests: {
          type: Number,
        },
        window: {
          type: Number,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt sensitive data before saving
crmIntegrationSchema.pre("save", function (next) {
  // In a real application, you would encrypt credentials and tokens here
  // For now, we'll store them as-is, but in production, use proper encryption
  next();
});

// Check if integration is active and tokens are valid
crmIntegrationSchema.methods.isActive = function () {
  return (
    this.status === "active" &&
    this.tokens.accessToken &&
    (!this.tokens.tokenExpiry || this.tokens.tokenExpiry > new Date())
  );
};

// Check if tokens need refresh
crmIntegrationSchema.methods.needsTokenRefresh = function () {
  if (!this.tokens.tokenExpiry) return false;
  const refreshThreshold = 5 * 60 * 1000; // 5 minutes before expiry
  return this.tokens.tokenExpiry.getTime() - Date.now() < refreshThreshold;
};

// Update sync statistics
crmIntegrationSchema.methods.updateSyncStats = function (
  success,
  message = null
) {
  if (success) {
    this.stats.successfulSyncs += 1;
    this.stats.lastSyncStatus = "success";
  } else {
    this.stats.failedSyncs += 1;
    this.stats.lastSyncStatus = "error";
  }

  if (message) {
    this.stats.lastSyncMessage = message;
  }

  this.settings.autoSync.lastSyncAt = new Date();
  return this.save();
};

// Add error to error log
crmIntegrationSchema.methods.addError = function (
  errorType,
  errorMessage,
  errorCode = null
) {
  this.errorLogs.push({
    errorType,
    errorMessage,
    errorCode,
  });

  // Keep only last 50 errors
  if (this.errorLogs.length > 50) {
    this.errorLogs = this.errorLogs.slice(-50);
  }

  return this.save();
};

// Get field mapping for a specific form field
crmIntegrationSchema.methods.getFieldMapping = function (formField) {
  const customMapping = this.settings.fieldMapping.customFields.find(
    (mapping) => mapping.formField === formField
  );

  if (customMapping) {
    return customMapping.crmField;
  }

  // Check default mappings
  const defaultMappings = this.settings.fieldMapping.leadFields;
  for (const [key, value] of Object.entries(defaultMappings)) {
    if (value === formField) {
      return key;
    }
  }

  return null;
};

// Test CRM connection
crmIntegrationSchema.methods.testConnection = async function () {
  try {
    // This would be implemented based on the specific CRM provider
    // For now, we'll return a mock response
    return {
      success: true,
      message: "Connection successful",
      accountInfo: this.accountInfo,
    };
  } catch (error) {
    this.addError("api", error.message, error.code);
    return {
      success: false,
      message: error.message,
    };
  }
};

// Create indexes for better query performance
crmIntegrationSchema.index({ "tokens.tokenExpiry": 1 });
crmIntegrationSchema.index({ createdAt: -1 });

export const CrmIntegration = mongoose.model(
  "CrmIntegration",
  crmIntegrationSchema
);
