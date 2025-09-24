import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const leadSchema = new Schema(
  {
    // Basic LinkedIn Profile Information
    linkedinProfileUrl: {
      type: String,
      required: [true, "LinkedIn profile URL is required"],
      trim: true,
      index: true,
    },
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
    headline: {
      type: String,
      trim: true,
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
    followers: {
      type: Number,
      default: 0,
    },
    connections: {
      type: Number,
      default: 0,
    },
    publicIdentifier: {
      type: String,
      trim: true,
    },
    urn: {
      type: String,
      trim: true,
    },

    // Company Information
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
    companyLinkedin: {
      type: String,
      trim: true,
    },
    companyFoundedIn: {
      type: Number,
    },
    companySize: {
      type: String,
    },

    // Job Information
    jobTitle: {
      type: String,
      trim: true,
    },
    currentJobDuration: {
      type: String,
      trim: true,
    },
    currentJobDurationInYrs: {
      type: Number,
    },

    // Location Information
    location: {
      type: String,
      trim: true,
      index: true,
    },
    addressCountryOnly: {
      type: String,
      trim: true,
    },
    addressWithCountry: {
      type: String,
      trim: true,
    },
    addressWithoutCountry: {
      type: String,
      trim: true,
    },

    // Profile Media
    profilePic: {
      type: String,
      trim: true,
    },
    profilePicHighQuality: {
      type: String,
      trim: true,
    },
    profilePicAllDimensions: [
      {
        width: Number,
        height: Number,
        url: String,
      },
    ],

    // Profile Content
    about: {
      type: String,
      trim: true,
    },
    creatorWebsite: {
      name: String,
      link: String,
    },

    // Professional Data Arrays
    experiences: [
      {
        companyId: String,
        companyUrn: String,
        companyLink1: String,
        logo: String,
        title: String,
        subtitle: String,
        caption: String,
        metadata: String,
        breakdown: Boolean,
        subComponents: [
          {
            title: String,
            caption: String,
            metadata: String,
            description: Schema.Types.Mixed,
          },
        ],
      },
    ],
    educations: [
      {
        companyId: String,
        companyUrn: String,
        companyLink1: String,
        logo: String,
        title: String,
        subtitle: String,
        breakdown: Boolean,
        subComponents: [
          {
            description: Schema.Types.Mixed,
          },
        ],
      },
    ],
    skills: [
      {
        title: String,
        subComponents: [
          {
            type: Schema.Types.Mixed,
          },
        ],
      },
    ],
    languages: [
      {
        title: String,
        breakdown: Boolean,
        subComponents: [
          {
            description: Schema.Types.Mixed,
          },
        ],
      },
    ],
    interests: [
      {
        section_name: String,
        section_components: [
          {
            titleV2: String,
            caption: String,
            subtitle: String,
            size: String,
            textActionTarget: String,
            subComponents: [
              {
                insightComponent: {
                  text: String,
                  actionTarget: String,
                },
              },
            ],
          },
        ],
      },
    ],

    // Additional Arrays
    // licenseAndCertificates: [Schema.Types.Mixed],
    // honorsAndAwards: [Schema.Types.Mixed],
    // volunteerAndAwards: [Schema.Types.Mixed],
    // verifications: [Schema.Types.Mixed],
    // promos: [Schema.Types.Mixed],
    // highlights: [Schema.Types.Mixed],
    // projects: [Schema.Types.Mixed],
    // publications: [Schema.Types.Mixed],
    // patents: [Schema.Types.Mixed],
    // courses: [Schema.Types.Mixed],
    // testScores: [Schema.Types.Mixed],
    // organizations: [Schema.Types.Mixed],
    // volunteerCauses: [Schema.Types.Mixed],
    // recommendations: [Schema.Types.Mixed],
    // updates: [Schema.Types.Mixed],

    // BANT (Budget, Authority, Need, Timeline) Lead Qualification Fields
    bant: {
      budget: {
        value: {
          type: String,
          default: "Not available",
        },
      },
      authority: {
        value: {
          type: String,
          default: "Not available",
        },
        isDecisionMaker: {
          type: Boolean,
          default: false,
        },
      },
      need: {
        value: {
          type: String,
          default: "Not available",
        },
      },
      timeline: {
        value: {
          type: String,
          default: "Not available",
        },
      },
    },

    // Lead Management Fields
    status: {
      type: String,
      enum: ["new", "cold", "warm", "hot", "qualified"],
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
        type: String,
        trim: true,
      },
    ],
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
  },
  {
    timestamps: true,
  }
);

// Create compound indexes for better query performance
leadSchema.index({ email: 1, company: 1 });
leadSchema.index({ status: 1, companyIndustry: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({
  fullName: "text",
  company: "text",
  email: "text",
  location: "text",
  headline: "text",
});

// Add pagination plugin
leadSchema.plugin(mongooseAggregatePaginate);

// Static method to find leads by criteria
leadSchema.statics.findBySearchCriteria = function (searchQuery) {
  const query = {};

  if (searchQuery.status) query.status = searchQuery.status;
  if (searchQuery.companyIndustry)
    query.companyIndustry = searchQuery.companyIndustry;
  if (searchQuery.companySize) query.companySize = searchQuery.companySize;
  if (searchQuery.assignedTo) query.assignedTo = searchQuery.assignedTo;
  if (searchQuery.location) query.location = searchQuery.location;

  return this.find(query);
};

export const Lead = mongoose.model("Lead", leadSchema);
