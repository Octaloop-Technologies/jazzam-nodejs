import { EngagementHistory } from "../models/engagementHistory.model.js";
import { DealHealth } from "../models/dealHealth.model.js";
import { Lead } from "../models/lead.model.js";
import FollowUp from "../models/followUp.model.js";
import OpenAI from "openai";

class DealHealthService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  /**
   * Log engagement event
   */
  async logEngagement(companyId, leadId, engagementData) {
    try {
      const engagement = new EngagementHistory({
        companyId,
        leadId,
        ...engagementData,
        engagementDate: new Date(),
      });

      await engagement.save();
      console.log(`[HEALTH] Engagement logged for lead ${leadId}`);

      // Trigger health score recalculation
      await this.calculateDealHealth(companyId, leadId);

      return engagement;
    } catch (error) {
      console.error(`[HEALTH] Failed to log engagement: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate deal health score for a lead
   */
  async calculateDealHealth(companyId, leadId) {
    try {
      const lead = await Lead.findById(leadId);
      if (!lead) throw new Error("Lead not found");

      // Get engagement history
      const engagements = await this.getEngagementHistory(leadId);
      const metrics = await this.calculateEngagementMetrics(engagements, lead);
      const velocityMetrics = await this.calculateVelocityMetrics(engagements, lead);
      const cadenceCompliance = await this.calculateCadenceCompliance(leadId);
      const riskIndicators = this.calculateRiskIndicators(metrics, velocityMetrics, cadenceCompliance);

      // Calculate health score
      const healthScore = this.calculateHealthScore(metrics, velocityMetrics, riskIndicators);
      const healthStatus = this.getHealthStatus(healthScore, riskIndicators);

      // Get AI-powered insights
      const aiAnalysis = await this.getAIAnalysis(lead, metrics, healthScore);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        metrics,
        velocityMetrics,
        riskIndicators,
        aiAnalysis
      );

      // Update or create deal health record
      let dealHealth = await DealHealth.findOne({ companyId, leadId });

      if (!dealHealth) {
        dealHealth = new DealHealth({
          companyId,
          leadId,
        });
      }

      // Update metrics
      dealHealth.healthScore = healthScore;
      dealHealth.healthStatus = healthStatus;
      dealHealth.engagementMetrics = metrics;
      dealHealth.velocityMetrics = velocityMetrics;
      dealHealth.cadenceCompliance = cadenceCompliance;
      dealHealth.riskIndicators = riskIndicators;
      dealHealth.recommendations = recommendations;
      dealHealth.aiAnalysis = aiAnalysis;
      dealHealth.lastAnalyzedAt = new Date();
      dealHealth.analysisCount = (dealHealth.analysisCount || 0) + 1;

      // Add to historical scores
      if (!dealHealth.historicalScores) {
        dealHealth.historicalScores = [];
      }
      dealHealth.historicalScores.push({
        score: healthScore,
        timestamp: new Date(),
      });

      // Keep only last 30 days of history
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dealHealth.historicalScores = dealHealth.historicalScores.filter(
        (h) => h.timestamp >= thirtyDaysAgo
      );

      await dealHealth.save();

      console.log(`[HEALTH] Health score calculated: ${healthScore} (${healthStatus})`);

      return dealHealth;
    } catch (error) {
      console.error(`[HEALTH] Failed to calculate deal health: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get engagement history for a lead
   */
  async getEngagementHistory(leadId, days = 90) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await EngagementHistory.find({
      leadId,
      engagementDate: { $gte: startDate },
    }).sort({ engagementDate: -1 });
  }

  /**
   * Calculate engagement metrics
   */
  async calculateEngagementMetrics(engagements, lead) {
    const emailEngagements = engagements.filter((e) => e.engagementType.includes("email"));
    const openedEmails = emailEngagements.filter((e) => e.emailMetrics?.openedAt);
    const clickedEmails = emailEngagements.filter((e) => e.emailMetrics?.clickedAt);
    const responses = engagements.filter((e) => e.engagementType === "response");

    const totalEmails = emailEngagements.length;
    const emailOpenRate = totalEmails > 0 ? (openedEmails.length / totalEmails) * 100 : 0;
    const emailClickRate = totalEmails > 0 ? (clickedEmails.length / totalEmails) * 100 : 0;

    // Calculate average response time
    let totalResponseTime = 0;
    let responseCount = 0;
    responses.forEach((r) => {
      if (r.responseTime) {
        totalResponseTime += r.responseTime;
        responseCount++;
      }
    });
    const averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount / 3600 : 0; // Convert to hours

    // Last contact date
    const lastEngagement = engagements[0];
    const lastContactDate = lastEngagement?.engagementDate || null;
    const daysSinceLastContact = lastContactDate
      ? Math.floor((new Date() - new Date(lastContactDate)) / (1000 * 60 * 60 * 24))
      : null;

    return {
      totalEmails,
      emailOpenRate: Math.round(emailOpenRate),
      emailClickRate: Math.round(emailClickRate),
      averageResponseTime: Math.round(averageResponseTime * 10) / 10,
      totalContacts: engagements.length,
      lastContactDate,
      daysSinceLastContact,
    };
  }

  /**
   * Calculate velocity metrics
   */
  async calculateVelocityMetrics(engagements, lead) {
    // Calculate emails per week
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const emailsLastWeek = engagements.filter(
      (e) =>
        e.engagementType.includes("email") &&
        new Date(e.engagementDate) >= sevenDaysAgo
    ).length;
    const emailsPerWeek = emailsLastWeek;

    // Calculate engagement decay
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const engagementsLastTwoWeeks = engagements.filter(
      (e) => new Date(e.engagementDate) >= twoWeeksAgo
    ).length;
    const engagementDecayDays = engagementsLastTwoWeeks === 0 
      ? Math.floor((new Date() - new Date(engagements[0]?.engagementDate || new Date())) / (1000 * 60 * 60 * 24))
      : 0;

    // Calculate contact frequency trend
    const lastWeekEngagements = engagements.filter(
      (e) => new Date(e.engagementDate) >= sevenDaysAgo
    ).length;
    const twoWeeksEngagements = engagements.filter((e) => {
      const eDate = new Date(e.engagementDate);
      return eDate >= twoWeeksAgo && eDate < sevenDaysAgo;
    }).length;

    let contactFrequencyTrend = "stable";
    if (lastWeekEngagements > twoWeeksEngagements) {
      contactFrequencyTrend = "increasing";
    } else if (lastWeekEngagements < twoWeeksEngagements) {
      contactFrequencyTrend = "decreasing";
    }

    // Calculate days in current stage
    const daysInCurrentStage = lead.status 
      ? Math.floor((new Date() - new Date(lead.updatedAt)) / (1000 * 60 * 60 * 24))
      : 0;

    // Stage progression speed
    let stageProgressionSpeed = "normal";
    if (daysInCurrentStage > 30) stageProgressionSpeed = "slow";
    if (daysInCurrentStage < 7) stageProgressionSpeed = "fast";

    return {
      emailsPerWeek,
      contactFrequencyTrend,
      engagementDecayDays,
      daysInCurrentStage,
      stageProgressionSpeed,
    };
  }

  /**
   * Calculate cadence compliance
   */
  async calculateCadenceCompliance(leadId) {
    const followUps = await FollowUp.find({ leadId })
      .sort({ dateOfSubmission: -1 })
      .limit(10);

    if (followUps.length < 2) {
      return {
        expectedContactFrequency: 7,
        actualContactFrequency: 0,
        compliancePercentage: 0,
        cadenceViolations: 0,
        lastCadenceCheck: new Date(),
      };
    }

    // Calculate average days between contacts
    let totalGaps = 0;
    for (let i = 0; i < followUps.length - 1; i++) {
      const gap = Math.floor(
        (new Date(followUps[i].dateOfSubmission) - new Date(followUps[i + 1].dateOfSubmission)) /
          (1000 * 60 * 60 * 24)
      );
      totalGaps += gap;
    }
    const actualContactFrequency = Math.round(totalGaps / (followUps.length - 1));
    const expectedContactFrequency = 7; // Default: weekly

    // Count cadence violations (gaps > 14 days)
    let cadenceViolations = 0;
    for (let i = 0; i < followUps.length - 1; i++) {
      const gap = Math.floor(
        (new Date(followUps[i].dateOfSubmission) - new Date(followUps[i + 1].dateOfSubmission)) /
          (1000 * 60 * 60 * 24)
      );
      if (gap > 14) cadenceViolations++;
    }

    const compliancePercentage = Math.max(0, 100 - cadenceViolations * 20);

    return {
      expectedContactFrequency,
      actualContactFrequency,
      compliancePercentage,
      cadenceViolations,
      lastCadenceCheck: new Date(),
    };
  }

  /**
   * Calculate risk indicators
   */
  calculateRiskIndicators(metrics, velocityMetrics, cadenceCompliance) {
    const noResponseDays = metrics.daysSinceLastContact || 0;
    const lowEngagement = metrics.emailOpenRate < 20;
    const stageStaleness = velocityMetrics.daysInCurrentStage > 30;

    // Calculate risk level
    let riskLevel = "low";
    let riskScore = 0;

    if (noResponseDays > 14) riskScore += 30;
    if (lowEngagement) riskScore += 25;
    if (stageStaleness) riskScore += 20;
    if (cadenceCompliance.cadenceViolations > 2) riskScore += 15;
    if (velocityMetrics.contactFrequencyTrend === "decreasing") riskScore += 10;

    if (riskScore > 60) riskLevel = "high";
    else if (riskScore > 30) riskLevel = "medium";

    return {
      noResponseDays,
      emailUnsubscribed: false,
      bounceDetected: false,
      lowEngagement,
      stageStaleness,
      riskLevel,
    };
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(metrics, velocityMetrics, riskIndicators) {
    let score = 100;

    // Email engagement impact (40% weight)
    const engagementScore = (metrics.emailOpenRate + metrics.emailClickRate) / 2;
    score -= (100 - engagementScore) * 0.4;

    // Response time impact (20% weight)
    const responseTimeScore = Math.max(0, 100 - (metrics.averageResponseTime || 0) * 5);
    score -= (100 - responseTimeScore) * 0.2;

    // Contact frequency impact (20% weight)
    const frequencyScore = Math.min(100, metrics.totalContacts * 10);
    score -= (100 - frequencyScore) * 0.2;

    // Risk indicators impact (20% weight)
    const riskScore = riskIndicators.riskLevel === "high" ? 30 : riskIndicators.riskLevel === "medium" ? 15 : 0;
    score -= riskScore * 0.2;

    return Math.max(0, Math.round(score));
  }

  /**
   * Get health status based on score
   */
  getHealthStatus(score, riskIndicators) {
    if (riskIndicators.riskLevel === "high") return "at_risk";
    if (score >= 80) return "excellent";
    if (score >= 60) return "good";
    if (score >= 40) return "fair";
    if (score >= 20) return "poor";
    return "inactive";
  }

  /**
   * Get AI-powered analysis
   */
  async getAIAnalysis(lead, metrics, healthScore) {
    try {
      const prompt = `
Analyze this deal/lead health and predict outcomes:

Lead: ${lead.fullName}
Company: ${lead.company}
Status: ${lead.status}
Health Score: ${healthScore}/100

Engagement Metrics:
- Total Emails: ${metrics.totalEmails}
- Email Open Rate: ${metrics.emailOpenRate}%
- Email Click Rate: ${metrics.emailClickRate}%
- Average Response Time: ${metrics.averageResponseTime} hours
- Days Since Last Contact: ${metrics.daysSinceLastContact}

Based on this data, provide:
1. Churn Risk Score (0-100): How likely is this lead to churn?
2. Success Probability (0-100): How likely are they to convert?
3. Predicted Outcome: conversion, churn, or stagnant
4. Reasoning: Brief explanation in 1-2 sentences

Respond ONLY in valid JSON format:
{
  "churnRiskScore": <number>,
  "successProbability": <number>,
  "predictedOutcome": "conversion|churn|stagnant",
  "reasoning": "explanation"
}`;

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      });

      const responseContent = completion.choices[0].message.content.trim();
      const cleanedResponse = responseContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const aiAnalysis = JSON.parse(cleanedResponse);
      return aiAnalysis;
    } catch (error) {
      console.error("[HEALTH] AI analysis failed:", error.message);
      return {
        churnRiskScore: 50,
        successProbability: 50,
        predictedOutcome: "stagnant",
        reasoning: "Analysis unavailable",
      };
    }
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(metrics, velocityMetrics, riskIndicators, aiAnalysis) {
    const recommendations = [];

    // Low engagement
    if (metrics.emailOpenRate < 20) {
      recommendations.push({
        recommendation: "Very low email open rate",
        priority: "high",
        action: "Review email subject lines and send times. Consider A/B testing different approaches.",
      });
    }

    // No response for long time
    if (metrics.daysSinceLastContact > 14) {
      recommendations.push({
        recommendation: "No response for over 2 weeks",
        priority: "high",
        action: "Escalate to sales manager for personalized outreach or decision to close deal.",
      });
    }

    // Engagement decay
    if (velocityMetrics.contactFrequencyTrend === "decreasing") {
      recommendations.push({
        recommendation: "Engagement is declining",
        priority: "medium",
        action: "Adjust outreach strategy. Try different communication channels or angles.",
      });
    }

    // Cadence violations
    if (riskIndicators.stageStaleness) {
      recommendations.push({
        recommendation: "Deal stuck in current stage for over 30 days",
        priority: "medium",
        action: "Require action: follow-up call, discovery meeting, or stage transition.",
      });
    }

    // High churn risk
    if (aiAnalysis.churnRiskScore > 70) {
      recommendations.push({
        recommendation: "High churn risk detected",
        priority: "high",
        action: "Immediate intervention: schedule executive check-in or special offer.",
      });
    }

    // Low success probability
    if (aiAnalysis.successProbability < 30) {
      recommendations.push({
        recommendation: "Low probability of conversion",
        priority: "medium",
        action: "Consider lead qualification. May need to move to nurture pipeline.",
      });
    }

    return recommendations;
  }

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(companyId) {
    try {
      const dealHealthRecords = await DealHealth.find({ companyId })
        .populate("leadId", "fullName email company status")
        .sort({ healthScore: -1 });

      const totalLeads = dealHealthRecords.length;
      const excellentLeads = dealHealthRecords.filter((d) => d.healthStatus === "excellent").length;
      const goodLeads = dealHealthRecords.filter((d) => d.healthStatus === "good").length;
      const fairLeads = dealHealthRecords.filter((d) => d.healthStatus === "fair").length;
      const poorLeads = dealHealthRecords.filter((d) => d.healthStatus === "poor").length;
      const atRiskLeads = dealHealthRecords.filter((d) => d.healthStatus === "at_risk").length;

      const averageHealthScore =
        totalLeads > 0
          ? Math.round(dealHealthRecords.reduce((sum, d) => sum + d.healthScore, 0) / totalLeads)
          : 0;

      const highRiskLeads = dealHealthRecords.filter(
        (d) => d.riskIndicators.riskLevel === "high"
      );

      return {
        summary: {
          totalLeads,
          averageHealthScore,
          excellentLeads,
          goodLeads,
          fairLeads,
          poorLeads,
          atRiskLeads,
        },
        distribution: {
          excellent: excellentLeads,
          good: goodLeads,
          fair: fairLeads,
          poor: poorLeads,
          atRisk: atRiskLeads,
        },
        topRisks: highRiskLeads.slice(0, 10).map((d) => ({
          leadId: d.leadId._id,
          leadName: d.leadId.fullName,
          healthScore: d.healthScore,
          riskLevel: d.riskIndicators.riskLevel,
          recommendations: d.recommendations.slice(0, 3),
        })),
        metrics: {
          averageEmailOpenRate:
            dealHealthRecords.length > 0
              ? Math.round(
                  dealHealthRecords.reduce((sum, d) => sum + (d.engagementMetrics?.emailOpenRate || 0), 0) /
                    dealHealthRecords.length
                )
              : 0,
          averageEmailClickRate:
            dealHealthRecords.length > 0
              ? Math.round(
                  dealHealthRecords.reduce((sum, d) => sum + (d.engagementMetrics?.emailClickRate || 0), 0) /
                    dealHealthRecords.length
                )
              : 0,
          averageResponseTime:
            dealHealthRecords.length > 0
              ? (
                  dealHealthRecords.reduce((sum, d) => sum + (d.engagementMetrics?.averageResponseTime || 0), 0) /
                  dealHealthRecords.length
                ).toFixed(1)
              : 0,
        },
      };
    } catch (error) {
      console.error("[HEALTH] Failed to get dashboard metrics:", error.message);
      throw error;
    }
  }

  /**
   * Batch calculate health for multiple leads
   */
  async batchCalculateHealth(companyId, leadIds = null) {
    try {
      let leads;

      if (leadIds && Array.isArray(leadIds)) {
        leads = await Lead.find({
          companyId,
          _id: { $in: leadIds },
        });
      } else {
        leads = await Lead.find({ companyId });
      }

      console.log(`[HEALTH] Batch calculating health for ${leads.length} leads`);

      for (const lead of leads) {
        try {
          await this.calculateDealHealth(companyId, lead._id);
          await this.delay(500); // Avoid overwhelming AI API
        } catch (error) {
          console.error(`[HEALTH] Failed to calculate health for lead ${lead._id}:`, error.message);
        }
      }

      return {
        success: true,
        processedLeads: leads.length,
      };
    } catch (error) {
      console.error("[HEALTH] Batch calculation failed:", error.message);
      throw error;
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const dealHealthService = new DealHealthService();
export default dealHealthService;