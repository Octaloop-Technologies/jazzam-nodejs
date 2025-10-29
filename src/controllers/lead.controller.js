import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Lead } from "../models/lead.model.js";
import mongoose from "mongoose";
import bantService from "../services/bant.service.js";
import FollowUp from "../models/followUp.model.js";
import emailService from "../services/email.service.js";

// ==============================================================
// Lead Controller Functions
// ==============================================================

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

// Follow up email for lead
const followUpEmail = asyncHandler(async (req, res) => {
  try {
    const leadId = req.params?.id
    const lead = await Lead.findById(leadId);
    const findLead = await FollowUp.findOne({ leadId });
    const result = await emailService.sendFollowUpEmail(lead);
    if (result.success === true) {
      findLead.status = "submitted";
      await findLead.save();
      return
    }
    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "Follow up email sent successfully")
      );

  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed send follow up email"
    );
  }
});

// get all leads
const followUpLeads = asyncHandler(async (req, res) => {
  try {
    const followupLeadsData = await FollowUp.find();
    return res
      .status(200)
      .json(
        new ApiResponse(200, followupLeadsData, "All follow up leads sent")
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to get follow up leads"
    );
  }
})

// schedule follow up lead
const scheduleFollowUpLeads = asyncHandler(async (req, res) => {
  try {
    const leadId = req?.params?.id;
    const { date, subject, message } = req.body;
    const scheduleDate = new Date(date);
    const followupLeadsData = await FollowUp.findOne({ leadId });
    if (!followupLeadsData) {
      return res
        .status(400)
        .json(
          new ApiResponse(200, followupLeadsData, "lead not found.")
        );
    }
    followupLeadsData.status = "scheduled";
    followupLeadsData.scheduleDate = scheduleDate;
    followupLeadsData.subject = subject;
    followupLeadsData.message = message;
    followupLeadsData.scheduled = true;
    await followupLeadsData.save();

    console.log("follow up lead********", followupLeadsData)
    return res
      .status(200)
      .json(
        new ApiResponse(200, {}, "Lead scheduled successfully")
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to get follow up leads"
    );
  }
});

// cron job function for scheduled follow up leads

const scheduledLeads = async () => {
    console.log("🕛 Running daily follow-up email cron job:", new Date().toISOString());

    try {
    // 1️⃣ Get all follow-ups that are due today and not yet scheduled
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const followUps = await FollowUp.find({
      status: { $in: ["scheduled"] },
      scheduleDate: { $gte: todayStart, $lte: todayEnd },
      scheduled: true
    }).populate("leadId");

    console.log(`📩 Found ${followUps.length} follow-up emails to send`);

    // 2️⃣ Send emails one by one
    for (const followUp of followUps) {
      try {
        await emailService.sendFollowUpEmail(followUp.leadId);
        
        // 3️⃣ Update status and mark as scheduled
        followUp.status = "submitted";
        followUp.scheduled = true;
        followUp.dateOfSubmission = new Date();
        await followUp.save();

        console.log(`✅ Email sent for lead: ${followUp.leadId}`);
      } catch (err) {
        console.error(`❌ Failed to send email for lead: ${followUp.leadId}`, err);
      }
    }

  } catch (error) {
    console.error("❌ Error in follow-up email cron job:", error);
  }
}



// ==============================================================
// BANT Qualification Functions
// ==============================================================

// Qualify a single lead using BANT method
const qualifyLeadBANT = asyncHandler(async (req, res) => {
  const { id } = req.params;

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

    // Call BANT service to qualify the lead
    const qualificationResult = await bantService.qualifyLead(lead);

    if (!qualificationResult.success) {
      throw new ApiError(
        500,
        `BANT qualification failed: ${qualificationResult.error}`
      );
    }

    // Update lead with BANT data using shared service method
    const bantData = qualificationResult.data;
    await bantService.updateLeadWithBANT(lead, bantData);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { lead, bantQualification: bantData },
          "Lead qualified successfully using BANT method"
        )
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to qualify lead using BANT"
    );
  }
});

// Batch qualify multiple leads using BANT method
const batchQualifyLeadsBANT = asyncHandler(async (req, res) => {
  const { leadIds, filters } = req.body;

  try {
    let leads;

    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      // Qualify specific leads by IDs
      const validIds = leadIds.filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
      );

      if (validIds.length === 0) {
        throw new ApiError(400, "No valid lead IDs provided");
      }

      leads = await Lead.find({
        _id: { $in: validIds },
        companyId: req.company._id,
      });
    } else if (filters) {
      // Qualify leads based on filters
      const matchConditions = { companyId: req.company._id };

      if (filters.status) matchConditions.status = filters.status;
      if (filters.formId)
        matchConditions.formId = mongoose.Types.ObjectId.createFromHexString(
          filters.formId
        );
      if (filters.platform) matchConditions.platform = filters.platform;
      if (filters.companyIndustry)
        matchConditions.companyIndustry = filters.companyIndustry;
      if (filters.companySize)
        matchConditions.companySize = filters.companySize;

      // Limit to 50 leads per batch to avoid timeout
      leads = await Lead.find(matchConditions).limit(filters.limit || 50);
    } else {
      throw new ApiError(
        400,
        "Either leadIds or filters must be provided for batch qualification"
      );
    }

    if (!leads || leads.length === 0) {
      throw new ApiError(404, "No leads found to qualify");
    }

    // Qualify leads in batch
    const results = [];
    const errors = [];

    for (const lead of leads) {
      try {
        const qualificationResult = await bantService.qualifyLead(lead);

        if (qualificationResult.success) {
          // Update lead with BANT data using shared service method
          const bantData = qualificationResult.data;
          await bantService.updateLeadWithBANT(lead, bantData);

          results.push({
            leadId: lead._id,
            success: true,
            score: bantData.score,
            category: bantData.category,
          });
        } else {
          errors.push({
            leadId: lead._id,
            error: qualificationResult.error,
          });
        }

        // Add delay between requests to avoid rate limiting
        await bantService.delay(1000);
      } catch (error) {
        errors.push({
          leadId: lead._id,
          error: error.message,
        });
      }
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          qualified: results.length,
          failed: errors.length,
          results: results,
          errors: errors,
        },
        `Successfully qualified ${results.length} leads using BANT method`
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to batch qualify leads using BANT"
    );
  }
});

// ==============================================================
// Helper Functions
// ==============================================================

export {
  getLeads,
  getLeadById,
  updateLeadById,
  searchLeads,
  updateLeadStatus,
  getLeadStats,
  deleteLead,
  qualifyLeadBANT,
  batchQualifyLeadsBANT,
  followUpEmail,
  followUpLeads,
  scheduleFollowUpLeads,
  scheduledLeads
};
