import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import nextBestActionService from "../services/nextBestAction.service.js";
import { getTenantModels } from "../models/index.js";
import mongoose from "mongoose";

// Generate next best action for a lead
const generateAction = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  const action = await nextBestActionService.generateNextBestAction(
    req.tenantConnection,
    leadId
  );

  return res
    .status(201)
    .json(
      new ApiResponse(201, action, "Next best action generated successfully")
    );
});

// Get next best action for a lead
const getLeadAction = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  const actions = await nextBestActionService.getActiveActions(
    req.tenantConnection,
    leadId
  );

  if (actions.length === 0) {
    throw new ApiError(404, "No active actions found for this lead");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { action: actions[0], relatedActions: actions.slice(1) },
        "Next best action retrieved successfully"
      )
    );
});

// Get all pending actions for company
const getPendingActions = asyncHandler(async (req, res) => {
  const { limit = 20, priority } = req.query;

  let actions = await nextBestActionService.getPendingActions(
    req.tenantConnection,
    parseInt(limit)
  );

  if (priority) {
    actions = actions.filter((a) => a.priority === priority);
  }

  const grouped = {
    critical: actions.filter((a) => a.priority === "critical"),
    high: actions.filter((a) => a.priority === "high"),
    medium: actions.filter((a) => a.priority === "medium"),
    low: actions.filter((a) => a.priority === "low"),
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { actions, grouped, total: actions.length },
        "Pending actions retrieved successfully"
      )
    );
});

// Execute an action
const executeAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;
  const { outcome = "success", notes, leadStatusChanged, newLeadStatus, engagement } = req.body;

  if (!mongoose.Types.ObjectId.isValid(actionId)) {
    throw new ApiError(400, "Invalid action ID");
  }

  const action = await nextBestActionService.executeAction(
    req.tenantConnection,
    actionId,
    req.user._id,
    {
      outcome,
      notes,
      leadStatusChanged,
      newLeadStatus,
      engagement,
      isEffective: outcome === "success",
    }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, action, "Action executed successfully"));
});

// Snooze an action
const snoozeAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;
  const { days = 3 } = req.body;

  if (!mongoose.Types.ObjectId.isValid(actionId)) {
    throw new ApiError(400, "Invalid action ID");
  }

  const action = await nextBestActionService.snoozeAction(actionId, days);

  return res
    .status(200)
    .json(new ApiResponse(200, action, "Action snoozed successfully"));
});

// Decline an action
const declineAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;
  const { reason = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(actionId)) {
    throw new ApiError(400, "Invalid action ID");
  }

  const action = await nextBestActionService.declineAction(actionId, reason);

  return res
    .status(200)
    .json(new ApiResponse(200, action, "Action declined successfully"));
});

// Batch generate actions
const batchGenerateActions = asyncHandler(async (req, res) => {
  const { leadIds } = req.body;

  const result = await nextBestActionService.batchGenerateActions(
    req.tenantConnection,
    leadIds
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, result, "Batch action generation completed")
    );
});

// Get action history for a lead
const getActionHistory = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { limit = 50 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  // Get tenant-specific models
  const { NextBestAction } = getTenantModels(req.tenantConnection);

  const actions = await NextBestAction.find({
    leadId,
  })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { actions, total: actions.length },
        "Action history retrieved successfully"
      )
    );
});

// Get action statistics
const getActionStats = asyncHandler(async (req, res) => {
  // Get tenant-specific models
  const { NextBestAction } = getTenantModels(req.tenantConnection);

  const stats = await NextBestAction.aggregate([
    {
      $match: {},
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const priorityStats = await NextBestAction.aggregate([
    {
      $match: {},
    },
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ]);

  const actionTypeStats = await NextBestAction.aggregate([
    {
      $match: {},
    },
    {
      $group: {
        _id: "$actionType",
        count: { $sum: 1 },
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { byStatus: stats, byPriority: priorityStats, byType: actionTypeStats },
        "Action statistics retrieved successfully"
      )
    );
});

export {
  generateAction,
  getLeadAction,
  getPendingActions,
  executeAction,
  snoozeAction,
  declineAction,
  batchGenerateActions,
  getActionHistory,
  getActionStats,
};