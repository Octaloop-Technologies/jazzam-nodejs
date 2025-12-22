// src/services/proposal.service.js
import OpenAI from "openai";
import { leadSchema } from "../models/lead.model.js"; // Adjust path if needed
import { proposalSchema } from "../models/proposal.model.js"; // Adjust path if needed
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from "docx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProposalService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.timeout = 30000; // 30 seconds timeout
  }

  /**
   * Generate a personalized proposal for a lead
   * @param {String} leadId - Lead ID
   * @param {Object} tenantConnection - Tenant-specific DB connection
   * @returns {Promise<Object>} - Generated proposal data
   */
  // ... existing code ...

async generateProposal(leadId, tenantConnection) {
  try {
    console.log(`[Proposal] Generating proposal for lead ${leadId}`);

    // Fetch lead with BANT data
    const LeadModel = tenantConnection.model("Lead", leadSchema); // Fixed: Use 'leadSchema' instead of 'lead.model'
    const lead = await LeadModel.findById(leadId);
    if (!lead) throw new Error("Lead not found");
    if (!lead.bant || !lead.bant.category) throw new Error("Lead not qualified with BANT");

    // Prepare context for AI
    const proposalContext = this.prepareProposalContext(lead);

    // Call OpenAI API
    const proposalContent = await this.callOpenAI(proposalContext, lead.bant.category);

    // Generate Word document
    const wordFilePath = await this.generateWordDocument(proposalContent, lead, leadId);

    // Create and save proposal
    const ProposalModel = tenantConnection.model("Proposal", proposalSchema); // Ensure this is correct (it should be)
    const proposal = new ProposalModel({
      leadId,
      title: `Proposal for ${lead.fullName} at ${lead.company}`,
      content: proposalContent,
      bantCategory: lead.bant.category,
      aiPrompt: proposalContext,
      aiResponse: proposalContent,
      filePath: wordFilePath,
    });
    await proposal.save();

    console.log(`[Proposal] Successfully generated proposal for lead ${leadId}`);
    return { success: true, proposal, filePath: wordFilePath };
  } catch (error) {
    console.error(`[Proposal] Failed to generate proposal for lead ${leadId}:`, error.message);
    return { success: false, error: error.message };
  }
}


  /**
   * Call OpenAI API to generate proposal
   * @param {String} context - Prepared lead context
   * @param {String} bantCategory - BANT category (hot/warm/cold)
   * @returns {Promise<String>} - Generated proposal text
   */
  async callOpenAI(context, bantCategory) {
    const systemPrompt = `You are an expert sales proposal writer. Generate a personalized, professional proposal based on the lead's qualification data. Tailor the tone and content to the BANT category:
- Hot: Enthusiastic, premium-focused, urgent call-to-action.
- Warm: Balanced, value-driven, build trust.
- Cold: Educational, low-pressure, nurture relationship.

Output ONLY the proposal text (no JSON or extra formatting). Make it concise (300-500 words), include sections like Introduction, Value Proposition, Pricing, and Next Steps.`;

    const userPrompt = `Generate a proposal for this lead: ${context}`;

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return completion.choices[0].message.content.trim();
  }

  /**
   * Prepare lead context for proposal generation
   * @param {Object} lead - Lead document
   * @returns {String} - Formatted context string
   */
  prepareProposalContext(lead) {
    const bant = lead.bant;
    return `
Lead Name: ${lead.fullName}
Company: ${lead.company}
Job Title: ${lead.jobTitle}
Industry: ${lead.companyIndustry}
Company Size: ${lead.companySize}
Location: ${lead.location}
BANT Category: ${bant.category}
Budget: ${bant.budget.value} (Qualified: ${bant.budget.qualified})
Authority: ${bant.authority.value} (Decision Maker: ${bant.authority.isDecisionMaker})
Need: ${bant.need.value.join(", ")} (Urgency: ${bant.need.urgency})
Timeline: ${bant.timeline.value} (Timeframe: ${bant.timeline.timeframe})
Total Score: ${bant.totalScore}
Skills/Interests: ${lead.platformData?.skills?.join(", ") || "N/A"}
Experience: ${lead.platformData?.experiences?.length || 0} years
    `.trim();
  }

  /**
   * Generate Word document from proposal content
   * @param {String} content - Proposal content
   * @param {Object} lead - Lead data
   * @param {String} leadId - Lead ID
   * @returns {Promise<String>} - File path
   */
  async generateWordDocument(content, lead, leadId) {
    try {
      // Create document sections
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: `Proposal for ${lead.fullName}`,
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: `Company: ${lead.company || "N/A"}`,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: `Date: ${new Date().toLocaleDateString()}`,
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "___________________________________________________________________",
                spacing: { after: 400 },
              }),
              // Split content into paragraphs
              ...content.split("\n\n").map(
                (paragraph) =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: paragraph.trim(),
                        size: 24, // 12pt font
                      }),
                    ],
                    spacing: { after: 200 },
                  })
              ),
            ],
          },
        ],
      });

      // Ensure temp directory exists
      const tempDir = path.join(__dirname, "../../public/temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generate filename
      const filename = `proposal_${leadId}_${Date.now()}.docx`;
      const filePath = path.join(tempDir, filename);

      // Generate and save the document
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);

      console.log(`[Proposal] Word document generated: ${filePath}`);
      return `/temp/${filename}`; // Return relative path for URL
    } catch (error) {
      console.error("[Proposal] Failed to generate Word document:", error);
      throw error;
    }
  }

  /**
   * Update proposal status
   * @param {String} proposalId - Proposal ID
   * @param {String} status - New status
   * @param {Object} tenantConnection - Tenant DB connection
   * @returns {Promise<Object>} - Updated proposal
   */
  async updateProposalStatus(proposalId, status, tenantConnection) {
    const ProposalModel = tenantConnection.model("Proposal", proposalSchema);
    const proposal = await ProposalModel.findByIdAndUpdate(
      proposalId,
      { status },
      { new: true }
    );
    if (!proposal) throw new Error("Proposal not found");
    return proposal;
  }

  /**
   * Get proposals for a lead
   * @param {String} leadId - Lead ID
   * @param {Object} tenantConnection - Tenant DB connection
   * @returns {Promise<Array>} - List of proposals
   */
  async getProposalsByLead(leadId, tenantConnection) {
    const ProposalModel = tenantConnection.model("Proposal", proposalSchema);
    return await ProposalModel.find({ leadId }).sort({ createdAt: -1 });
  }
}

const proposalService = new ProposalService();
export default proposalService;