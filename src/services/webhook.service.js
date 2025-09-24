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
   * Calculate total experience in years from experiences array
   * @param {Array} experiences - Array of experience objects
   * @returns {string} - Total experience in years (e.g., "1.5", "2", "0.5")
   */
  calculateTotalExperience(experiences) {
    if (
      !experiences ||
      !Array.isArray(experiences) ||
      experiences.length === 0
    ) {
      return "0";
    }

    let totalMonths = 0;

    experiences.forEach((exp) => {
      if (!exp.caption) return;

      // Parse duration from caption (e.g., "Jun 2024 - Sep 2024 · 4 mos", "Jun 2025 - Present · 4 mos")
      const durationMatch = exp.caption.match(
        /(\d+)\s*(mos|yr|yrs|year|years)/i
      );

      if (durationMatch) {
        const duration = parseInt(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();

        if (unit.includes("yr") || unit.includes("year")) {
          totalMonths += duration * 12;
        } else if (unit.includes("mos")) {
          totalMonths += duration;
        }
      }
    });

    // Convert months to years
    const totalYears = totalMonths / 12;

    // Round to 1 decimal place for precision
    return totalYears.toFixed(1);
  }

  /**
   * Prepare lead data for webhook payload
   * @param {Object} lead - Lead document from MongoDB
   * @returns {Object} - Formatted payload for Make.com
   */
  prepareLeadPayload(lead) {
    return {
      lead_id: lead._id.toString(),
      firstName: lead.firstName || null,
      fullName: lead.fullName || "null",
      lastName: lead.lastName || null,
      email: lead.email || null,
      phone: lead.phone || null,
      fax: null,
      mobile: lead.phone || null,
      city: lead.addressWithoutCountry || null,
      country: lead.addressCountryOnly || lead.addressWithCountry || null,
      company: lead.company || "null",
      title: lead.jobTitle || null,
      skills: lead.skills ? lead.skills.map((skill) => skill.title) : [],
      experience:
        this.calculateTotalExperience(lead.experiences) ||
        lead.currentJobDurationInYrs ||
        null,
      duration: lead.currentJobDuration || null,
      interests: lead.interests
        ? lead.interests.map((interest) => interest.section_name)
        : [],
      company_size: lead.companySize || null,
      industry: lead.companyIndustry || null,
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
