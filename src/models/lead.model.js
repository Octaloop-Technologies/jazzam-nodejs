import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const leadSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    linkedinProfile: {
      type: String,
      trim: true,
    },
    company: {
      type: String,
      required: [true, "Company is required"],
      trim: true,
      index: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
      index: true,
    },
    website: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      required: [true, "Industry is required"],
      trim: true,
      index: true,
      enum: [
        "technology",
        "healthcare",
        "finance",
        "education",
        "manufacturing",
        "retail",
        "real estate",
        "consulting",
        "marketing",
        "legal",
        "non-profit",
        "government",
        "entertainment",
        "agriculture",
        "transportation",
        "energy",
        "construction",
        "food & beverage",
        "telecommunications",
        "other",
      ],
    },
    companySize: {
      type: String,
      required: [true, "Company size is required"],
      enum: [
        "1-10 employees",
        "11-50 employees",
        "51-200 employees",
        "201-500 employees",
        "501-1000 employees",
        "1001-5000 employees",
        "5000+ employees",
      ],
    },
    source: {
      type: String,
      required: [true, "Source is required"],
      trim: true,
      index: true,
      enum: [
        "website",
        "social media",
        "email campaign",
        "cold outreach",
        "referral",
        "event",
        "advertisement",
        "content marketing",
        "seo",
        "partnership",
        "direct sales",
        "linkedin",
        "other",
      ],
    },
    interests: {
      type: [String],
      required: [true, "Interests are required"],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: "At least one interest is required",
      },
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: ["cold", "warm", "hot", "qualified"],
      default: "cold",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    // Additional tracking fields
    lastContactDate: {
      type: Date,
      default: Date.now,
    },
    nextFollowUpDate: {
      type: Date,
    },
    leadScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound indexes for better query performance
leadSchema.index({ email: 1, company: 1 });
leadSchema.index({ status: 1, industry: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({
  name: "text",
  company: "text",
  email: "text",
  location: "text",
});

// Add pagination plugin
leadSchema.plugin(mongooseAggregatePaginate);

// Pre-save middleware to calculate lead score
leadSchema.pre("save", function (next) {
  if (
    this.isModified("status") ||
    this.isModified("interests") ||
    this.isModified("companySize")
  ) {
    let score = 0;

    // Score based on status
    switch (this.status) {
      case "hot":
        score += 40;
        break;
      case "warm":
        score += 25;
        break;
      case "qualified":
        score += 35;
        break;
      case "cold":
        score += 10;
        break;
    }

    // Score based on interests count
    score += Math.min(this.interests.length * 5, 25);

    // Score based on company size
    if (
      this.companySize.includes("1000+") ||
      this.companySize.includes("5000+")
    ) {
      score += 20;
    } else if (
      this.companySize.includes("501-1000") ||
      this.companySize.includes("201-500")
    ) {
      score += 15;
    } else {
      score += 10;
    }

    // Additional score for LinkedIn profile
    if (this.linkedinProfile) score += 10;

    // Additional score for website
    if (this.website) score += 5;

    this.leadScore = Math.min(score, 100);
  }
  next();
});

// Instance method to update lead status
leadSchema.methods.updateStatus = function (newStatus, notes) {
  this.status = newStatus;
  this.lastContactDate = new Date();
  if (notes) this.notes = this.notes ? `${this.notes}\n\n${notes}` : notes;
  return this.save();
};

// Static method to find leads by criteria
leadSchema.statics.findBySearchCriteria = function (searchQuery) {
  const query = {};

  if (searchQuery.status) query.status = searchQuery.status;
  if (searchQuery.industry) query.industry = searchQuery.industry;
  if (searchQuery.source) query.source = searchQuery.source;
  if (searchQuery.companySize) query.companySize = searchQuery.companySize;
  if (searchQuery.assignedTo) query.assignedTo = searchQuery.assignedTo;
  if (searchQuery.isActive !== undefined) query.isActive = searchQuery.isActive;

  return this.find(query);
};

export const Lead = mongoose.model("Lead", leadSchema);
