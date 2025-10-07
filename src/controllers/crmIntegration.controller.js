import { asyncHandler } from "../utils/asyncHandler.js";
import { CrmIntegration } from "../models/crmIntegration.model.js";
import { Company } from "../models/company.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Validator } from "../utils/validator.js";
import {
  generateAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  revokeToken,
  calculateTokenExpiry,
  getConfiguredProviders,
} from "../services/crm/oauth.service.js";
import { testCrmConnection as testCrmConnectionApi } from "../services/crm/api.service.js";
import {
  syncLeadsToCrm as syncLeadsService,
  importLeadsFromCrm,
  getSyncStatus,
  retryFailedSyncs,
} from "../services/crm/sync.service.js";

// ==============================================================
// OAuth2 Flow
// ==============================================================

/**
 * Get configured CRM providers
 * @route GET /api/v1/crm-integration/providers
 */
const getProviders = asyncHandler(async (req, res) => {
  const providers = getConfiguredProviders();

  const providersWithInfo = providers.map((provider) => ({
    id: provider,
    name: provider.charAt(0).toUpperCase() + provider.slice(1),
    configured: true,
  }));

  return res
    .status(200)
    .json(
      new ApiResponse(200, providersWithInfo, "Providers fetched successfully")
    );
});

/**
 * Initialize OAuth2 flow
 * @route POST /api/v1/crm-integration/oauth/init
 */
const initOAuthFlow = asyncHandler(async (req, res) => {
  const { provider } = req.body;
  const company = req.company;

  if (!provider) {
    throw new ApiError(400, "Provider is required");
  }

  // Check if company already has integration
  const existingIntegration = await CrmIntegration.findOne({
    companyId: company._id,
    provider,
  });

  if (existingIntegration) {
    throw new ApiError(
      409,
      `Integration with ${provider} already exists. Please disconnect first.`
    );
  }

  try {
    const { authUrl, state } = generateAuthUrl(
      provider,
      company._id.toString()
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          authUrl,
          state,
          provider,
        },
        "OAuth flow initialized"
      )
    );
  } catch (error) {
    console.error("OAuth init error:", error);
    throw new ApiError(500, error.message || "Failed to initialize OAuth flow");
  }
});

/**
 * Handle OAuth2 callback
 * @route GET /api/v1/crm-integration/oauth/callback/:provider
 */
const handleOAuthCallback = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error(`OAuth error for ${provider}:`, error_description);
    return res.redirect(
      `${process.env.CLIENT_URL}/super-user/settings?integration=failed&error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (!code || !state) {
    return res.redirect(
      `${process.env.CLIENT_URL}/super-user/settings?integration=failed&error=Missing+code+or+state`
    );
  }

  try {
    // Exchange code for tokens (this also validates and returns state data)
    const tokenData = await exchangeCodeForToken(provider, code, state);

    // The state is validated inside exchangeCodeForToken, but we need to extract companyId
    // We need to get it from the token exchange response which includes state data
    const stateData = tokenData.stateData || {};
    const companyId = stateData.companyId;

    // Prepare credentials based on provider
    let credentials = {};
    switch (provider) {
      case "zoho":
        credentials = {
          apiDomain: tokenData.apiDomain,
        };
        break;
      case "salesforce":
        credentials = {
          instanceUrl: tokenData.instanceUrl,
          id: tokenData.id,
        };
        break;
      case "dynamics":
        credentials = {
          resource:
            process.env.DYNAMICS_RESOURCE ||
            "https://yourdomain.crm.dynamics.com",
        };
        break;
      default:
        credentials = {};
    }

    // Test connection
    const connectionTest = await testCrmConnectionApi(
      provider,
      tokenData.accessToken,
      credentials
    );

    if (!connectionTest.success) {
      throw new ApiError(
        400,
        `Connection test failed: ${connectionTest.error}`
      );
    }

    // Create CRM integration
    const crmIntegration = await CrmIntegration.create({
      companyId,
      provider,
      status: "active",
      credentials,
      tokens: {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenExpiry: calculateTokenExpiry(tokenData.expiresIn),
        scope: tokenData.scope,
      },
      accountInfo: {
        accountId: connectionTest.userInfo?.id,
        accountName: connectionTest.userInfo?.name,
        accountEmail: connectionTest.userInfo?.email,
      },
    });

    console.log(
      `CRM integration created for company ${companyId} with ${provider}`
    );

    // Redirect to success page
    return res.redirect(
      `${process.env.CLIENT_URL}/super-user/settings?integration=success&provider=${provider}`
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return res.redirect(
      `${process.env.CLIENT_URL}/super-user/settings?integration=failed&error=${encodeURIComponent(error.message)}`
    );
  }
});

// ==============================================================
// CRM Integration Management
// ==============================================================

const getCrmIntegration = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    return res
      .status(200)
      .json(new ApiResponse(200, null, "No CRM integration found"));
  }

  // Remove sensitive data from response
  const safeIntegration = {
    ...crmIntegration.toObject(),
    credentials: undefined,
    tokens: {
      hasAccessToken: !!crmIntegration.tokens?.accessToken,
      hasRefreshToken: !!crmIntegration.tokens?.refreshToken,
      tokenExpiry: crmIntegration.tokens?.tokenExpiry,
      scope: crmIntegration.tokens?.scope,
    },
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
  const { settings } = req.body;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  // Update settings
  if (settings) {
    crmIntegration.settings = {
      ...crmIntegration.settings,
      ...settings,
    };
  }

  await crmIntegration.save();

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
        "CRM integration updated successfully"
      )
    );
});

const deleteCrmIntegration = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  // Revoke tokens
  try {
    await revokeToken(
      crmIntegration.provider,
      crmIntegration.tokens.accessToken
    );
  } catch (error) {
    console.warn("Token revocation failed:", error);
  }

  await CrmIntegration.findByIdAndDelete(crmIntegration._id);

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

  // Refresh tokens if needed
  if (crmIntegration.needsTokenRefresh()) {
    try {
      const refreshedTokens = await refreshAccessToken(
        crmIntegration.provider,
        crmIntegration.tokens.refreshToken
      );

      crmIntegration.tokens.accessToken = refreshedTokens.accessToken;
      crmIntegration.tokens.tokenExpiry = calculateTokenExpiry(
        refreshedTokens.expiresIn
      );
      await crmIntegration.save();
    } catch (error) {
      crmIntegration.status = "error";
      await crmIntegration.save();
      throw new ApiError(400, "Token refresh failed. Please reconnect.");
    }
  }

  const connectionTest = await testCrmConnectionApi(
    crmIntegration.provider,
    crmIntegration.tokens.accessToken,
    crmIntegration.credentials
  );

  if (!connectionTest.success) {
    crmIntegration.status = "error";
    await crmIntegration.save();
    throw new ApiError(400, connectionTest.error);
  }

  crmIntegration.status = "active";
  await crmIntegration.save();

  return res
    .status(200)
    .json(
      new ApiResponse(200, connectionTest, "CRM connection test successful")
    );
});

// ==============================================================
// Lead Sync
// ==============================================================

const syncLeadsToCrm = asyncHandler(async (req, res) => {
  const { leadIds } = req.body;

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    throw new ApiError(400, "Lead IDs array is required");
  }

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
    status: "active",
  });

  if (!crmIntegration) {
    throw new ApiError(404, "Active CRM integration not found");
  }

  const results = await syncLeadsService(leadIds, crmIntegration);

  return res
    .status(200)
    .json(new ApiResponse(200, results, "Leads sync completed"));
});

const importFromCrm = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
    status: "active",
  });

  if (!crmIntegration) {
    throw new ApiError(404, "Active CRM integration not found");
  }

  const results = await importLeadsFromCrm(crmIntegration, req.query);

  return res
    .status(200)
    .json(
      new ApiResponse(200, results, "Leads imported from CRM successfully")
    );
});

const getCrmSyncStatus = asyncHandler(async (req, res) => {
  const syncStatus = await getSyncStatus(req.company._id);

  return res
    .status(200)
    .json(new ApiResponse(200, syncStatus, "Sync status fetched successfully"));
});

const retryFailedLeads = asyncHandler(async (req, res) => {
  const results = await retryFailedSyncs(req.company._id);

  return res
    .status(200)
    .json(new ApiResponse(200, results, "Failed syncs retried"));
});

// ==============================================================
// Field Mapping
// ==============================================================

const updateFieldMapping = asyncHandler(async (req, res) => {
  const { fieldMapping } = req.body;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

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

// ==============================================================
// Error Logs
// ==============================================================

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
  getProviders,
  initOAuthFlow,
  handleOAuthCallback,
  getCrmIntegration,
  updateCrmIntegration,
  deleteCrmIntegration,
  testCrmConnection,
  syncLeadsToCrm,
  importFromCrm,
  getCrmSyncStatus,
  retryFailedLeads,
  updateFieldMapping,
  getCrmErrorLogs,
  resolveCrmError,
};
