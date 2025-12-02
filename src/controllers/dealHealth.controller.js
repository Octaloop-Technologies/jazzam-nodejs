import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import dealHealthService from "../services/dealHealth.service.js";
import { DealHealth } from "../models/dealHealth.model.js";
import { EngagementHistory } from "../models/engagementHistory.model.js";
import mongoose from "mongoose";

// Get deal health for a single lead
const getLeadHealth = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  const dealHealth = await DealHealth.findOne({
    leadId,
    companyId: req.company._id,
  }).populate("leadId", "fullName email company status");

  if (!dealHealth) {
    throw new ApiError(404, "Deal health data not found for this lead");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        dealHealth,
        "Deal health retrieved successfully"
      )
    );
});

// Get dashboard metrics
const getDashboardMetrics = asyncHandler(async (req, res) => {
  const metrics = await dealHealthService.getDashboardMetrics(req.company._id);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        metrics,
        "Dashboard metrics retrieved successfully"
      )
    );
});

// Get engagement history for a lead
const getEngagementHistory = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { days = 90 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  const engagements = await EngagementHistory.find({
    leadId,
    companyId: req.company._id,
  })
    .sort({ engagementDate: -1 })
    .limit(100);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        engagements,
        "Engagement history retrieved successfully"
      )
    );
});

// Log engagement manually
const logEngagement = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const engagementData = req.body;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  const engagement = await dealHealthService.logEngagement(
    req.company._id,
    leadId,
    engagementData
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        engagement,
        "Engagement logged successfully"
      )
    );
});

// Manually recalculate health
const recalculateHealth = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  const dealHealth = await dealHealthService.calculateDealHealth(
    req.company._id,
    leadId
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        dealHealth,
        "Health score recalculated successfully"
      )
    );
});

// Batch calculate health
const batchCalculateHealth = asyncHandler(async (req, res) => {
  const { leadIds } = req.body;

  const result = await dealHealthService.batchCalculateHealth(
    req.company._id,
    leadIds
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Batch health calculation completed"
      )
    );
});

// Get at-risk leads
const getAtRiskLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const atRiskLeads = await DealHealth.find({
    companyId: req.company._id,
    "riskIndicators.riskLevel": "high",
  })
    .populate("leadId", "fullName email company status")
    .sort({ healthScore: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await DealHealth.countDocuments({
    companyId: req.company._id,
    "riskIndicators.riskLevel": "high",
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          leads: atRiskLeads,
          pagination: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
        "At-risk leads retrieved successfully"
      )
    );
});

export {
  getLeadHealth,
  getDashboardMetrics,
  getEngagementHistory,
  logEngagement,
  recalculateHealth,
  batchCalculateHealth,
  getAtRiskLeads,
};