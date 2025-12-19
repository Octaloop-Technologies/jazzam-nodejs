import { asyncHandler } from "../utils/asyncHandler.js";
import { getTenantConnection } from "../db/tenantConnection.js";
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

  // Check if company already has integration with this provider
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

  // Check channel limits based on subscription plan
  const currentIntegrations = await CrmIntegration.countDocuments({
    companyId: company._id,
    status: { $in: ["active", "inactive"] },
  });

  const channelLimits = {
    free: 0,
    starter: 1,
    pro: 2,
    growth: Infinity, // unlimited
  };

  const planLimit = channelLimits[company.subscriptionPlan] || 0;

  if (currentIntegrations >= planLimit) {
    throw new ApiError(
      403,
      `Your ${company.subscriptionPlan} plan allows only ${planLimit === Infinity ? "unlimited" : planLimit} channel${planLimit === 1 ? "" : "s"}. Please upgrade your plan to add more channels.`
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
  // console.log("this is called.......");
  // const { provider } = req.params;
  const { code, state, error, error_description, provider } = req.query;

  const crmProvider = req.params?.provider ? req.params?.provider : provider;
  // console.log("crm provider*******", crmProvider)

  // Handle OAuth errors
  if (error) {
    console.error(`OAuth error for ${crmProvider}:`, error_description);
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
    const tokenData = await exchangeCodeForToken(crmProvider, code, state);

    // The state is validated inside exchangeCodeForToken, but we need to extract companyId
    // We need to get it from the token exchange response which includes state data
    const stateData = tokenData.stateData || {};
    const companyId = stateData.companyId;

    // Prepare credentials based on provider
    let credentials = {};
    switch (crmProvider) {
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
      case "hubspot":
        credentials = {
          // HubSpot doesn't require special credentials beyond OAuth tokens
          portalId: tokenData.portalId || null,
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
      crmProvider,
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
      provider: crmProvider,
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
      `CRM integration created for company ${companyId} with ${crmProvider}`
    );

    // Redirect to success page
    return res.redirect(
      `${process.env.CLIENT_URL}/super-user/settings?integration=success&provider=${crmProvider}`
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
  const crmIntegrations = await CrmIntegration.find({
    companyId: req.company._id,
  }).sort({ createdAt: -1 });

  // Remove sensitive data from response
  const safeIntegrations = crmIntegrations.map((integration) => ({
    ...integration.toObject(),
    credentials: undefined,
    tokens: {
      hasAccessToken: !!integration.tokens?.accessToken,
      hasRefreshToken: !!integration.tokens?.refreshToken,
      tokenExpiry: integration.tokens?.tokenExpiry,
      scope: integration.tokens?.scope,
    },
  }));

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        safeIntegrations,
        "CRM integrations fetched successfully"
      )
    );
});

const updateCrmIntegration = asyncHandler(async (req, res) => {
  const { integrationId, settings } = req.body;

  if (!integrationId) {
    throw new ApiError(400, "Integration ID is required");
  }

  const crmIntegration = await CrmIntegration.findOne({
    _id: integrationId,
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
  const { integrationId } = req.params;

  if (!integrationId) {
    throw new ApiError(400, "Integration ID is required");
  }

  const crmIntegration = await CrmIntegration.findOne({
    _id: integrationId,
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

// Fix existing CRM integrations missing credentials
const fixCrmIntegrationCredentials = asyncHandler(async (req, res) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
  });

  if (!crmIntegration) {
    throw new ApiError(404, "CRM integration not found");
  }

  // Check if credentials are missing or empty
  if (
    !crmIntegration.credentials ||
    Object.keys(crmIntegration.credentials).length === 0
  ) {
    console.log(
      `Fixing missing credentials for ${crmIntegration.provider} integration`
    );

    // Set default credentials based on provider
    let credentials = {};
    switch (crmIntegration.provider) {
      case "zoho":
        credentials = {
          apiDomain: "https://www.zohoapis.com", // Default Zoho API domain
        };
        break;
      case "salesforce":
        credentials = {
          instanceUrl: "https://login.salesforce.com",
        };
        break;
      case "hubspot":
        credentials = {
          portalId: null, // HubSpot doesn't require special credentials
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

    // Update the integration with credentials
    crmIntegration.credentials = credentials;
    await crmIntegration.save();

    console.log(
      `✅ Fixed credentials for ${crmIntegration.provider} integration`
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "CRM integration credentials fixed"));
});

const testCrmConnection = asyncHandler(async (req, res) => {
  const { integrationId } = req.params;

  if (!integrationId) {
    throw new ApiError(400, "Integration ID is required");
  }

  const crmIntegration = await CrmIntegration.findOne({
    _id: integrationId,
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

  // Get tenant connection
  const tenantConnection = await getTenantConnection(req.company._id.toString());

  const results = await syncLeadsService(tenantConnection, leadIds, crmIntegration);

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

  // Get tenant connection
  const tenantConnection = await getTenantConnection(req.company._id.toString());

  const results = await importLeadsFromCrm(tenantConnection, crmIntegration, req.query);

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

/**
 * Get leads from connected CRM
 * @route GET /api/v1/crm-integration/leads
 */
const getLeadsFromCrm = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search } = req.query;

  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
    status: "active",
  });

  if (!crmIntegration) {
    throw new ApiError(404, "Active CRM integration not found");
  }

  // Check if tokens need refresh
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

  // Get CRM API handler
  const crmApi = getCrmApi(crmIntegration.provider);
  if (!crmApi) {
    throw new ApiError(400, `Unsupported CRM provider: ${crmIntegration.provider}`);
  }

  // Fetch leads from CRM based on provider
  let crmLeads = [];
  let totalCount = 0;
  const accessToken = crmIntegration.tokens.accessToken;

  try {
    switch (crmIntegration.provider) {
      case "hubspot": {
        const options = {
          limit: parseInt(limit),
          after: (parseInt(page) - 1) * parseInt(limit),
        };

        const response = await crmApi.getContacts(accessToken, options);
        crmLeads = response.results || [];
        totalCount = response.total || crmLeads.length;

        // Transform HubSpot contacts to standard format
        crmLeads = crmLeads.map((contact) => ({
          id: contact.id,
          crmId: contact.id,
          firstName: contact.properties?.firstname || "",
          lastName: contact.properties?.lastname || "",
          fullName: `${contact.properties?.firstname || ""} ${contact.properties?.lastname || ""}`.trim(),
          email: contact.properties?.email || "",
          phone: contact.properties?.phone || "",
          company: contact.properties?.company || "",
          jobTitle: contact.properties?.jobtitle || "",
          source: "HubSpot CRM",
          status: contact.properties?.hs_lead_status?.toLowerCase() || "new",
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
          crmLink: `https://app.hubspot.com/contacts/${crmIntegration.credentials.portalId || crmIntegration.accountInfo?.accountId}/contact/${contact.id}`,
        }));
        break;
      }

      case "salesforce": {
        const options = {
          limit: parseInt(limit),
          offset: (parseInt(page) - 1) * parseInt(limit),
        };

        const response = await crmApi.getLeads(
          accessToken,
          crmIntegration.credentials.instanceUrl,
          options
        );
        crmLeads = response.records || [];
        totalCount = response.totalSize || crmLeads.length;

        // Transform Salesforce leads to standard format
        crmLeads = crmLeads.map((lead) => ({
          id: lead.Id,
          crmId: lead.Id,
          firstName: lead.FirstName || "",
          lastName: lead.LastName || "",
          fullName: `${lead.FirstName || ""} ${lead.LastName || ""}`.trim(),
          email: lead.Email || "",
          phone: lead.Phone || "",
          company: lead.Company || "",
          jobTitle: lead.Title || "",
          source: "Salesforce CRM",
          status: lead.Status?.toLowerCase() || "new",
          createdAt: lead.CreatedDate,
          updatedAt: lead.LastModifiedDate,
          crmLink: `${crmIntegration.credentials.instanceUrl}/${lead.Id}`,
        }));
        break;
      }

      case "zoho": {
        const options = {
          page: parseInt(page),
          perPage: parseInt(limit),
        };

        const response = await crmApi.getLeads(
          accessToken,
          crmIntegration.credentials.apiDomain,
          options
        );
        crmLeads = response.data || [];
        totalCount = response.info?.count || crmLeads.length;

        // Transform Zoho leads to standard format
        crmLeads = crmLeads.map((lead) => ({
          id: lead.id,
          crmId: lead.id,
          firstName: lead.First_Name || "",
          lastName: lead.Last_Name || "",
          fullName: `${lead.First_Name || ""} ${lead.Last_Name || ""}`.trim(),
          email: lead.Email || "",
          phone: lead.Phone || "",
          company: lead.Company || "",
          jobTitle: lead.Title || "",
          source: "Zoho CRM",
          status: lead.Lead_Status?.toLowerCase() || "new",
          createdAt: lead.Created_Time,
          updatedAt: lead.Modified_Time,
          crmLink: `https://crm.zoho.com/crm/EntityInfo?module=Leads&id=${lead.id}`,
        }));
        break;
      }

      default:
        throw new ApiError(400, `Provider ${crmIntegration.provider} not supported for lead fetching`);
    }

    // Apply search filter if provided
    if (search && search.trim()) {
      const searchLower = search.trim().toLowerCase();
      crmLeads = crmLeads.filter(
        (lead) =>
          lead.fullName?.toLowerCase().includes(searchLower) ||
          lead.email?.toLowerCase().includes(searchLower) ||
          lead.company?.toLowerCase().includes(searchLower)
      );
      totalCount = crmLeads.length;
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          leads: crmLeads,
          totalResults: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          provider: crmIntegration.provider,
        },
        "CRM leads fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching CRM leads:", error);
    throw new ApiError(500, `Failed to fetch leads from ${crmIntegration.provider}: ${error.message}`);
  }
});

/**
 * Get combined leads (internal + CRM)
 * @route GET /api/v1/crm-integration/leads/combined
 */
const getCombinedLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  // Get tenant connection
  const tenantConnection = await getTenantConnection(req.company._id.toString());
  const { Lead } = getTenantModels(tenantConnection);

  // Get internal leads
  const internalLeads = await Lead.find({})
    .sort({ createdAt: -1 })
    .limit(parseInt(limit) / 2)
    .populate("formId", "name status formType")
    .lean();

  // Transform internal leads
  const transformedInternalLeads = internalLeads.map((lead) => ({
    ...lead,
    source: lead.source || "Internal",
    sourceType: "internal",
  }));

  // Get CRM leads
  let crmLeads = [];
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
    status: "active",
  });

  if (crmIntegration) {
    try {
      // Refresh tokens if needed
      if (crmIntegration.needsTokenRefresh()) {
        const refreshedTokens = await refreshAccessToken(
          crmIntegration.provider,
          crmIntegration.tokens.refreshToken
        );
        crmIntegration.tokens.accessToken = refreshedTokens.accessToken;
        crmIntegration.tokens.tokenExpiry = calculateTokenExpiry(refreshedTokens.expiresIn);
        await crmIntegration.save();
      }

      const crmApi = getCrmApi(crmIntegration.provider);
      if (crmApi) {
        const accessToken = crmIntegration.tokens.accessToken;

        switch (crmIntegration.provider) {
          case "hubspot": {
            const response = await crmApi.getContacts(accessToken, { limit: parseInt(limit) / 2 });
            crmLeads = (response.results || []).map((contact) => ({
              id: contact.id,
              crmId: contact.id,
              fullName: `${contact.properties?.firstname || ""} ${contact.properties?.lastname || ""}`.trim(),
              email: contact.properties?.email || "",
              company: contact.properties?.company || "",
              phone: contact.properties?.phone || "",
              source: "HubSpot",
              sourceType: "crm",
              status: contact.properties?.hs_lead_status?.toLowerCase() || "new",
              createdAt: contact.createdAt,
              crmLink: `https://app.hubspot.com/contacts/${crmIntegration.accountInfo?.accountId}/contact/${contact.id}`,
            }));
            break;
          }
          // Add other CRM providers as needed
        }
      }
    } catch (error) {
      console.warn("Failed to fetch CRM leads for combined view:", error.message);
    }
  }

  // Combine and sort by createdAt
  const combinedLeads = [...transformedInternalLeads, ...crmLeads]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, parseInt(limit));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        leads: combinedLeads,
        totalResults: combinedLeads.length,
        internalCount: transformedInternalLeads.length,
        crmCount: crmLeads.length,
        page: parseInt(page),
        limit: parseInt(limit),
      },
      "Combined leads fetched successfully"
    )
  );
});

export {
  getProviders,
  initOAuthFlow,
  handleOAuthCallback,
  getCrmIntegration,
  updateCrmIntegration,
  deleteCrmIntegration,
  fixCrmIntegrationCredentials,
  testCrmConnection,
  syncLeadsToCrm,
  importFromCrm,
  getCrmSyncStatus,
  retryFailedLeads,
  updateFieldMapping,
  getCrmErrorLogs,
  resolveCrmError,
  getLeadsFromCrm,
  getCombinedLeads,
};
