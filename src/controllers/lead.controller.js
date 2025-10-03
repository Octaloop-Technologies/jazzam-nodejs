import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Lead } from "../models/lead.model.js";
import { Form } from "../models/form.model.js";
import { Company } from "../models/company.model.js";
import { Validator } from "../utils/validator.js";
import mongoose from "mongoose";
import webhookService from "../services/webhook.service.js";
import emailService from "../services/email.service.js";
import scrapingService from "../services/scraping.service.js";

// ==============================================================
// Lead Controller Functions
// ==============================================================

// Create a new lead from form submission
const createLead = asyncHandler(async (req, res) => {
  const { formId, formData, sourceUrl, referrer, utmParams } = req.body;

  // Validate required fields
  const validationRules = {
    formId: { type: "required" },
    formData: { type: "required" },
  };

  Validator.validateFields(req.body, validationRules);

  // Check if form exists and belongs to company
  const form = await Form.findOne({
    _id: formId,
    companyId: req.company._id,
    status: "active",
  });

  if (!form) {
    throw new ApiError(404, "Form not found or inactive");
  }

  // Validate form data based on form configuration
  const validationErrors = validateFormData(formData, form.config.fields);
  if (validationErrors.length > 0) {
    throw new ApiError(400, "Form validation failed", validationErrors);
  }

  // Check if lead with same platform URL already exists for this company
  const platformUrl = formData[form.config.fields[0].name];
  const existingLead = await Lead.findOne({
    platformUrl,
    companyId: req.company._id,
  });

  if (existingLead) {
    // Update existing lead with new form data
    existingLead.platformData = { ...existingLead.platformData, ...formData };
    existingLead.sourceUrl = sourceUrl;
    existingLead.referrer = referrer;
    existingLead.utmParams = utmParams;
    await existingLead.save();

    return res
      .status(200)
      .json(new ApiResponse(200, existingLead, "Lead updated successfully"));
  }

  // Determine platform and scrape data
  let scrapedData = {};
  let platform = form.formType;

  try {
    if (form.platformConfig.scrapingEnabled) {
      // Validate platform identifier
      scrapingService.validatePlatformIdentifier(form.formType, platformUrl);

      // Scrape data using the scraping service
      scrapedData = await scrapingService.scrapeProfile(
        form.formType,
        platformUrl
      );
    }
  } catch (error) {
    console.error(`Scraping failed for ${form.formType}:`, error);
    // Continue with basic lead creation even if scraping fails
  }

  // Extract basic information from scraped data
  const extractedData = scrapingService.extractLeadData(
    scrapedData,
    form.formType
  );

  console.log("Extracted Data  .............");

  // Create new lead
  const lead = await Lead.create({
    companyId: req.company._id,
    formId: formId,
    platform: platform,
    platformUrl: platformUrl,
    profileUrl: platformUrl,
    profilePic:
      extractedData.profilePic ||
      scrapedData.profilePic ||
      scrapedData.profilePicHighQuality ||
      null,
    firstName: extractedData.firstName,
    lastName: extractedData.lastName,
    fullName: extractedData.fullName,
    email: extractedData.email,
    phone: extractedData.phone,
    company: extractedData.company,
    companyIndustry: extractedData.companyIndustry,
    companyWebsite: extractedData.companyWebsite,
    companySize: extractedData.companySize,
    jobTitle: extractedData.jobTitle,
    department: extractedData.department,
    location: extractedData.location,
    country: extractedData.country,
    city: extractedData.city,
    platformData: scrapedData,
    source: "form",
    sourceUrl: sourceUrl,
    referrer: referrer,
    utmParams: utmParams,
    status: "new",
    emailStatus: {
      followUpScheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    },
  });

  // Increment company's lead count
  await req.company.incrementLeadCount();

  // Increment form's submission count
  await form.incrementSubmissions();

  // Log lead details for debugging
  console.log("📧 Email Configuration Check:");
  console.log(`  - Lead Email: ${lead.email || "Not available"}`);
  console.log(`  - Company Email: ${req.company.email}`);
  console.log(
    `  - Auto Response Enabled: ${form.settings.autoResponse.enabled}`
  );

  // Send welcome email to lead if enabled and lead has email
  if (form.settings.autoResponse.enabled && lead.email) {
    try {
      await emailService.sendWelcomeEmail(lead, form);
      await lead.updateEmailStatus("welcome", true);
      console.log(`✅ Welcome email sent to lead: ${lead.email}`);
    } catch (error) {
      console.error("Failed to send welcome email to lead:", error);
    }
  } else if (form.settings.autoResponse.enabled && !lead.email) {
    console.log(
      "⚠️ Welcome email not sent - lead email not available from scraped data"
    );
  }

  // Send lead notification email to company
  try {
    await emailService.sendLeadNotificationEmail(lead, form, req.company);
    console.log(
      `✅ Lead notification email sent to company: ${req.company.email}`
    );
  } catch (error) {
    console.error("Failed to send lead notification email to company:", error);
  }

  // Send webhook notification (async, don't wait for response)
  webhookService
    .sendLeadToWebhook(lead)
    .then((result) => {
      if (result.success) {
        console.log(`[Webhook] Lead ${lead._id} successfully sent to Make.com`);
      } else {
        console.error(
          `[Webhook] Failed to send lead ${lead._id} to Make.com:`,
          result.error
        );
      }
    })
    .catch((error) => {
      console.error(
        `[Webhook] Unexpected error sending lead ${lead._id} to Make.com:`,
        error
      );
    });

  return res
    .status(201)
    .json(new ApiResponse(201, lead, "Lead created successfully"));
});

// Get all leads for a company
const getLeads = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    formId,
    platform,
    companyIndustry,
    companySize,
    source,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build match conditions - always filter by company
  const matchConditions = { companyId: req.company._id };

  if (status) matchConditions.status = status;
  if (formId)
    matchConditions.formId =
      mongoose.Types.ObjectId.createFromHexString(formId);
  if (platform) matchConditions.platform = platform;
  if (companyIndustry) matchConditions.companyIndustry = companyIndustry;
  if (companySize) matchConditions.companySize = companySize;
  if (source) matchConditions.source = source;

  // Build sort object
  const sortObj = {};
  sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: sortObj,
  };

  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: "forms",
        localField: "formId",
        foreignField: "_id",
        as: "form",
        pipeline: [{ $project: { name: 1, status: 1, formType: 1 } }],
      },
    },
    {
      $addFields: {
        form: { $arrayElemAt: ["$form", 0] },
        // For backward compatibility: use platformUrl if profileUrl doesn't exist
        profileUrl: {
          $ifNull: ["$profileUrl", "$platformUrl"],
        },
      },
    },
    { $sort: sortObj },
  ];

  const result = await Lead.aggregatePaginate(
    Lead.aggregate(pipeline),
    options
  );

  // Transform the response to match frontend expectations (docs -> leads)
  const response = {
    leads: result.docs,
    totalResults: result.totalDocs,
    page: result.page,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage,
    limit: result.limit,
  };

  return res
    .status(200)
    .json(new ApiResponse(200, response, "Leads fetched successfully"));
});

// Get lead by ID
const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  try {
    const lead = await Lead.findOne({
      _id: id,
      companyId: req.company._id,
    }).populate("formId", "name status formType");

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    // For backward compatibility: use platformUrl if profileUrl doesn't exist
    const leadData = lead.toObject();
    if (!leadData.profileUrl && leadData.platformUrl) {
      leadData.profileUrl = leadData.platformUrl;
    }

    return res
      .status(200)
      .json(new ApiResponse(200, leadData, "Lead fetched successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, error.message || "Failed to fetch lead");
  }
});

// Update lead by ID
const updateLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes, tags, leadScore, qualificationScore, bant } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  try {
    // Map request body to lead schema fields
    const updateFields = {};

    if (status) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;
    if (tags) updateFields.tags = tags;
    if (leadScore !== undefined) updateFields.leadScore = leadScore;
    if (qualificationScore !== undefined)
      updateFields.qualificationScore = qualificationScore;
    if (bant) {
      updateFields.bant = {
        ...updateFields.bant,
        ...bant,
      };
    }

    const updatedLead = await Lead.findOneAndUpdate(
      { _id: id, companyId: req.company._id },
      { $set: updateFields },
      { new: true }
    );

    if (!updatedLead) {
      throw new ApiError(404, "Lead not found");
    }

    // Send webhook notification for lead update (async, don't wait for response)
    webhookService
      .sendLeadToWebhook(updatedLead)
      .then((result) => {
        if (result.success) {
          console.log(
            `[Webhook] Lead update ${updatedLead._id} successfully sent to Make.com`
          );
        } else {
          console.error(
            `[Webhook] Failed to send lead update ${updatedLead._id} to Make.com:`,
            result.error
          );
        }
      })
      .catch((error) => {
        console.error(
          `[Webhook] Unexpected error sending lead update ${updatedLead._id} to Make.com:`,
          error
        );
      });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedLead, "Lead updated successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, error.message || "Failed to update lead");
  }
});

// Search leads
const searchLeads = asyncHandler(async (req, res) => {
  const {
    query,
    page = 1,
    limit = 10,
    status,
    platform,
    companyIndustry,
    source,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  if (!query || query.trim().length === 0) {
    throw new ApiError(400, "Search query is required");
  }

  // Build match conditions - always filter by company
  const matchConditions = {
    companyId: req.company._id,
    $text: { $search: query.trim() },
  };

  if (status) matchConditions.status = status;
  if (platform) matchConditions.platform = platform;
  if (companyIndustry) matchConditions.companyIndustry = companyIndustry;
  if (source) matchConditions.source = source;

  // Build sort object
  const sortObj = {};
  sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: sortObj,
  };

  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: "forms",
        localField: "formId",
        foreignField: "_id",
        as: "form",
        pipeline: [{ $project: { name: 1, status: 1, formType: 1 } }],
      },
    },
    {
      $addFields: {
        form: { $arrayElemAt: ["$form", 0] },
        searchScore: { $meta: "textScore" },
        // For backward compatibility: use platformUrl if profileUrl doesn't exist
        profileUrl: {
          $ifNull: ["$profileUrl", "$platformUrl"],
        },
      },
    },
    { $sort: { searchScore: { $meta: "textScore" } } },
  ];

  const result = await Lead.aggregatePaginate(
    Lead.aggregate(pipeline),
    options
  );

  // Transform the response to match frontend expectations (docs -> leads)
  const response = {
    leads: result.docs,
    totalResults: result.totalDocs,
    page: result.page,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage,
    limit: result.limit,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, response, "Search results fetched successfully")
    );
});

// Update lead status
const updateLeadStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  try {
    const lead = await Lead.findOne({
      _id: id,
      companyId: req.company._id,
    });

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    lead.status = status;
    if (notes !== undefined) lead.notes = notes;
    await lead.save();

    // Send webhook notification for lead update (async, don't wait for response)
    webhookService
      .sendLeadToWebhook(lead)
      .then((result) => {
        if (result.success) {
          console.log(
            `[Webhook] Lead status update ${lead._id} successfully sent to Make.com`
          );
        } else {
          console.error(
            `[Webhook] Failed to send lead status update ${lead._id} to Make.com:`,
            result.error
          );
        }
      })
      .catch((error) => {
        console.error(
          `[Webhook] Unexpected error sending lead status update ${lead._id} to Make.com:`,
          error
        );
      });

    return res
      .status(200)
      .json(new ApiResponse(200, lead, "Lead status updated successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, error.message || "Failed to update lead status");
  }
});

// Get lead statistics
const getLeadStats = asyncHandler(async (req, res) => {
  try {
    const companyId = req.company._id;

    const stats = await Lead.aggregate([
      { $match: { companyId, status: { $ne: null } } },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: 1 },
          newLeads: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } },
          hotLeads: {
            $sum: { $cond: [{ $eq: ["$status", "hot"] }, 1, 0] },
          },
          warmLeads: {
            $sum: { $cond: [{ $eq: ["$status", "warm"] }, 1, 0] },
          },
          coldLeads: {
            $sum: { $cond: [{ $eq: ["$status", "cold"] }, 1, 0] },
          },
          qualifiedLeads: {
            $sum: { $cond: [{ $eq: ["$status", "qualified"] }, 1, 0] },
          },
          avgLeadScore: { $avg: "$leadScore" },
        },
      },
      {
        $project: {
          _id: 0,
          totalLeads: 1,
          newLeads: 1,
          hotLeads: 1,
          warmLeads: 1,
          coldLeads: 1,
          qualifiedLeads: 1,
          avgLeadScore: { $round: ["$avgLeadScore", 2] },
        },
      },
    ]);

    const industryStats = await Lead.aggregate([
      { $match: { companyId, status: { $ne: null } } },
      { $group: { _id: "$companyIndustry", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const platformStats = await Lead.aggregate([
      { $match: { companyId, status: { $ne: null } } },
      { $group: { _id: "$platform", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const locationStats = await Lead.aggregate([
      { $match: { companyId, status: { $ne: null } } },
      { $group: { _id: "$location", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const formStats = await Lead.aggregate([
      { $match: { companyId, status: { $ne: null } } },
      {
        $lookup: {
          from: "forms",
          localField: "formId",
          foreignField: "_id",
          as: "form",
        },
      },
      { $unwind: "$form" },
      {
        $group: {
          _id: "$form.name",
          count: { $sum: 1 },
          formType: { $first: "$form.formType" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const result = {
      overview: stats[0] || {
        totalLeads: 0,
        newLeads: 0,
        hotLeads: 0,
        warmLeads: 0,
        coldLeads: 0,
        qualifiedLeads: 0,
        avgLeadScore: 0,
      },
      industryBreakdown: industryStats,
      platformBreakdown: platformStats,
      locationBreakdown: locationStats,
      formBreakdown: formStats,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "Lead statistics fetched successfully")
      );
  } catch (error) {
    throw new ApiError(500, error.message || "Failed to fetch lead statistics");
  }
});

// Delete a lead
const deleteLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  try {
    const lead = await Lead.findOneAndDelete({
      _id: id,
      companyId: req.company._id,
    });

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Lead deleted successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, error.message || "Failed to delete lead");
  }
});

// ==============================================================
// Helper Functions
// ==============================================================

const validateFormData = (formData, fields) => {
  const errors = [];

  fields.forEach((field) => {
    const value = formData[field.name];

    if (field.required && (!value || value.trim() === "")) {
      errors.push(`${field.label || field.name} is required`);
    }

    if (value && field.type === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push(`${field.label || field.name} must be a valid email`);
      }
    }

    if (value && field.type === "url") {
      const urlRegex = /^https?:\/\/.+/;
      if (!urlRegex.test(value)) {
        errors.push(`${field.label || field.name} must be a valid URL`);
      }
    }

    if (value && field.validation && field.validation.pattern) {
      const regex = new RegExp(field.validation.pattern);
      if (!regex.test(value)) {
        errors.push(
          field.validation.message ||
            `${field.label || field.name} format is invalid`
        );
      }
    }
  });

  return errors;
};

export {
  createLead,
  getLeads,
  getLeadById,
  updateLeadById,
  searchLeads,
  updateLeadStatus,
  getLeadStats,
  deleteLead,
};
