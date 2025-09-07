import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Lead } from "../models/lead.model.js";
import mongoose from "mongoose";

// Create a new lead
const createLead = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    linkedinProfile,
    company,
    location,
    website,
    industry,
    companySize,
    source,
    interests,
    status,
    notes,
    assignedTo,
    tags,
  } = req.body;

  // Validate required fields
  if (
    !name ||
    !email ||
    !phone ||
    !company ||
    !location ||
    !industry ||
    !companySize ||
    !source ||
    !interests ||
    !status
  ) {
    throw new ApiError(400, "All required fields must be provided");
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, "Invalid email format");
  }

  // Validate interests array
  if (!Array.isArray(interests) || interests.length === 0) {
    throw new ApiError(400, "At least one interest must be provided");
  }

  // Check if lead with same email already exists
  const existingLead = await Lead.findOne({ email: email.toLowerCase() });
  if (existingLead) {
    throw new ApiError(409, "Lead with this email already exists");
  }

  try {
    // Create the lead
    const lead = await Lead.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      linkedinProfile: linkedinProfile?.trim(),
      company: company.trim(),
      location: location.trim(),
      website: website?.trim(),
      industry: industry.toLowerCase(),
      companySize,
      source: source.toLowerCase(),
      interests,
      status: status ? status.toLowerCase() : "cold",
      notes: notes?.trim(),
      assignedTo: assignedTo || null,
      tags: tags || [],
    });

    return res
      .status(201)
      .json(new ApiResponse(201, lead, "Lead created successfully"));
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ApiError(400, `Validation error: ${messages.join(", ")}`);
    }
    throw new ApiError(500, "Error creating lead");
  }
});

// Get all leads with pagination, filtering, and sorting
const getLeads = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    industry,
    source,
    companySize,
    assignedTo,
    sortBy = "createdAt",
    sortOrder = "desc",
    isActive = true,
  } = req.query;

  // Build match conditions
  const matchConditions = { isActive: isActive === "true" };

  if (status) matchConditions.status = status;
  if (industry) matchConditions.industry = industry;
  if (source) matchConditions.source = source;
  if (companySize) matchConditions.companySize = companySize;
  if (assignedTo)
    matchConditions.assignedTo = new mongoose.Types.ObjectId(assignedTo);

  // Build sort object
  const sortObj = {};
  sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Create aggregation pipeline
  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: "users",
        localField: "assignedTo",
        foreignField: "_id",
        as: "assignedUser",
        pipeline: [{ $project: { fullName: 1, email: 1, avatar: 1 } }],
      },
    },
    {
      $addFields: {
        assignedUser: { $arrayElemAt: ["$assignedUser", 0] },
      },
    },
    { $sort: sortObj },
  ];

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    customLabels: {
      totalDocs: "totalLeads",
      docs: "leads",
    },
  };

  try {
    const result = await Lead.aggregatePaginate(
      Lead.aggregate(pipeline),
      options
    );

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Leads fetched successfully"));
  } catch (error) {
    throw new ApiError(500, "Error fetching leads");
  }
});

// Get a single lead by ID
const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  try {
    const lead = await Lead.findById(id).populate(
      "assignedTo",
      "fullName email avatar"
    );

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, lead, "Lead fetched successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Error fetching lead");
  }
});

// Search leads by text query
const searchLeads = asyncHandler(async (req, res) => {
  const {
    query,
    page = 1,
    limit = 10,
    status,
    industry,
    source,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  if (!query || query.trim().length === 0) {
    throw new ApiError(400, "Search query is required");
  }

  // Build match conditions
  const matchConditions = {
    isActive: true,
    $text: { $search: query.trim() },
  };

  if (status) matchConditions.status = status;
  if (industry) matchConditions.industry = industry;
  if (source) matchConditions.source = source;

  // Build sort object
  const sortObj = { score: { $meta: "textScore" } };
  if (sortBy !== "relevance") {
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;
  }

  // Create aggregation pipeline
  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: "users",
        localField: "assignedTo",
        foreignField: "_id",
        as: "assignedUser",
        pipeline: [{ $project: { fullName: 1, email: 1, avatar: 1 } }],
      },
    },
    {
      $addFields: {
        assignedUser: { $arrayElemAt: ["$assignedUser", 0] },
        searchScore: { $meta: "textScore" },
      },
    },
    { $sort: sortObj },
  ];

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    customLabels: {
      totalDocs: "totalResults",
      docs: "leads",
    },
  };

  try {
    const result = await Lead.aggregatePaginate(
      Lead.aggregate(pipeline),
      options
    );

    return res
      .status(200)
      .json(new ApiResponse(200, result, `Search results for "${query}"`));
  } catch (error) {
    throw new ApiError(500, "Error searching leads");
  }
});

// Update lead status and notes
const updateLeadStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  if (!status) {
    throw new ApiError(400, "Status is required");
  }

  try {
    const lead = await Lead.findById(id);

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    await lead.updateStatus(status, notes);

    return res
      .status(200)
      .json(new ApiResponse(200, lead, "Lead status updated successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Error updating lead status");
  }
});

// Get lead statistics
const getLeadStats = asyncHandler(async (req, res) => {
  try {
    const stats = await Lead.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: 1 },
          coldLeads: { $sum: { $cond: [{ $eq: ["$status", "cold"] }, 1, 0] } },
          warmLeads: { $sum: { $cond: [{ $eq: ["$status", "warm"] }, 1, 0] } },
          hotLeads: { $sum: { $cond: [{ $eq: ["$status", "hot"] }, 1, 0] } },
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
          coldLeads: 1,
          warmLeads: 1,
          hotLeads: 1,
          qualifiedLeads: 1,
          avgLeadScore: { $round: ["$avgLeadScore", 2] },
        },
      },
    ]);

    const industryStats = await Lead.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$industry", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const sourceStats = await Lead.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const result = {
      overview: stats[0] || {
        totalLeads: 0,
        coldLeads: 0,
        warmLeads: 0,
        hotLeads: 0,
        qualifiedLeads: 0,
        avgLeadScore: 0,
      },
      industryBreakdown: industryStats,
      sourceBreakdown: sourceStats,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "Lead statistics fetched successfully")
      );
  } catch (error) {
    throw new ApiError(500, "Error fetching lead statistics");
  }
});

// Delete a lead (soft delete)
const deleteLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  try {
    const lead = await Lead.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, lead, "Lead deleted successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Error deleting lead");
  }
});

export {
  createLead,
  getLeads,
  getLeadById,
  searchLeads,
  updateLeadStatus,
  getLeadStats,
  deleteLead,
};
