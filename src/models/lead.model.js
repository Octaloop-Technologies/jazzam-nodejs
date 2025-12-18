import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const leadSchema = new Schema(
  {
    // Company Reference (Required for SAAS)
    // companyId: {
    //   type: Schema.Types.ObjectId,
    //   ref: "Company",
    //   required: true,
    //   index: true,
    // },

    // Form Reference (Which form generated this lead)
    // Note: Optional for CRM-imported leads
    formId: {
      type: Schema.Types.ObjectId,
      ref: "Form",
      required: false,
      index: true,
    },

    // Platform Source Information
    platform: {
      type: String,
      enum: ["linkedin", "meta", "twitter", "instagram", "other"],
      required: true,
      index: true,
    },

    // Platform-specific URL/Identifier
    platformUrl: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Profile information (works for all platforms)
    profileUrl: {
      type: String,
      trim: true,
      index: true,
    },
    profilePic: {
      type: String,
      trim: true,
    },

    // Basic Lead Information
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },

    // Company Information (Lead's company)
    company: {
      type: String,
      trim: true,
      index: true,
    },
    companyIndustry: {
      type: String,
      trim: true,
      index: true,
    },
    companyWebsite: {
      type: String,
      trim: true,
    },
    companySize: {
      type: String,
      trim: true,
      index: true,
    },
    jobTitle: {
      type: String,
      trim: true,
      index: true,
    },
    department: {
      type: String,
      trim: true,
    },

    // Location Information
    location: {
      type: String,
      trim: true,
      index: true,
    },
    country: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },

    // Platform-specific scraped data (flexible JSON field)
    platformData: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Lead Source Information
    source: {
      type: String,
      enum: [
        "form",
        "import",
        "api",
        "manual",
        "linkedin",
        "meta",
        "twitter",
        "instagram",
      ],
      default: "form",
      index: true,
    },
    sourceUrl: {
      type: String,
      trim: true,
    },
    referrer: {
      type: String,
      trim: true,
    },
    utmParams: {
      utm_source: String,
      utm_medium: String,
      utm_campaign: String,
      utm_term: String,
      utm_content: String,
    },

    // BANT (Budget, Authority, Need, Timeline) Lead Qualification Fields
    bant: {
      budget: {
        value: String,
        score: { type: Number, min: 0, max: 25 },
        qualified: Boolean,
      },
      authority: {
        value: String,
        score: { type: Number, min: 0, max: 25 },
        isDecisionMaker: { type: Boolean, default: false },
        level: { type: String, enum: ["high", "medium", "low"] },
      },
      need: {
        value: [String],
        score: { type: Number, min: 0, max: 25 },
        urgency: { type: String, enum: ["low", "medium", "high"] },
      },
      timeline: {
        value: String,
        score: { type: Number, min: 0, max: 25 },
        timeframe: {
          type: String,
          enum: [
            "immediate",
            "1-3 months",
            "3-6 months",
            "6+ months",
            "unknown",
          ],
        },
      },
      // Overall BANT score (0-100)
      totalScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      // Lead category based on score
      category: {
        type: String,
        enum: ["hot", "warm", "cold", "unqualified"],
      },
      // When BANT qualification was last performed
      qualifiedAt: {
        type: Date,
      },
      // Raw AI response for reference
      rawResponse: {
        type: Schema.Types.Mixed,
      },
    },

    // Lead Management
    status: {
      type: String,
      enum: ["new", "hot", "cold", "warm", "qualified"],
      default: "new",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    tags: [
      {
        name: {
          type: String,
          trim: true,
        },
        color: {
          type: String,
          trim: true,
        },
      },
    ],

    // Email Communication Tracking
    emailStatus: {
      welcomeSent: {
        type: Boolean,
        default: false,
      },
      welcomeSentAt: {
        type: Date,
      },
      followUpSent: {
        type: Boolean,
        default: false,
      },
      followUpSentAt: {
        type: Date,
      },
      followUpScheduledAt: {
        type: Date,
      },
      lastEmailSent: {
        type: Date,
      },
      emailBounced: {
        type: Boolean,
        default: false,
      },
      emailUnsubscribed: {
        type: Boolean,
        default: false,
      },
    },

    // Contact History
    contactHistory: [
      {
        type: {
          type: String,
          enum: ["email", "phone", "meeting", "note"],
          required: true,
        },
        subject: {
          type: String,
          trim: true,
        },
        content: {
          type: String,
          trim: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        outcome: {
          type: String,
          enum: ["positive", "negative", "neutral", "no_response"],
        },
      },
    ],

    // Lead Scoring
    leadScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // CRM Integration
    crmId: {
      type: String,
      trim: true,
    },
    crmSyncStatus: {
      type: String,
      enum: ["pending", "synced", "failed", "not_synced"],
      default: "not_synced",
    },
    crmSyncAt: {
      type: Date,
    },

    // CRM Metadata for bidirectional sync and duplicate prevention
    crmMetadata: {
      sourceSystem: {
        type: String,
        enum: ['Jazzaam', 'HubSpot', 'Salesforce', 'Zoho', 'Manual', 'Import'],
        default: 'Jazzaam'
      },
      lastSyncDirection: {
        type: String,
        enum: ['to_crm', 'from_crm']
      },
      lastSyncedAt: {
        type: Date
      },
      syncVersion: {
        type: Number,
        default: 1
      },
      lastModifiedInCrm: {
        type: Date
      },
      crmProvider: {
        type: String,
        enum: ['hubspot', 'salesforce', 'zoho', 'pipedrive', 'freshworks', 'monday']
      }
    },

    // Conversion Tracking
    conversionData: {
      converted: {
        type: Boolean,
        default: false,
      },
      convertedAt: {
        type: Date,
      },
      conversionValue: {
        type: Number,
        default: 0,
      },
      conversionSource: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Create compound indexes for better query performance
// leadSchema.index({ companyId: 1, email: 1 });
// leadSchema.index({ companyId: 1, status: 1 });
// leadSchema.index({ companyId: 1, formId: 1 });
// leadSchema.index({ companyId: 1, platform: 1 });
// leadSchema.index({ companyId: 1, createdAt: -1 });
// Ensure no duplicate leads per company for the same platform URL
// leadSchema.index({ companyId: 1, platformUrl: 1 }, { unique: true });
// leadSchema.index({ email: 1, companyId: 1 });
// leadSchema.index({ status: 1, companyIndustry: 1 });
// leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ platform: 1, status: 1 });
// Prevent duplicate leads per platform URL (per tenant DB)
leadSchema.index({ platformUrl: 1 }, { unique: true });

// Create text index for search functionality
leadSchema.index({
  firstName: "text",
  lastName: "text",
  fullName: "text",
  email: "text",
  location: "text",
  jobTitle: "text",
});

// Add pagination plugin
leadSchema.plugin(mongooseAggregatePaginate);

// Static method to find leads by criteria (no companyId needed - separate DB!)
leadSchema.statics.findByCriteria = function (searchQuery) {
  const query = {};

  if (searchQuery.status) query.status = searchQuery.status;
  if (searchQuery.formId) query.formId = searchQuery.formId;
  if (searchQuery.platform) query.platform = searchQuery.platform;
  if (searchQuery.companyIndustry)
    query.companyIndustry = searchQuery.companyIndustry;
  if (searchQuery.companySize) query.companySize = searchQuery.companySize;
  if (searchQuery.location) query.location = searchQuery.location;
  if (searchQuery.source) query.source = searchQuery.source;
  if (searchQuery.tags) query.tags = { $in: searchQuery.tags };

  return this.find(query);
};

// Instance methods
leadSchema.methods.updateEmailStatus = function (type, sent = true) {
  const now = new Date();

  switch (type) {
    case "welcome":
      this.emailStatus.welcomeSent = sent;
      this.emailStatus.welcomeSentAt = sent ? now : null;
      break;
    case "followup":
      this.emailStatus.followUpSent = sent;
      this.emailStatus.followUpSentAt = sent ? now : null;
      break;
  }

  this.emailStatus.lastEmailSent = now;
  return this.save();
};

leadSchema.methods.scheduleFollowUp = function (days = 2) {
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + days);
  this.emailStatus.followUpScheduledAt = followUpDate;
  return this.save();
};

leadSchema.methods.addContactHistory = function (
  type,
  subject,
  content,
  outcome = null
) {
  this.contactHistory.push({
    type,
    subject,
    content,
    outcome,
  });
  return this.save();
};

leadSchema.methods.updateLeadScore = function (score) {
  this.leadScore = Math.max(0, Math.min(100, score));
  return this.save();
};

leadSchema.methods.markAsConverted = function (value = 0, source = null) {
  this.conversionData.converted = true;
  this.conversionData.convertedAt = new Date();
  this.conversionData.conversionValue = value;
  this.conversionData.conversionSource = source;
  this.status = "converted";
  return this.save();
};

leadSchema.methods.syncToCRM = function (crmId) {
  this.crmId = crmId;
  this.crmSyncStatus = "synced";
  this.crmSyncAt = new Date();
  return this.save();
};

// Check if lead should be synced from CRM (prevents loops and duplicates)
leadSchema.methods.shouldSyncFromCrm = function(crmContact, crmProvider) {
  // Don't sync if this lead was created in our platform
  if (this.crmMetadata?.sourceSystem === 'jazzaam') {
    return false;
  }
  
  // Don't sync if we recently synced (prevent rapid back-and-forth)
  if (this.crmMetadata?.lastSyncedAt) {
    const timeSinceSync = Date.now() - this.crmMetadata.lastSyncedAt.getTime();
    if (timeSinceSync < 60000) { // Less than 1 minute
      return false;
    }
  }
  
  // Check if CRM contact has our platform identifier
  if (crmProvider === 'hubspot' && crmContact.properties?.lead_source_system === 'Jazzaam') {
    return false;
  }
  
  return true;
};

// Static method to check if lead should be imported from CRM
leadSchema.statics.shouldImportFromCrm = function(crmContact, crmProvider) {
  // Skip if contact originated from our platform
  if (crmProvider === 'hubspot' && crmContact.properties?.lead_source_system === 'Jazzaam') {
    return false;
  }
  
  if (crmProvider === 'salesforce' && crmContact.Lead_Source_System__c === 'Jazzaam') {
    return false;
  }
  
  if (crmProvider === 'zoho' && crmContact.Lead_Source_System === 'Jazzaam') {
    return false;
  }
  
  return true;
};

export { leadSchema };
