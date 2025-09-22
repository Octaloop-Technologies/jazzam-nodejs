import fetch from "node-fetch";

class WebhookService {
  constructor() {
    this.webhookUrl =
      process.env.MAKE_WEBHOOK_URL ||
      "https://hook.eu2.make.com/wi3fcb78kawlmocru2qlocbm5e5jhho7";
    this.timeout = 10000; // 10 seconds timeout
    this.retryAttempts = 3;
    this.retryDelay = 2000; // 2 seconds
  }

  /**
   * Send lead data to Make.com webhook
   * @param {Object} leadData - The lead data to send
   * @param {number} attempt - Current retry attempt (default: 1)
   * @returns {Promise<Object>} - Webhook response
   */
  async sendLeadToWebhook(leadData, attempt = 1) {
    try {
      console.log(
        `[Webhook] Attempting to send lead data to Make.com (attempt ${attempt}/${this.retryAttempts})`
      );

      // Prepare the payload for Make.com
      const payload = this.prepareLeadPayload(leadData);

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Lead-Management-System/1.0",
        },
        body: JSON.stringify(payload),
        timeout: this.timeout,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log(
        `[Webhook] Successfully sent lead data to Make.com on attempt ${attempt}`
      );

      return {
        success: true,
        attempt,
        response: responseData,
        leadId: leadData._id,
      };
    } catch (error) {
      console.error(`[Webhook] Attempt ${attempt} failed:`, error.message);

      // Retry logic
      if (attempt < this.retryAttempts) {
        console.log(`[Webhook] Retrying in ${this.retryDelay}ms...`);
        await this.delay(this.retryDelay);
        return this.sendLeadToWebhook(leadData, attempt + 1);
      }

      // All retries failed
      console.error(
        `[Webhook] All ${this.retryAttempts} attempts failed for lead ${leadData._id}`
      );

      return {
        success: false,
        attempt,
        error: error.message,
        leadId: leadData._id,
      };
    }
  }

  /**
   * Prepare lead data for webhook payload
   * @param {Object} lead - Lead document from MongoDB
   * @returns {Object} - Formatted payload for Make.com
   */
  prepareLeadPayload(lead) {
    return {
      // Basic lead information
      lead_id: lead._id.toString(),
      linkedin_profile_url: lead.linkedinProfileUrl,
      first_name: lead.firstName,
      last_name: lead.lastName,
      full_name: lead.fullName,
      headline: lead.headline,
      email: lead.email,
      phone: lead.phone,

      // LinkedIn metrics
      followers: lead.followers,
      connections: lead.connections,
      public_identifier: lead.publicIdentifier,

      // Company information
      company: lead.company,
      company_industry: lead.companyIndustry,
      company_website: lead.companyWebsite,
      company_linkedin: lead.companyLinkedin,
      company_founded_in: lead.companyFoundedIn,
      company_size: lead.companySize,

      // Job information
      job_title: lead.jobTitle,
      current_job_duration: lead.currentJobDuration,
      current_job_duration_years: lead.currentJobDurationInYrs,

      // Location information
      location: lead.location,
      address_country_only: lead.addressCountryOnly,
      address_with_country: lead.addressWithCountry,
      address_without_country: lead.addressWithoutCountry,

      // Profile media
      profile_pic: lead.profilePic,
      profile_pic_high_quality: lead.profilePicHighQuality,

      // Profile content
      about: lead.about,
      creator_website: lead.creatorWebsite,

      // Professional data
      experiences: lead.experiences || [],
      educations: lead.educations || [],
      skills: lead.skills || [],
      languages: lead.languages || [],
      interests: lead.interests || [],

      // // BANT qualification data
      // bant: {
      //   budget: lead.bant?.budget,
      //   budget_status: lead.bant?.budgetStatus,
      //   authority: {
      //     is_decision_maker: lead.bant?.authority?.isDecisionMaker,
      //     authority_status: lead.bant?.authority?.authorityStatus,
      //   },
      //   need: {
      //     needs_list: lead.bant?.need?.needsList || [],
      //     need_status: lead.bant?.need?.needStatus,
      //   },
      //   timeline: {
      //     expected_timeframe: lead.bant?.timeline?.expectedTimeframe,
      //     timeline_status: lead.bant?.timeline?.timelineStatus,
      //   },
      // },

      // Lead management
      status: lead.status,
      notes: lead.notes,
      assigned_to: lead.assignedTo,
      tags: lead.tags || [],
      // lead_score: lead.leadScore,

      // Timestamps
      created_at: lead.createdAt,
      updated_at: lead.updatedAt,
      last_contact_date: lead.lastContactDate,
      next_follow_up_date: lead.nextFollowUpDate,

      // Metadata
      webhook_timestamp: new Date().toISOString(),
      webhook_source: "lead-management-system",
    };
  }

  /**
   * Delay function for retry logic
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test webhook connectivity
   * @returns {Promise<Object>} - Test result
   */
  async testWebhook() {
    try {
      const testPayload = {
        test: true,
        message: "Webhook connectivity test",
        timestamp: new Date().toISOString(),
        source: "lead-management-system",
      };

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Lead-Management-System/1.0",
        },
        body: JSON.stringify(testPayload),
        timeout: this.timeout,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();

      return {
        success: true,
        message: "Webhook test successful",
        response: responseData,
      };
    } catch (error) {
      return {
        success: false,
        message: "Webhook test failed",
        error: error.message,
      };
    }
  }
}

// Create singleton instance
const webhookService = new WebhookService();

export default webhookService;
