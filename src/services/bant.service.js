import OpenAI from "openai";

class BANTService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.timeout = 30000; // 30 seconds timeout
  }

  /**
   * Qualify lead using BANT framework
   * @param {Object} lead - Lead document from MongoDB
   * @returns {Promise<Object>} - BANT qualification results
   */
  async qualifyLead(lead) {
    try {
      console.log(`[BANT] Qualifying lead ${lead._id} using ${this.model}`);

      // Prepare the lead data for qualification
      const leadContext = this.prepareLeadContext(lead);

      // Call OpenAI API with BANT prompt
      const bantResult = await this.callOpenAI(leadContext);

      console.log(`[BANT] Successfully qualified lead ${lead._id}`);

      return {
        success: true,
        data: bantResult,
        leadId: lead._id,
      };
    } catch (error) {
      console.error(
        `[BANT] Failed to qualify lead ${lead._id}:`,
        error.message
      );

      return {
        success: false,
        error: error.message,
        leadId: lead._id,
      };
    }
  }

  /**
   * Call OpenAI API with BANT qualification prompt
   * @param {string} leadContext - Formatted lead context string
   * @returns {Promise<Object>} - Parsed BANT result
   */
  async callOpenAI(leadContext) {
    const systemPrompt = `You are an assistant that qualifies leads using the BANT framework (Budget, Authority, Need, Timeline).

Your task:
- First output the BANT evaluation in clean JSON format.
- Then add a total numeric 'score' (0–100).
- Finally add a 'category' (Hot/Warm/Cold) based on score.

Output ONLY in valid JSON, no extra text.

Format:
{
  "Lead Qualification (BANT)": {
    "Budget": "<budget range> (<Qualified/Unqualified>)",
    "Authority": "Decision maker: <Yes/No> (<High/Low>)",
    "Need": [
      "<point 1>",
      "<point 2>",
      "<point 3>"
    ],
    "Timeline": "<description> (<timeframe>)"
  },
  "score": <number>,
  "category": "Hot | Warm | Cold"
}

Scoring rules:
1. **Budget**: 0–25 points, based on company size, wages, or title.
2. **Authority**: 0–25 points, decision-making power (High = 25, Medium = 15, Low = 5).
3. **Need**: 0–25 points, urgency and relevance of product/service.
4. **Timeline**: 0–25 points, shorter/urgent = higher.

Category thresholds:
- 80–100 = Hot
- 60–79 = Warm
- <60 = Cold
`;

    const userPrompt = `Qualify this lead: ${leadContext}`;

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const responseContent = completion.choices[0].message.content.trim();

    // Parse JSON response
    let bantData;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      bantData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("[BANT] Failed to parse OpenAI response:", responseContent);
      throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
    }

    return bantData;
  }

  /**
   * Prepare lead context for BANT qualification
   * @param {Object} lead - Lead document from MongoDB
   * @returns {string} - Formatted lead context string
   */
  prepareLeadContext(lead) {
    // Extract lead fields, using platformData if available
    const company = lead.company || lead.platformData?.company || "Unknown";
    const title = lead.jobTitle || lead.platformData?.title || "Unknown";

    // Skills extraction
    let skills = "Unknown";
    if (lead.platformData?.skills && Array.isArray(lead.platformData.skills)) {
      skills = lead.platformData.skills
        .map((skill) => skill.title || skill.name || skill)
        .join(", ");
    } else if (lead.skills && Array.isArray(lead.skills)) {
      skills = lead.skills
        .map((skill) => skill.title || skill.name || skill)
        .join(", ");
    }

    // Experience extraction
    let experience = "Unknown";
    if (
      lead.platformData?.experiences &&
      Array.isArray(lead.platformData.experiences)
    ) {
      experience = this.calculateTotalExperience(lead.platformData.experiences);
    } else if (lead.experiences && Array.isArray(lead.experiences)) {
      experience = this.calculateTotalExperience(lead.experiences);
    } else if (lead.currentJobDurationInYrs) {
      experience = lead.currentJobDurationInYrs;
    }

    // Duration extraction
    const duration =
      lead.currentJobDuration || lead.platformData?.duration || "Unknown";

    // Interests extraction
    let interests = "Unknown";
    if (
      lead.platformData?.interests &&
      Array.isArray(lead.platformData.interests)
    ) {
      interests = lead.platformData.interests
        .map((interest) => interest.section_name || interest.name || interest)
        .join(", ");
    } else if (lead.interests && Array.isArray(lead.interests)) {
      interests = lead.interests
        .map((interest) => interest.section_name || interest.name || interest)
        .join(", ");
    }

    // Company size and industry
    const companySize = lead.companySize || "Unknown";
    const industry = lead.companyIndustry || "Unknown";

    // Format the context string
    return `${company} - ${title} - ${skills} - ${experience} years - ${duration} - ${interests} - ${companySize} - ${industry}`;
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
      if (!exp.caption && !exp.duration) return;

      const text = exp.caption || exp.duration || "";

      // Parse duration from caption (e.g., "Jun 2024 - Sep 2024 · 4 mos", "Jun 2025 - Present · 4 mos")
      const durationMatch = text.match(/(\d+)\s*(mos|yr|yrs|year|years)/i);

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
   * Batch qualify multiple leads
   * @param {Array} leads - Array of lead documents
   * @returns {Promise<Array>} - Array of qualification results
   */
  async batchQualifyLeads(leads) {
    const results = [];

    for (const lead of leads) {
      const result = await this.qualifyLead(lead);
      results.push(result);

      // Add a small delay to avoid rate limiting
      await this.delay(1000);
    }

    return results;
  }

  /**
   * Update lead with BANT qualification results
   * @param {Object} lead - Lead document to update
   * @param {Object} bantData - BANT qualification data from AI
   * @returns {Promise<Object>} - Updated lead
   */
  async updateLeadWithBANT(lead, bantData) {
    const bantQualification = bantData["Lead Qualification (BANT)"];

    // Extract budget information
    const budgetMatch = bantQualification.Budget?.match(
      /(Qualified|Unqualified)/i
    );
    const budgetQualified = budgetMatch
      ? budgetMatch[1].toLowerCase() === "qualified"
      : false;

    // Extract authority information
    const authorityMatch = bantQualification.Authority?.match(
      /Decision maker:\s*(Yes|No).*\((High|Medium|Low)\)/i
    );
    const isDecisionMaker = authorityMatch
      ? authorityMatch[1].toLowerCase() === "yes"
      : false;
    const authorityLevel = authorityMatch
      ? authorityMatch[2].toLowerCase()
      : "low";

    // Extract timeline information
    const timelineMatch = bantQualification.Timeline?.match(
      /\((immediate|1-3 months|3-6 months|6\+ months)\)/i
    );
    const timeframe = timelineMatch
      ? timelineMatch[1].toLowerCase()
      : "unknown";

    // Calculate individual scores (distribute total score across BANT components)
    const totalScore = bantData.score || 0;
    const budgetScore = Math.round(totalScore * 0.25);
    const authorityScore = Math.round(totalScore * 0.25);
    const needScore = Math.round(totalScore * 0.25);
    const timelineScore =
      totalScore - (budgetScore + authorityScore + needScore);

    // Update lead with BANT data
    lead.bant = {
      budget: {
        value: bantQualification.Budget || "",
        score: budgetScore,
        qualified: budgetQualified,
      },
      authority: {
        value: bantQualification.Authority || "",
        score: authorityScore,
        isDecisionMaker: isDecisionMaker,
        level: authorityLevel,
      },
      need: {
        value: Array.isArray(bantQualification.Need)
          ? bantQualification.Need
          : [],
        score: needScore,
        urgency: needScore >= 20 ? "high" : needScore >= 13 ? "medium" : "low",
      },
      timeline: {
        value: bantQualification.Timeline || "",
        score: timelineScore,
        timeframe: timeframe,
      },
      totalScore: totalScore,
      category: bantData.category?.toLowerCase() || "cold",
      qualifiedAt: new Date(),
      rawResponse: bantData,
    };

    // Update lead status based on BANT category
    if (bantData.category) {
      const categoryLower = bantData.category.toLowerCase();
      if (["hot", "warm", "cold"].includes(categoryLower)) {
        lead.status = categoryLower;
      }
    }

    // Update lead score
    lead.leadScore = totalScore;

    await lead.save();

    return lead;
  }

  /**
   * Delay function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test OpenAI connectivity
   * @returns {Promise<Object>} - Test result
   */
  async testConnection() {
    try {
      const testContext =
        "Acme Corp - CEO - Marketing, Sales, Leadership - 10 years - 5 years - Technology, AI - 50-200 employees - Software";

      const result = await this.callOpenAI(testContext);

      return {
        success: true,
        message: "OpenAI connectivity test successful",
        result: result,
      };
    } catch (error) {
      return {
        success: false,
        message: "OpenAI connectivity test failed",
        error: error.message,
      };
    }
  }
}

// Create singleton instance
const bantService = new BANTService();

export default bantService;
