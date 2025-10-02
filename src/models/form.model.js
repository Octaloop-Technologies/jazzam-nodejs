import mongoose, { Schema } from "mongoose";
import crypto from "crypto";

const formSchema = new Schema(
  {
    // Form Type and Platform
    formType: {
      type: String,
      enum: ["custom", "linkedin", "meta", "twitter", "instagram"],
      default: "custom",
    },

    // Platform-specific configuration
    platformConfig: {
      scrapingEnabled: {
        type: Boolean,
        default: false,
      },
      scrapingService: {
        type: String,
        enum: ["apify", "custom", "none"],
        default: "none",
      },
      scrapingConfig: {
        type: Schema.Types.Mixed,
        default: {},
      },
    },

    // Company Reference
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    // Form Configuration (JSON field for flexible form structure)
    config: {
      type: Schema.Types.Mixed,
      required: true,
      default: {
        fields: [],
        settings: {
          theme: "default",
          submitButtonText: "Submit",
          successMessage: "Thank you for your submission!",
          redirectUrl: null,
        },
      },
    },

    // Form Status
    status: {
      type: String,
      enum: ["draft", "active", "inactive", "archived"],
      default: "draft",
    },

    // Form Settings
    settings: {
      // Email Settings
      emailNotifications: {
        enabled: {
          type: Boolean,
          default: true,
        },
        recipients: [
          {
            type: String,
            trim: true,
          },
        ],
        subject: {
          type: String,
          default: "New Lead Submission",
        },
      },

      // Auto-response Settings
      autoResponse: {
        enabled: {
          type: Boolean,
          default: true,
        },
        subject: {
          type: String,
          default: "Thank you for your interest!",
        },
        message: {
          type: String,
          default: "Thank you for reaching out. We'll get back to you soon!",
        },
      },

      // Follow-up Settings
      followUp: {
        enabled: {
          type: Boolean,
          default: true,
        },
        delayDays: {
          type: Number,
          default: 2,
        },
        subject: {
          type: String,
          default: "Following up on your inquiry",
        },
        message: {
          type: String,
          default:
            "Hi there! We wanted to follow up on your recent inquiry. Do you have any questions?",
        },
      },

      // CRM Integration
      crmIntegration: {
        enabled: {
          type: Boolean,
          default: false,
        },
        autoSync: {
          type: Boolean,
          default: true,
        },
      },

      // Spam Protection
      spamProtection: {
        enabled: {
          type: Boolean,
          default: true,
        },
        captcha: {
          type: Boolean,
          default: false,
        },
        honeypot: {
          type: Boolean,
          default: true,
        },
      },

      // Analytics
      analytics: {
        enabled: {
          type: Boolean,
          default: true,
        },
        trackViews: {
          type: Boolean,
          default: true,
        },
        trackSubmissions: {
          type: Boolean,
          default: true,
        },
      },
    },

    // Form Statistics
    stats: {
      views: {
        type: Number,
        default: 0,
      },
      submissions: {
        type: Number,
        default: 0,
      },
      conversionRate: {
        type: Number,
        default: 0,
      },
      lastSubmissionAt: {
        type: Date,
      },
    },

    // Form Access
    isPublic: {
      type: Boolean,
      default: true,
    },
    accessToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // Form Embedding
    embedCode: {
      type: String,
    },
    embedUrl: {
      type: String,
    },

    // Form Styling
    styling: {
      primaryColor: {
        type: String,
        default: "#007bff",
      },
      secondaryColor: {
        type: String,
        default: "#6c757d",
      },
      fontFamily: {
        type: String,
        default: "Arial, sans-serif",
      },
      borderRadius: {
        type: Number,
        default: 4,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique access token for form
formSchema.pre("save", function (next) {
  if (!this.accessToken) {
    this.accessToken = crypto.randomBytes(32).toString("hex");
  }
  next();
});

// Generate embed code
formSchema.methods.generateEmbedCode = function () {
  const baseUrl = process.env.CLIENT_URL || "http://localhost:3000";
  this.embedUrl = `${baseUrl}/form/${this.accessToken}`;
  this.embedCode = `<iframe src="${this.embedUrl}" width="100%" height="600" frameborder="0"></iframe>`;
  return this.embedCode;
};

// Update form statistics
formSchema.methods.incrementViews = function () {
  this.stats.views += 1;
  this.stats.conversionRate = (this.stats.submissions / this.stats.views) * 100;
  return this.save();
};

formSchema.methods.incrementSubmissions = function () {
  this.stats.submissions += 1;
  this.stats.lastSubmissionAt = new Date();
  this.stats.conversionRate = (this.stats.submissions / this.stats.views) * 100;
  return this.save();
};

// Check if form is active and accessible
formSchema.methods.isAccessible = function () {
  return this.status === "active" && this.isPublic;
};

// Get form fields from config
formSchema.methods.getFields = function () {
  return this.config.fields || [];
};

// Add field to form
formSchema.methods.addField = function (field) {
  if (!this.config.fields) {
    this.config.fields = [];
  }
  this.config.fields.push(field);
  return this.save();
};

// Create platform-specific form templates
formSchema.statics.createPlatformTemplate = function (formType, companyId) {
  const templates = {
    linkedin: {
      name: "LinkedIn Lead Generator",
      description:
        "Collect LinkedIn profile URLs and automatically scrape lead data",
      formType: "linkedin",
      platformConfig: {
        scrapingEnabled: true,
        scrapingService: "apify",
        scrapingConfig: {
          actorId: "dev_fusion~linkedin-profile-scraper",
          fields: ["profileUrls"],
        },
      },
      config: {
        fields: [
          {
            id: "linkedin_url",
            name: "linkedinUrl",
            type: "url",
            label: "LinkedIn Profile URL",
            placeholder: "https://www.linkedin.com/in/your-profile",
            required: true,
            validation: {
              pattern: "^https://www\\.linkedin\\.com/in/",
              message: "Please enter a valid LinkedIn profile URL",
            },
          },
        ],
        settings: {
          theme: "linkedin",
          submitButtonText: "Generate Lead",
          successMessage:
            "Thank you! We're processing your LinkedIn profile...",
          redirectUrl: null,
        },
      },
      settings: {
        emailNotifications: {
          enabled: true,
          recipients: [],
          subject: "New LinkedIn Lead Generated",
        },
        autoResponse: {
          enabled: true,
          subject: "Thank you for your LinkedIn profile!",
          message:
            "We've received your LinkedIn profile and are processing your lead information. You'll hear from us soon!",
        },
        followUp: {
          enabled: true,
          delayDays: 2,
          subject: "Following up on your LinkedIn lead",
          message:
            "Hi there! We wanted to follow up on your LinkedIn profile submission. Do you have any questions about our services?",
        },
      },
    },

    meta: {
      name: "Meta/Facebook Lead Generator",
      description:
        "Collect Facebook usernames and automatically scrape lead data",
      formType: "meta",
      platformConfig: {
        scrapingEnabled: true,
        scrapingService: "apify",
        scrapingConfig: {
          actorId: "dev_fusion~facebook-profile-scraper",
          fields: ["usernames"],
        },
      },
      config: {
        fields: [
          {
            id: "facebook_username",
            name: "facebookUsername",
            type: "text",
            label: "Facebook Username",
            placeholder: "Enter your Facebook username (without @)",
            required: true,
            validation: {
              pattern: "^[a-zA-Z0-9._]+$",
              message: "Please enter a valid Facebook username",
            },
          },
        ],
        settings: {
          theme: "meta",
          submitButtonText: "Generate Lead",
          successMessage:
            "Thank you! We're processing your Facebook profile...",
          redirectUrl: null,
        },
      },
      settings: {
        emailNotifications: {
          enabled: true,
          recipients: [],
          subject: "New Facebook Lead Generated",
        },
        autoResponse: {
          enabled: true,
          subject: "Thank you for your Facebook profile!",
          message:
            "We've received your Facebook username and are processing your lead information. You'll hear from us soon!",
        },
        followUp: {
          enabled: true,
          delayDays: 2,
          subject: "Following up on your Facebook lead",
          message:
            "Hi there! We wanted to follow up on your Facebook profile submission. Do you have any questions about our services?",
        },
      },
    },

    instagram: {
      name: "Instagram Lead Generator",
      description:
        "Collect Instagram usernames and automatically scrape lead data",
      formType: "instagram",
      platformConfig: {
        scrapingEnabled: true,
        scrapingService: "apify",
        scrapingConfig: {
          actorId: "dev_fusion~instagram-profile-scraper",
          fields: ["usernames"],
        },
      },
      config: {
        fields: [
          {
            id: "instagram_username",
            name: "instagramUsername",
            type: "text",
            label: "Instagram Username",
            placeholder: "Enter your Instagram username (without @)",
            required: true,
            validation: {
              pattern: "^[a-zA-Z0-9._]+$",
              message: "Please enter a valid Instagram username",
            },
          },
        ],
        settings: {
          theme: "instagram",
          submitButtonText: "Generate Lead",
          successMessage:
            "Thank you! We're processing your Instagram profile...",
          redirectUrl: null,
        },
      },
      settings: {
        emailNotifications: {
          enabled: true,
          recipients: [],
          subject: "New Instagram Lead Generated",
        },
        autoResponse: {
          enabled: true,
          subject: "Thank you for your Instagram profile!",
          message:
            "We've received your Instagram username and are processing your lead information. You'll hear from us soon!",
        },
        followUp: {
          enabled: true,
          delayDays: 2,
          subject: "Following up on your Instagram lead",
          message:
            "Hi there! We wanted to follow up on your Instagram profile submission. Do you have any questions about our services?",
        },
      },
    },

    twitter: {
      name: "Twitter Lead Generator",
      description:
        "Collect Twitter usernames and automatically scrape lead data",
      formType: "twitter",
      platformConfig: {
        scrapingEnabled: true,
        scrapingService: "apify",
        scrapingConfig: {
          actorId: "dev_fusion~twitter-profile-scraper",
          fields: ["usernames"],
        },
      },
      config: {
        fields: [
          {
            id: "twitter_username",
            name: "twitterUsername",
            type: "text",
            label: "Twitter Username",
            placeholder: "Enter your Twitter username (without @)",
            required: true,
            validation: {
              pattern: "^[a-zA-Z0-9_]+$",
              message: "Please enter a valid Twitter username",
            },
          },
        ],
        settings: {
          theme: "twitter",
          submitButtonText: "Generate Lead",
          successMessage: "Thank you! We're processing your Twitter profile...",
          redirectUrl: null,
        },
      },
      settings: {
        emailNotifications: {
          enabled: true,
          recipients: [],
          subject: "New Twitter Lead Generated",
        },
        autoResponse: {
          enabled: true,
          subject: "Thank you for your Twitter profile!",
          message:
            "We've received your Twitter username and are processing your lead information. You'll hear from us soon!",
        },
        followUp: {
          enabled: true,
          delayDays: 2,
          subject: "Following up on your Twitter lead",
          message:
            "Hi there! We wanted to follow up on your Twitter profile submission. Do you have any questions about our services?",
        },
      },
    },
  };

  const template = templates[formType];
  if (!template) {
    throw new Error(`No template found for form type: ${formType}`);
  }

  return {
    ...template,
    companyId,
    status: "active",
    isPublic: true,
  };
};

// Create indexes for better query performance
formSchema.index({ createdAt: -1 });
formSchema.index({ "stats.submissions": -1 });

export const Form = mongoose.model("Form", formSchema);
