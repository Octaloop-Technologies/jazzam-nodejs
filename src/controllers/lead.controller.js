import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Lead } from "../models/lead.model.js";
import { Validator } from "../utils/validator.js";
import mongoose from "mongoose";

const apiKey = process.env.APIFY_KEY;

if (!apiKey) {
  console.error("APIFY_KEY environment variable is not set");
}

// Create a new lead
const createLead = asyncHandler(async (req, res) => {
  const { linkedinProfileUrl } = req.body;

  // Check if API key is available
  if (!apiKey) {
    throw new ApiError(
      500,
      "LinkedIn scraping service is not configured. Please contact support."
    );
  }

  // Validate optional fields if provided
  if (linkedinProfileUrl) {
    Validator.validateLinkedInUrl(linkedinProfileUrl, "LinkedIn profile", true);
  }

  // Check if lead with same linkedin profile URL already exists then update it
  const existingLead = await Lead.findOne({ linkedinProfileUrl });
  if (existingLead) {
    await existingLead.updateOne({ linkedinProfileUrl });
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          existingLead,
          "You have already submitted your LinkedIn profile URL"
        )
      );
  }

  // Step 1: Start Actor
  const startResponse = await fetch(
    `https://api.apify.com/v2/acts/dev_fusion~linkedin-profile-scraper/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileUrls: [linkedinProfileUrl],
      }),
    }
  );

  if (!startResponse.ok) {
    console.error(
      "Apify start request failed:",
      startResponse.status,
      startResponse.statusText
    );
    throw new ApiError(500, "Failed to start LinkedIn scraping process");
  }

  const startData = await startResponse.json();

  if (!startData.data || !startData.data.id) {
    console.error("Invalid Apify start response:", startData);
    throw new ApiError(500, "Failed to start Apify actor");
  }

  const runId = startData.data.id;

  // Step 2: Poll until run is finished
  let runStatus = "READY";
  let datasetId = null;

  while (["READY", "RUNNING"].includes(runStatus)) {
    const runResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
    );
    const runData = await runResponse.json();

    runStatus = runData.data.status;
    datasetId = runData.data.defaultDatasetId;

    if (["SUCCEEDED", "FAILED", "ABORTED"].includes(runStatus)) break;

    await new Promise((r) => setTimeout(r, 5000)); // wait 5 sec before checking again
  }

  if (runStatus !== "SUCCEEDED") {
    throw new ApiError(500, `Apify run ended with status: ${runStatus}`);
  }

  // Step 3: Fetch dataset items
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&format=json`
  );

  if (!datasetResponse.ok) {
    console.error(
      "Apify dataset fetch failed:",
      datasetResponse.status,
      datasetResponse.statusText
    );
    throw new ApiError(500, "Failed to fetch LinkedIn profile data");
  }

  const results = await datasetResponse.json();

  // Create the lead with sanitized data
  // Apify returns an array of results, so use the first item
  const profile = Array.isArray(results) ? results[0] : results;

  // Check if profile data exists
  if (!profile || typeof profile !== "object") {
    console.log("Profile data is missing or invalid:", profile);
    throw new ApiError(
      500,
      "No LinkedIn profile data found. The profile might be private or the URL is invalid."
    );
  }

  const lead = await Lead.create({
    // Basic LinkedIn Profile Information
    linkedinProfileUrl: linkedinProfileUrl,
    firstName: profile.firstName || null,
    lastName: profile.lastName || null,
    fullName: profile.fullName || null,
    headline: profile.headline || null,
    email: profile.email || null,
    phone: profile.mobileNumber || null,
    followers: profile.followers || 0,
    connections: profile.connections || 0,
    publicIdentifier: profile.publicIdentifier || null,
    urn: profile.urn || null,

    // Company Information
    company: profile.companyName || null,
    companyIndustry: profile.companyIndustry || null,
    companyWebsite: profile.companyWebsite || null,
    companyLinkedin: profile.companyLinkedin || null,
    companyFoundedIn: profile.companyFoundedIn || null,
    companySize: profile.companySize || null,

    // Job Information
    jobTitle: profile.jobTitle || null,
    currentJobDuration: profile.currentJobDuration || null,
    currentJobDurationInYrs: profile.currentJobDurationInYrs || null,

    // Location Information
    location:
      profile.addressWithCountry ||
      profile.addressCountryOnly ||
      profile.addressWithoutCountry ||
      null,
    addressCountryOnly: profile.addressCountryOnly || null,
    addressWithCountry: profile.addressWithCountry || null,
    addressWithoutCountry: profile.addressWithoutCountry || null,

    // Profile Media
    profilePic: profile.profilePic || null,
    profilePicHighQuality: profile.profilePicHighQuality || null,
    profilePicAllDimensions: profile.profilePicAllDimensions || [],

    // Profile Content
    about: profile.about || null,
    creatorWebsite: profile.creatorWebsite || null,

    // Professional Data Arrays
    experiences: profile.experiences || [],
    educations: profile.educations || [],
    skills: profile.skills || [],
    languages: profile.languages || [],
    interests: profile.interests || [],

    // Additional Arrays
    licenseAndCertificates: profile.licenseAndCertificates || [],
    honorsAndAwards: profile.honorsAndAwards || [],
    volunteerAndAwards: profile.volunteerAndAwards || [],
    verifications: profile.verifications || [],
    promos: profile.promos || [],
    highlights: profile.highlights || [],
    projects: profile.projects || [],
    publications: profile.publications || [],
    patents: profile.patents || [],
    courses: profile.courses || [],
    testScores: profile.testScores || [],
    organizations: profile.organizations || [],
    volunteerCauses: profile.volunteerCauses || [],
    recommendations: profile.recommendations || [],
    updates: profile.updates || [],

    // Lead Management Fields
    status: "new",
    notes: "",
    assignedTo: null,
    tags: [],
  });

  // Step 4: Return final results
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        lead,
        "Your LinkedIn profile has been scraped and saved successfully"
      )
    );
});

// Get all leads with pagination, filtering, and sorting
const getLeads = asyncHandler(async (req, res) => {
  const {
    page = 0,
    limit = 10,
    status,
    companyIndustry,
    companySize,
    assignedTo,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build match conditions
  const matchConditions = {};

  if (status) matchConditions.status = status;
  if (companyIndustry) matchConditions.companyIndustry = companyIndustry;
  if (companySize) matchConditions.companySize = companySize;
  if (assignedTo)
    matchConditions.assignedTo =
      mongoose.Types.ObjectId.createFromHexString(assignedTo);

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
    $text: { $search: query.trim() },
  };

  if (status) matchConditions.status = status;
  if (companyIndustry) matchConditions.companyIndustry = companyIndustry;

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
      { $match: { status: { $ne: null } } },
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
      { $match: { status: { $ne: null } } },
      { $group: { _id: "$companyIndustry", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const locationStats = await Lead.aggregate([
      { $match: { status: { $ne: null } } },
      { $group: { _id: "$location", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
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
      locationBreakdown: locationStats,
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
    const lead = await Lead.findByIdAndDelete(id);

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Lead deleted successfully"));
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
