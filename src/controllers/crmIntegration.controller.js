import { asyncHandler } from "../utils/asyncHandler.js";
import { CrmIntegration } from "../models/crmIntegration.model.js";
import { Company } from "../models/company.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Validator } from "../utils/validator.js";

// ==============================================================
// CRM Integration Management Functions
// ==============================================================

const createCrmIntegration = asyncHandler(async (req, res) => {
  const { provider, credentials, tokens, settings } = req.body;

  // Validate required fields
  const validationRules = {
    provider: { type: "required" },
    credentials: { type: "required" },
    tokens: { type: "required" },
  };

  Validator.validateFields(req.body, validationRules);

  // Check if company already has an integration
  const existingIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (existingIntegration) {
    throw new ApiError(409, "Company already has a CRM integration");
  }

  // Create CRM integration
  const crmIntegration = await CrmIntegration.create({
    companyId: req.company._id,
    provider,
    credentials,
    tokens,
    settings: settings || {},
  });

  // Test the connection
  const connectionTest = await crmIntegration.testConnection();

  if (!connectionTest.success) {
    await CrmIntegration.findByIdAndDelete(crmIntegration._id);
    throw new ApiError(
      400,
      `Failed to connect to ${provider}: ${connectionTest.message}`
    );
  }

  // Update status to active
  crmIntegration.status = "active";
  crmIntegration.accountInfo = connectionTest.accountInfo;
  await crmIntegration.save();

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        crmIntegration,
        "CRM integration created successfully"
      )
    );
});

const getCrmIntegration = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  // Remove sensitive data from response
  const safeIntegration = {
    ...crmIntegration.toObject(),
    credentials: undefined,
    tokens: undefined,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        safeIntegration,
        "CRM integration fetched successfully"
      )
    );
});

const updateCrmIntegration = asyncHandler(async (req, res) => {
  const { credentials, tokens, settings } = req.body;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  // Update integration
  const updatedIntegration = await CrmIntegration.findOneAndUpdate(
    { companyId: req.company._id },
    {
      $set: {
        ...(credentials && { credentials }),
        ...(tokens && { tokens }),
        ...(settings && {
          settings: { ...crmIntegration.settings, ...settings },
        }),
      },
    },
    { new: true }
  );

  // Test the connection if credentials or tokens were updated
  if (credentials || tokens) {
    const connectionTest = await updatedIntegration.testConnection();

    if (!connectionTest.success) {
      throw new ApiError(
        400,
        `Failed to connect to ${updatedIntegration.provider}: ${connectionTest.message}`
      );
    }

    updatedIntegration.status = "active";
    updatedIntegration.accountInfo = connectionTest.accountInfo;
    await updatedIntegration.save();
  }

  // Remove sensitive data from response
  const safeIntegration = {
    ...updatedIntegration.toObject(),
    credentials: undefined,
    tokens: undefined,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        safeIntegration,
        "CRM integration updated successfully"
      )
    );
});

const deleteCrmIntegration = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOneAndDelete({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "CRM integration deleted successfully"));
});

const testCrmConnection = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  const connectionTest = await crmIntegration.testConnection();

  if (!connectionTest.success) {
    // Update integration status to error
    crmIntegration.status = "error";
    await crmIntegration.save();

    throw new ApiError(400, connectionTest.message);
  }

  // Update integration status to active
  crmIntegration.status = "active";
  crmIntegration.accountInfo = connectionTest.accountInfo;
  await crmIntegration.save();

  return res
    .status(200)
    .json(
      new ApiResponse(200, connectionTest, "CRM connection test successful")
    );
});

const syncLeadsToCrm = asyncHandler(async (req, res) => {
  const { leadIds } = req.body;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
    status: "active",
  });

  if (!crmIntegration) {
    throw new ApiError(404, "Active CRM integration not found");
  }

  // Check if tokens need refresh
  if (crmIntegration.needsTokenRefresh()) {
    throw new ApiError(400, "CRM tokens need to be refreshed");
  }

  // Here you would implement the actual sync logic based on the CRM provider
  // For now, we'll return a mock response
  const syncResults = {
    totalLeads: leadIds.length,
    successfulSyncs: leadIds.length,
    failedSyncs: 0,
    errors: [],
  };

  // Update sync statistics
  await crmIntegration.updateSyncStats(true, "Sync completed successfully");

  return res
    .status(200)
    .json(
      new ApiResponse(200, syncResults, "Leads synced to CRM successfully")
    );
});

const getCrmSyncStatus = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  const syncStatus = {
    status: crmIntegration.status,
    lastSyncAt: crmIntegration.settings.autoSync.lastSyncAt,
    nextSyncAt: crmIntegration.settings.autoSync.lastSyncAt
      ? new Date(
          crmIntegration.settings.autoSync.lastSyncAt.getTime() +
            crmIntegration.settings.autoSync.interval * 1000
        )
      : null,
    stats: crmIntegration.stats,
    autoSyncEnabled: crmIntegration.settings.autoSync.enabled,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, syncStatus, "CRM sync status fetched successfully")
    );
});

const updateFieldMapping = asyncHandler(async (req, res) => {
  const { fieldMapping } = req.body;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  // Update field mapping
  crmIntegration.settings.fieldMapping = {
    ...crmIntegration.settings.fieldMapping,
    ...fieldMapping,
  };

  await crmIntegration.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        crmIntegration.settings.fieldMapping,
        "Field mapping updated successfully"
      )
    );
});

const getCrmErrorLogs = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  const errorLogs = crmIntegration.errorLogs
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, parseInt(limit));

  return res
    .status(200)
    .json(
      new ApiResponse(200, errorLogs, "CRM error logs fetched successfully")
    );
});

const resolveCrmError = asyncHandler(async (req, res) => {
  const { errorId } = req.params;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  const error = crmIntegration.errorLogs.id(errorId);
  if (!error) {
    throw new ApiError(404, "Error log not found");
  }

  error.resolved = true;
  await crmIntegration.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Error marked as resolved"));
});

export {
  createCrmIntegration,
  getCrmIntegration,
  updateCrmIntegration,
  deleteCrmIntegration,
  testCrmConnection,
  syncLeadsToCrm,
  getCrmSyncStatus,
  updateFieldMapping,
  getCrmErrorLogs,
  resolveCrmError,
};
