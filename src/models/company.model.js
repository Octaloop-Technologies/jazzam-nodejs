import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { securityConfig } from "../config/security.config.js";

const companySchema = new Schema(
  {
    // Basic Company Information
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    // companyDescription
    description: {
      type: String
    },

    // company skill type
    companyServiceType: {
      type: String
    },

    companySubServices: {
      type: [String],
    },

    // user type
    userType: {
      enum: ["user", "company"],
      type: String,
      default: "user"
    },

    // user first time login
    userFirstLogin: {
      type: Boolean,
      default: true
    },

    // Company Details
    website: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    companySize: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "500+"],
    },

    // Contact Information
    contactPerson: {
      name: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
    },

    // Subscription Management
    subscriptionStatus: {
      type: String,
      enum: ["trial", "active", "pending_payment", "cancelled", "expired"],
      default: "trial",
    },
    subscriptionPlan: {
      type: String,
      enum: ["free", "starter", "growth", "pro"],
      default: "free",
    },
    trialEndDate: {
      type: Date,
    },
    subscriptionStartDate: {
      type: Date,
    },
    subscriptionEndDate: {
      type: Date,
    },

    // Payment Information
    paymentMethod: {
      type: String,
      enum: ["none", "stripe", "payfort", "paypal", "bank_transfer"],
      default: "none",
    },
    paymentDetails: {
      // Stripe fields
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      // PayFort fields
      payfortMerchantReference: String,
      payfortFortId: String,
      payfortTokenName: String,
      // Common fields
      lastPaymentDate: Date,
      nextPaymentDate: Date,
      lastPaymentAmount: Number,
      paymentCurrency: String,
    },

    // Company Settings
    settings: {
      timezone: {
        type: String,
        default: "UTC",
      },
      currency: {
        type: String,
        default: "USD",
      },
      language: {
        type: String,
        default: "en",
      },
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      leadNotifications: {
        type: Boolean,
        default: true,
      },
      autoBANTQualification: {
        type: Boolean,
        default: true,
      },
    },

    // Company Branding
    logo: {
      url: {
        type: String,
      },
      public_id: {
        type: String,
      },
    },

    // Authentication
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
    },
    verificationTokenExpiry: {
      type: Date,
    },

    // OAuth Integration
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    zohoId: {
      type: String,
      unique: true,
      sparse: true,
    },
    provider: {
      type: String,
      enum: ["local", "google", "zoho"],
      default: "local",
    },
    refreshToken: {
      type: String,
    },

    // Usage Tracking
    usageStats: {
      totalLeads: {
        type: Number,
        default: 0,
      },
      leadsThisMonth: {
        type: Number,
        default: 0,
      },
      formsCreated: {
        type: Number,
        default: 0,
      },
      emailsSent: {
        type: Number,
        default: 0,
      },
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },

    // Onboarding
    onboarding: {
      completed: {
        type: Boolean,
        default: false,
      },
      currentStep: {
        type: Number,
        default: 0,
      },
      completedSteps: {
        type: [Number],
        default: [],
      },
      skipped: {
        type: Boolean,
        default: false,
      },
      completedAt: {
        type: Date,
      },
    },

    // Company onboarding status
    companyOnboarding: {
      type: Boolean,
      default: false
    },

    // Team management
    subscriptionSeats: {
      type: Number,
      default: 0, // Owner + additional seats
    },
    usedSeats: {
      type: Number,
      default: 0, // Owner counts as 1 seat
    },
    joinedCompanies:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },
    joinedCompanyStatus:{
      type: Boolean,
      default: false
    },
    teamMembers: [
      {
        company: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Company",
          required: true,
        },
        role: {
          type: String,
          enum: ["owner", "member"],
          default: "member",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    emailVerified: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
companySchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Check if password is correct
companySchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Generate access and refresh token
companySchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      companyName: this.companyName,
      email: this.email,
    },
    securityConfig.jwt.accessTokenSecret,
    {
      expiresIn: securityConfig.jwt.accessTokenExpiry,
    }
  );
};

companySchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    securityConfig.jwt.refreshTokenSecret,
    {
      expiresIn: securityConfig.jwt.refreshTokenExpiry,
    }
  );
};

// Check if company is on trial
companySchema.methods.isOnTrial = function () {
  return this.subscriptionStatus === "trial" && this.trialEndDate > new Date();
};

// Check if company has active subscription
companySchema.methods.hasActiveSubscription = function () {
  return (
    this.subscriptionStatus === "active" &&
    this.subscriptionEndDate &&
    this.subscriptionEndDate > new Date()
  );
};

// Check if company can access premium features
companySchema.methods.canAccessPremiumFeatures = function () {
  return this.hasActiveSubscription() || this.isOnTrial();
};

// Update usage stats
companySchema.methods.incrementLeadCount = function () {
  this.usageStats.totalLeads += 1;
  this.usageStats.leadsThisMonth += 1;
  return this.save();
};

companySchema.methods.incrementFormCount = function () {
  this.usageStats.formsCreated += 1;
  return this.save();
};

companySchema.methods.incrementEmailCount = function () {
  this.usageStats.emailsSent += 1;
  return this.save();
};

// Create indexes for better query performance
companySchema.index({ subscriptionPlan: 1 });
companySchema.index({ isActive: 1 });
companySchema.index({ createdAt: -1 });

// Virtual to check if company can add more team members
companySchema.virtual("canAddTeamMembers").get(function () {
  return this.usedSeats < this.subscriptionSeats;
});

// Method to check available seats
companySchema.methods.getAvailableSeats = function () {
  return this.subscriptionSeats - this.usedSeats;
};

export const Company = mongoose.model("Company", companySchema);
