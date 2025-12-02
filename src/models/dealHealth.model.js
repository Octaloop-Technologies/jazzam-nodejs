import mongoose, { mongo, Schema } from "mongoose";

const dealHealthSchema = new Schema(
    {
        // References
        companyId: {
            type: Schema.Types.ObjectId,
            ref: "Company",
            required: true,
            index: true
        },
        leadId: {
            type: Schema.Types.ObjectId,
            ref: "Lead",
            required: true,
            index: true
        },

        // Health Score
        healthScore: {
            type: Number,
            min: 0,
            max: 100,
            default: 0
        },

        // Health Status
        healthStatus: {
            type: String,
            enum: ["excellent", "good", "fair", "poor", "at_risk", "inactive"],
            default: "fair",
            index: true
        },

        // Engagement Metrics
        engagementMetrics: {
            totalEmails: { type: Number, default: 0 },
            emailOpenRate: { type: Number, default: 0 },
            emailClickRate: { type: Number, default: 0 },
            averageResponseTime: { type: Number, default: 0 },
            totalContacts: { type: Number, default: 0 },
            lastContactDate: Date,
            daysSinceLastContact: { type: Number, default: 0 } 
        },

        // Velocity Metrics
        velocityMetrics: {
            emailsPerWeek: { type: Number, default: 0 },
            contactFrequencyTrend: { type: String, enum: ["increasing", "decreasing", "stable"], default: "stable" },
            engagementDecayDays: { type: Number, default: 0 },
            daysInCurrentStage: { type: Number, default: 0 },
            stageProgressSpeed: { type: Number, enum: ["fast", "normal", "slow"], default: "normal" }
        },

        // Cadence Compliance
        cadenceCompliance: {
            expectedContactFrequency: { type: Number, default: 7 },
            actualContactFrequency: { type: Number, default: 0 },
            compliancePercentage: { type: Number, default: 0 },
            cadenceViolations: { type: Number, default: 0 },
            lastCadenceCheck: Date 
        },

        // Risk Indicators
        riskIndicators: {
            noResponseDays: { type: Number, default: 0 },
            emailUnsubscribed: { type: Boolean, default: false },
            bounceDetected: { type: Boolean, default: false },
            lowEngagement: { type: Boolean, default: false },
            stageStaleness: { type: Boolean, default: false },
            riskLevel: { type: String, enum: ["high", "medium", "low"], default: "low" }
        },

        // Recommendations
        recommendations: [
            {
                recommendation: String,
                priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
                action: String,
                createdAt: { type: Date, default: Date.now }
            },
        ],

        // Analysis metadata
        lastAnalyzedAt: Date,
        analysisCount: { type: Number, default: 0 },
        analyzedBy: {
            type: String,
            enum: ["system", "ai", "manual"],
            default: "system"
        },

        // AI analysis Results
        aiAnalysis: {
            churnRiskScore: { type: Number, min: 0, max: 100, default: 0 },
            successProbility: { type: Number, min: 0, max: 100, default: 0 },
            predictedOutcome: { type: String, enum: ["conversion", "churn", "stagnant"], default: "stagnant" },
            reasoning: String
        },

        // Raw metrics for trending
        historicalScores: [
            {
                score: Number,
                timestamps: Date
            }
        ],
    },
    {
        timestamps: true
    }
);

// Indexes
dealHealthSchema.index({ companyId: 1, leadId: 1 });
dealHealthSchema.index({ companyId: 1, healthStatus: 1 });
dealHealthSchema.index({ companyId: 1, lastAnalyzedAt: -1 });
dealHealthSchema.index({ "riskIndicators.riskLevel": 1, companyId: 1 })

export const DealHealth = mongoose.model("DealHealth", dealHealthSchema)