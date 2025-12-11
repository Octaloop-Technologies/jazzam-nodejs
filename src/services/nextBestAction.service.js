import { NextBestAction } from "../models/nextBestAction.model.js";
import { DealHealth } from "../models/dealHealth.model.js";
import { Lead } from "../models/lead.model.js";
import { EngagementHistory } from "../models/engagementHistory.model.js";
import OpenAI from "openai";

class NextBestActionService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  /**
   * Generate next best action for a lead
   */
  async generateNextBestAction(companyId, leadId) {
    try {
      // Fetch lead and related data
      const lead = await Lead.findById(leadId);
      if (!lead) throw new Error("Lead not found");

      const dealHealth = await DealHealth.findOne({ companyId, leadId });
      if (!dealHealth) throw new Error("Deal health data not found");

      const engagements = await EngagementHistory.find({ leadId })
        .sort({ engagementDate: -1 })
        .limit(20);

      // Calculate key metrics for action determination
      const leadContext = this.buildLeadContext(lead, dealHealth, engagements);

      // Generate action based on rules and AI
      const action = await this.determineAction(leadContext, lead, dealHealth);

      // Generate AI-powered reasoning
      const aiReasoning = await this.generateAIReasoning(leadContext, action);

      // Create the next best action record
      const nextAction = new NextBestAction({
        companyId,
        leadId,
        dealHealthId: dealHealth._id,
        actionType: action.type,
        title: action.title,
        description: action.description,
        channel: action.channel,
        priority: action.priority,
        confidenceScore: action.confidenceScore,
        recommendedTiming: action.timing,
        recommendedDate: action.recommendedDate,
        templateSuggestion: action.template || null,
        reasoning: {
          healthScore: dealHealth.healthScore,
          healthStatus: dealHealth.healthStatus,
          lastContactDays: dealHealth.engagementMetrics?.daysSinceLastContact || 0,
          engagementTrend: dealHealth.velocityMetrics?.contactFrequencyTrend,
          riskFactors: dealHealth.riskIndicators?.riskLevel === "high" ? ["high_risk"] : [],
          opportunities: this.identifyOpportunities(dealHealth, lead),
        },
        aiReasoning: aiReasoning,
        expiresAt: this.calculateExpiryDate(action.timing),
      });

      await nextAction.save();
      console.log(`[NBA] Generated action ${nextAction._id} for lead ${leadId}`);

      return nextAction;
    } catch (error) {
      console.error(`[NBA] Failed to generate action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build context about the lead for decision making
   */
  buildLeadContext(lead, dealHealth, engagements) {
    const emailEngagements = engagements.filter((e) =>
      e.engagementType.includes("email")
    );
    const lastEngagement = engagements[0];
    const daysSinceLastContact = dealHealth.engagementMetrics?.daysSinceLastContact || 0;

    return {
      lead: {
        id: lead._id,
        name: lead.fullName,
        email: lead.email,
        company: lead.company,
        jobTitle: lead.jobTitle,
        status: lead.status,
        platform: lead.platform,
        bantScore: lead.bant?.totalScore || 0,
        bantCategory: lead.bant?.category,
      },
      engagement: {
        totalEmails: emailEngagements.length,
        openRate: dealHealth.engagementMetrics?.emailOpenRate,
        clickRate: dealHealth.engagementMetrics?.emailClickRate,
        responseRate: emailEngagements.length > 0
          ? (engagements.filter((e) => e.engagementType === "response").length /
            emailEngagements.length) *
          100
          : 0,
        daysSinceLastContact: daysSinceLastContact,
        lastEngagementType: lastEngagement?.engagementType,
        lastEngagementOutcome: lastEngagement?.outcome,
      },
      health: {
        score: dealHealth.healthScore,
        status: dealHealth.healthStatus,
        riskLevel: dealHealth.riskIndicators?.riskLevel,
        trend: dealHealth.velocityMetrics?.contactFrequencyTrend,
      },
      risks: {
        noResponse: daysSinceLastContact > 14,
        lowEngagement: dealHealth.engagementMetrics?.emailOpenRate < 20,
        stageStaleness: dealHealth.riskIndicators?.stageStaleness,
        churnRisk: dealHealth.aiAnalysis?.churnRiskScore > 70,
      },
    };
  }

  /**
   * Determine the best action using rules and AI
   */
  async determineAction(context, lead, dealHealth) {
    // Rule-based action determination
    const rules = this.evaluateActionRules(context);

    // If high confidence rule match, use it
    if (rules.action) {
      return rules.action;
    }

    // Otherwise, use AI for more nuanced decision
    const aiAction = await this.getAIAction(context, lead, dealHealth);
    return aiAction;
  }

  /**
   * Evaluate predefined rules for action
   */
  evaluateActionRules(context) {
    const { engagement, health, risks } = context;

    // Rule 1: No response for 2+ weeks with hot lead - escalate
    if (risks.noResponse && context.lead.bantCategory === "hot") {
      return {
        action: {
          type: "escalate_to_sales",
          title: "Escalate Hot Lead - No Response",
          description: `${context.lead.name} from ${context.lead.company} is a hot lead with no response for ${engagement.daysSinceLastContact} days. Escalate to sales manager.`,
          channel: "phone",
          priority: "critical",
          confidenceScore: 95,
          timing: "immediate",
          recommendedDate: new Date(),
        },
      };
    }

    // Rule 2: Very low engagement rate - change strategy
    if (engagement.openRate < 15 && engagement.totalEmails > 3) {
      return {
        action: {
          type: "send_personalized_message",
          title: "Low Engagement - Switch to Personalized Approach",
          description: `${context.lead.name} has very low email open rate (${engagement.openRate.toFixed(0)}%). Send highly personalized message.`,
          channel: "linkedin",
          priority: "high",
          confidenceScore: 85,
          timing: "within_24h",
          recommendedDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      };
    }

    // Rule 3: Good health but no recent contact - check-in
    if (health.status === "good" && engagement.daysSinceLastContact > 7) {
      return {
        action: {
          type: "follow_up_check_in",
          title: "Check-in with Engaged Lead",
          description: `${context.lead.name} is showing good engagement but no contact for ${engagement.daysSinceLastContact} days. Send friendly check-in.`,
          channel: "email",
          priority: "medium",
          confidenceScore: 80,
          timing: "within_3_days",
          recommendedDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      };
    }

    // Rule 4: Declining engagement - move to nurture
    if (context.health.trend === "decreasing" && engagement.totalEmails > 5) {
      return {
        action: {
          type: "move_to_nurture",
          title: "Declining Engagement - Move to Nurture",
          description: `${context.lead.name}'s engagement is declining. Move to nurture pipeline with valuable content.`,
          channel: "email",
          priority: "medium",
          confidenceScore: 75,
          timing: "within_week",
          recommendedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      };
    }

    // Rule 5: Good BANT score and recent positive engagement - request meeting
    if (
      context.lead.bantScore > 75 &&
      engagement.lastEngagementOutcome === "positive"
    ) {
      return {
        action: {
          type: "request_meeting",
          title: "Qualified Lead - Request Meeting",
          description: `${context.lead.name} is highly qualified (BANT: ${context.lead.bantScore}) and showing positive engagement. Request a meeting.`,
          channel: "email",
          priority: "high",
          confidenceScore: 90,
          timing: "immediate",
          recommendedDate: new Date(),
        },
      };
    }

    // Rule 6: Cold lead with no engagement - send case study
    if (engagement.openRate === 0 && engagement.totalEmails >= 2) {
      return {
        action: {
          type: "send_case_study",
          title: "Cold Lead - Share Case Study",
          description: `${context.lead.name} hasn't engaged yet. Try sharing a relevant case study or resource.`,
          channel: "email",
          priority: "low",
          confidenceScore: 65,
          timing: "within_week",
          recommendedDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        },
      };
    }

    // Rule 7: High churn risk - immediate intervention
    if (risks.churnRisk) {
      return {
        action: {
          type: "escalate_to_sales",
          title: "High Churn Risk - Immediate Intervention",
          description: `${context.lead.name} has high churn risk. Schedule executive check-in immediately.`,
          channel: "phone",
          priority: "critical",
          confidenceScore: 88,
          timing: "immediate",
          recommendedDate: new Date(),
        },
      };
    }

    return { action: null };
  }

  /**
   * Get AI-powered action recommendation
   */
  async getAIAction(context, lead, dealHealth) {
    try {
      const prompt = `
You are a sales engagement expert. Based on the following lead context, recommend the BEST NEXT ACTION to move this lead forward.

LEAD CONTEXT:
- Name: ${context.lead.name}
- Company: ${context.lead.company}
- Job Title: ${context.lead.jobTitle}
- Platform: ${context.lead.platform}
- BANT Score: ${context.lead.bantScore}/100 (${context.lead.bantCategory})
- Current Status: ${context.lead.status}

ENGAGEMENT METRICS:
- Total Emails Sent: ${context.engagement.totalEmails}
- Email Open Rate: ${context.engagement.openRate?.toFixed(1)}%
- Email Click Rate: ${context.engagement.clickRate?.toFixed(1)}%
- Response Rate: ${context.engagement.responseRate?.toFixed(1)}%
- Days Since Last Contact: ${context.engagement.daysSinceLastContact}
- Last Engagement: ${context.engagement.lastEngagementType} (${context.engagement.lastEngagementOutcome})

DEAL HEALTH:
- Health Score: ${context.health.score}/100
- Status: ${context.health.status}
- Risk Level: ${context.health.riskLevel}
- Engagement Trend: ${context.health.trend}

RISKS IDENTIFIED:
- No Response for 2+ Weeks: ${context.risks.noResponse}
- Low Engagement: ${context.risks.lowEngagement}
- Stage Staleness: ${context.risks.stageStaleness}
- Churn Risk: ${context.risks.churnRisk}

Please recommend the NEXT BEST ACTION with the following JSON format:
{
  "actionType": "one of: send_email, schedule_call, send_personalized_message, escalate_to_sales, move_to_nurture, send_case_study, request_meeting, follow_up_check_in, share_resources, pause_outreach",
  "title": "Short action title",
  "description": "Detailed description of why this action",
  "channel": "email|phone|linkedin|meeting|multi_channel",
  "priority": "critical|high|medium|low",
  "confidenceScore": 0-100,
  "timing": "immediate|within_24h|within_3_days|within_week|flexible",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "suggestedMessage": "A brief suggested message or talking points for the action"
}

Only respond with valid JSON, no additional text.
`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const raw = response.choices[0].message.content;
      const cleaned = this.sanitizeAIJson(raw);
      const actionData = JSON.parse(cleaned);

      return {
        type: actionData.actionType,
        title: actionData.title,
        description: actionData.description,
        channel: actionData.channel,
        priority: actionData.priority,
        confidenceScore: actionData.confidenceScore,
        timing: actionData.timing,
        recommendedDate: this.calculateRecommendedDate(actionData.timing),
        template: null,
        aiInsights: actionData.keyInsights,
        suggestedMessage: actionData.suggestedMessage,
      };
    } catch (error) {
      console.error(`[NBA] AI action generation failed: ${error.message}`);
      // Fallback to default action
      return {
        type: "follow_up_check_in",
        title: "Follow-up Check-in",
        description: `Follow up with ${lead.fullName} to understand their current needs.`,
        channel: "email",
        priority: "medium",
        confidenceScore: 50,
        timing: "within_3_days",
        recommendedDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      };
    }
  }

  /**
   * Generate AI reasoning for the action
   */
  async generateAIReasoning(context, action) {
    try {
      const prompt = `
You are a sales expert. Provide detailed analysis for why this action is recommended.

ACTION: ${action.title}
LEAD: ${context.lead.name} at ${context.lead.company}

Context:
- Health Score: ${context.health.score}/100
- BANT Category: ${context.lead.bantCategory}
- Days Since Last Contact: ${context.engagement.daysSinceLastContact}
- Email Open Rate: ${context.engagement.openRate?.toFixed(1)}%
- Engagement Trend: ${context.health.trend}

Provide a JSON response with:
{
  "analysis": "2-3 sentence detailed analysis",
  "keyInsights": ["insight 1", "insight 2"],
  "suggestedMessage": "A brief suggested message or approach"
}

Only JSON, no additional text.
`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      });

      const raw = response.choices[0].message.content;
      const cleaned = this.sanitizeAIJson(raw);
      return JSON.parse(cleaned);
    } catch (error) {
      console.error(`[NBA] AI reasoning failed: ${error.message}`);
      return {
        analysis: "Based on current engagement metrics and lead health.",
        keyInsights: ["Action recommended based on lead status"],
        suggestedMessage: "Follow up with the lead.",
      };
    }
  }

  /**
   * Calculate recommended action date based on timing
   */
  calculateRecommendedDate(timing) {
    const now = new Date();
    switch (timing) {
      case "immediate":
        return now;
      case "within_24h":
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case "within_3_days":
        return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      case "within_week":
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Calculate expiry date for action suggestion
   */
  calculateExpiryDate(timing) {
    const now = new Date();
    // Suggestions expire in 30 days or based on timing, whichever is sooner
    const maxDays = 30;
    const timingDays = {
      immediate: 1,
      within_24h: 2,
      within_3_days: 4,
      within_week: 8,
      flexible: 30,
    };
    const days = Math.min(timingDays[timing] || 7, maxDays);
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /**
   * Identify opportunities for the lead
   */
  identifyOpportunities(dealHealth, lead) {
    const opportunities = [];

    if (dealHealth.engagementMetrics?.emailOpenRate > 50) {
      opportunities.push("High email engagement");
    }
    if (lead.bant?.budget?.qualified) {
      opportunities.push("Budget qualified");
    }
    if (lead.bant?.authority?.isDecisionMaker) {
      opportunities.push("Decision maker identified");
    }
    if (lead.bant?.timeline?.timeframe === "immediate") {
      opportunities.push("Immediate timeline");
    }

    return opportunities.length > 0
      ? opportunities
      : ["Lead requires engagement"];
  }

  /**
   * Execute an action
   */
  async executeAction(companyId, actionId, executedBy, details = {}) {
    try {
      const action = await NextBestAction.findById(actionId);
      if (!action) throw new Error("Action not found");

      action.status = "executed";
      action.executedAt = new Date();
      action.executedBy = executedBy;
      action.outcome = details.outcome || "success";
      action.outcomeNotes = details.notes;

      if (details.leadStatusChanged) {
        action.metrics = {
          isEffective: details.isEffective !== false,
          resultingEngagement: details.engagement,
          leadStatusChanged: true,
          newLeadStatus: details.newLeadStatus,
        };
      }

      await action.save();
      console.log(`[NBA] Action ${actionId} executed`);

      // Generate follow-up action if needed
      if (action.metrics?.isEffective) {
        // Next action will be generated on next health check
        console.log(`[NBA] Effective action - will generate follow-up on next health update`);
      }

      return action;
    } catch (error) {
      console.error(`[NBA] Failed to execute action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Snooze an action
   */
  async snoozeAction(actionId, days = 3) {
    try {
      const action = await NextBestAction.findById(actionId);
      if (!action) throw new Error("Action not found");

      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + days);

      action.status = "snoozed";
      action.snoozedUntil = snoozeDate;

      await action.save();
      console.log(`[NBA] Action snoozed until ${snoozeDate}`);

      return action;
    } catch (error) {
      console.error(`[NBA] Failed to snooze action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decline an action
   */
  async declineAction(actionId, reason = "") {
    try {
      const action = await NextBestAction.findById(actionId);
      if (!action) throw new Error("Action not found");

      action.status = "declined";
      action.outcomeNotes = reason;

      await action.save();
      console.log(`[NBA] Action declined`);

      return action;
    } catch (error) {
      console.error(`[NBA] Failed to decline action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get active actions for a lead
   */
  async getActiveActions(companyId, leadId) {
    try {
      const actions = await NextBestAction.find({
        companyId,
        leadId,
        isActive: true,
        status: { $in: ["suggested", "accepted"] },
        expiresAt: { $gt: new Date() },
      }).sort({ priority: -1, createdAt: -1 });

      return actions;
    } catch (error) {
      console.error(`[NBA] Failed to get active actions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get pending actions for company dashboard
   */
  async getPendingActions(companyId, limit = 20) {
    try {
      const actions = await NextBestAction.find({
        companyId,
        status: { $in: ["suggested", "accepted"] },
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
        .populate("leadId", "fullName email company jobTitle")
        .sort({ priority: -1, recommendedDate: 1 })
        .limit(limit);

      return actions;
    } catch (error) {
      console.error(`[NBA] Failed to get pending actions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Batch generate actions for all leads
   */
  async batchGenerateActions(companyId, leadIds = null) {
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

      console.log(`[NBA] Batch generating actions for ${leads.length} leads`);
      let successCount = 0;
      let errorCount = 0;

      for (const lead of leads) {
        try {
          await this.generateNextBestAction(companyId, lead._id);
          successCount++;
          await this.delay(500); // Rate limiting
        } catch (error) {
          console.error(
            `[NBA] Failed to generate action for lead ${lead._id}:`,
            error.message
          );
          errorCount++;
        }
      }

      return {
        success: true,
        processed: leads.length,
        successful: successCount,
        failed: errorCount,
      };
    } catch (error) {
      console.error("[NBA] Batch generation failed:", error.message);
      throw error;
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sanitize AI output that may include markdown code fences or surrounding text
   * and extract the first JSON object found.
   */
  sanitizeAIJson(raw) {
    if (!raw || typeof raw !== "string") return "{}";

    // Remove common code fence markers
    let text = raw.replace(/```(?:json)?\n?/gi, "").replace(/```/g, "");

    // Try to locate a JSON object in the text
    const match = text.match(/\{[\s\S]*\}/);
    if (match && match[0]) {
      return match[0].trim();
    }

    // Fallback: remove backticks and attempt to return the trimmed text
    text = text.replace(/`/g, "").trim();
    return text;
  }
}

const nextBestActionService = new NextBestActionService();
export default nextBestActionService;