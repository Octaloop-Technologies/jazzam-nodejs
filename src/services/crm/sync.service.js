import { getTenantModels } from "../../models/index.js";
import { getTenantConnection } from "../../db/tenantConnection.js";
import { CrmIntegration } from "../../models/crmIntegration.model.js";
import { getCrmApi } from "./api.service.js";
import { refreshAccessToken } from "./oauth.service.js";

/**
 * CRM Sync Service
 * Handles bidirectional sync between leads and CRM systems
 */

// ============================================
// Lead Sync to CRM
// ============================================

/**
 * Sync a single lead to CRM
 */
export const syncLeadToCrm = async (tenantConnection, leadId, crmIntegration) => {
  try {
    const { Lead } = getTenantModels(tenantConnection);
    
    // Get lead data
    const lead = await Lead.findById(leadId);

    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    // Check if tokens need refresh
    if (crmIntegration.needsTokenRefresh()) {
      const refreshedTokens = await refreshAccessToken(
        crmIntegration.provider,
        crmIntegration.tokens.refreshToken
      );

      crmIntegration.tokens.accessToken = refreshedTokens.accessToken;
      crmIntegration.tokens.tokenExpiry = new Date(
        Date.now() + refreshedTokens.expiresIn * 1000
      );
      await crmIntegration.save();
    }

    // Get CRM API handler
    const crmApi = getCrmApi(crmIntegration.provider);

    if (!crmApi) {
      throw new Error(`Unsupported CRM provider: ${crmIntegration.provider}`);
    }

    // Map lead data to CRM format
    const mappedData = mapLeadToCrmFormat(lead, crmIntegration);

    // Create lead in CRM based on provider
    let result;
    const accessToken = crmIntegration.tokens.accessToken;

    switch (crmIntegration.provider) {
      case "zoho":
        result = await crmApi.createLead(
          accessToken,
          crmIntegration.credentials.apiDomain,
          mappedData
        );
        break;

      case "salesforce":
        result = await crmApi.createLead(
          accessToken,
          crmIntegration.credentials.instanceUrl,
          mappedData
        );
        break;

      case "hubspot":
        result = await crmApi.createContact(accessToken, mappedData);
        break;

      case "dynamics":
        result = await crmApi.createLead(
          accessToken,
          crmIntegration.credentials.resource,
          mappedData
        );
        break;

      default:
        throw new Error(`Unsupported provider: ${crmIntegration.provider}`);
    }

    // Update lead with CRM ID
    lead.crmSyncStatus = "synced";
    lead.crmId = result.id;
    lead.lastSyncedAt = new Date();
    // Mark that this lead originated from platform (not CRM)
    if (!lead.leadOrigin) {
      lead.leadOrigin = "platform";
    }
    await lead.save();

    // Update integration stats
    crmIntegration.stats.totalLeadsSynced += 1;

    return {
      success: true,
      leadId,
      crmId: result.id,
      provider: crmIntegration.provider,
    };
  } catch (error) {
    console.error(`Failed to sync lead ${leadId}:`, error);

    // Update lead sync status
    if (leadId && tenantConnection) {
      const { Lead } = getTenantModels(tenantConnection);
      await Lead.findByIdAndUpdate(leadId, {
        crmSyncStatus: "failed",
        syncError: error.message,
      });
    }

    throw error;
  }
};

/**
 * Sync multiple leads to CRM
 */
export const syncLeadsToCrm = async (tenantConnection, leadIds, crmIntegration) => {
  const results = {
    successful: [],
    failed: [],
    total: leadIds.length,
  };

  for (const leadId of leadIds) {
    try {
      const result = await syncLeadToCrm(tenantConnection, leadId, crmIntegration);
      results.successful.push(result);
    } catch (error) {
      results.failed.push({
        leadId,
        error: error.message,
      });
    }
  }

  // Update integration stats
  await crmIntegration.updateSyncStats(
    results.successful.length > 0,
    `Synced ${results.successful.length} of ${results.total} leads`
  );

  return results;
};

/**
 * Auto-sync new leads to CRM
 */
export const autoSyncNewLead = async (lead, companyId) => {
  try {
    // Get company's CRM integration
    const crmIntegration = await CrmIntegration.findOne({
      companyId,
      status: "active",
    });

    if (!crmIntegration) {
      return { success: false, reason: "No active CRM integration" };
    }

    // Check if auto-sync is enabled
    if (
      !crmIntegration.settings.autoSync.enabled ||
      crmIntegration.settings.syncDirection === "from_crm"
    ) {
      return { success: false, reason: "Auto-sync is disabled" };
    }

    // Get tenant connection
    const tenantConnection = await getTenantConnection(companyId.toString());

    // Sync lead
    const result = await syncLeadToCrm(tenantConnection, lead._id, crmIntegration);

    return { success: true, result };
  } catch (error) {
    console.error("Auto-sync failed:", error);
    return { success: false, error: error.message };
  }
};

// ============================================
// CRM to Lead Sync (Pull from CRM)
// ============================================

/**
 * Fetch and import leads from CRM
 */
export const importLeadsFromCrm = async (tenantConnection, crmIntegration, options = {}) => {
  try {
    const { Lead } = getTenantModels(tenantConnection);
    
    // Check if tokens need refresh
    if (crmIntegration.needsTokenRefresh()) {
      const refreshedTokens = await refreshAccessToken(
        crmIntegration.provider,
        crmIntegration.tokens.refreshToken
      );

      crmIntegration.tokens.accessToken = refreshedTokens.accessToken;
      crmIntegration.tokens.tokenExpiry = new Date(
        Date.now() + refreshedTokens.expiresIn * 1000
      );
      await crmIntegration.save();
    }

    // Get CRM API handler
    const crmApi = getCrmApi(crmIntegration.provider);

    if (!crmApi) {
      throw new Error(`Unsupported CRM provider: ${crmIntegration.provider}`);
    }

    // Fetch leads from CRM
    let crmLeads;
    const accessToken = crmIntegration.tokens.accessToken;

    switch (crmIntegration.provider) {
      case "zoho":
        crmLeads = await crmApi.getLeads(
          accessToken,
          crmIntegration.credentials.apiDomain,
          options
        );
        crmLeads = crmLeads.data || [];
        break;

      case "salesforce":
        crmLeads = await crmApi.getLeads(
          accessToken,
          crmIntegration.credentials.instanceUrl,
          options
        );
        crmLeads = crmLeads.records || [];
        break;

      case "hubspot":
        crmLeads = await crmApi.getContacts(accessToken, options);
        crmLeads = crmLeads.results || [];
        break;

      case "dynamics":
        crmLeads = await crmApi.getLeads(
          accessToken,
          crmIntegration.credentials.resource,
          options
        );
        crmLeads = crmLeads.value || [];
        break;

      default:
        throw new Error(`Unsupported provider: ${crmIntegration.provider}`);
    }

    // Import leads into database
    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      total: crmLeads.length,
    };

    for (const crmLead of crmLeads) {
      try {
        const mappedLead = mapCrmLeadToFormat(crmLead, crmIntegration.provider);

        // Check if lead already exists by email OR by originCrmId
        const existingLead = await Lead.findOne({
          $or: [
            { email: mappedLead.email },
            { originCrmId: mappedLead.crmId }
          ]
        });

        if (existingLead) {
          // Update existing lead only if it's not a platform-originated lead
          if (existingLead.leadOrigin !== "platform" || !existingLead.crmId) {
            Object.assign(existingLead, mappedLead);
            existingLead.lastSyncedAt = new Date();
            await existingLead.save();
            results.updated += 1;
          } else {
            // Skip leads that originated from platform (already synced to CRM)
            results.skipped += 1;
          }
        } else {
          // Create new lead from CRM
          await Lead.create({
            ...mappedLead,
            crmSyncStatus: "synced",
            lastSyncedAt: new Date(),
            leadOrigin: "crm",
            originCrmProvider: crmIntegration.provider,
            originCrmId: mappedLead.crmId,
          });
          results.imported += 1;
        }
      } catch (error) {
        console.error("Failed to import lead:", error);
        results.skipped += 1;
      }
    }

    return results;
  } catch (error) {
    console.error("Import from CRM failed:", error);
    throw error;
  }
};

// ============================================
// Field Mapping Utilities
// ============================================

/**
 * Map lead data to CRM format
 */
const mapLeadToCrmFormat = (lead, crmIntegration) => {
  const mapped = {
    name: lead.fullName || lead.name,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    jobTitle: lead.jobTitle,
    source: lead.source,
    description: lead.notes,
    message: lead.message,
    customFields: {},
  };

  // Apply custom field mappings
  if (crmIntegration.settings.fieldMapping.customFields) {
    for (const customField of crmIntegration.settings.fieldMapping
      .customFields) {
      const value = lead[customField.formField];
      if (value !== undefined) {
        mapped.customFields[customField.crmField] = value;
      }
    }
  }

  return mapped;
};

/**
 * Map CRM lead data to our format
 */
const mapCrmLeadToFormat = (crmLead, provider) => {
  let mapped = {};

  switch (provider) {
    case "zoho":
      mapped = {
        name: `${crmLead.First_Name || ""} ${crmLead.Last_Name || ""}`.trim(),
        firstName: crmLead.First_Name,
        lastName: crmLead.Last_Name,
        email: crmLead.Email,
        phone: crmLead.Phone,
        company: crmLead.Company,
        jobTitle: crmLead.Title,
        source: crmLead.Lead_Source || "CRM Import",
        notes: crmLead.Description,
        crmId: crmLead.id,
      };
      break;

    case "salesforce":
      mapped = {
        name: `${crmLead.FirstName || ""} ${crmLead.LastName || ""}`.trim(),
        firstName: crmLead.FirstName,
        lastName: crmLead.LastName,
        email: crmLead.Email,
        phone: crmLead.Phone,
        company: crmLead.Company,
        jobTitle: crmLead.Title,
        source: crmLead.LeadSource || "CRM Import",
        notes: crmLead.Description,
        crmId: crmLead.Id,
      };
      break;

    case "hubspot":
      mapped = {
        name: `${crmLead.properties.firstname || ""} ${crmLead.properties.lastname || ""}`.trim(),
        firstName: crmLead.properties.firstname,
        lastName: crmLead.properties.lastname,
        email: crmLead.properties.email,
        phone: crmLead.properties.phone,
        company: crmLead.properties.company,
        jobTitle: crmLead.properties.jobtitle,
        source: "CRM Import",
        crmId: crmLead.id,
      };
      break;

    case "dynamics":
      mapped = {
        name: `${crmLead.firstname || ""} ${crmLead.lastname || ""}`.trim(),
        firstName: crmLead.firstname,
        lastName: crmLead.lastname,
        email: crmLead.emailaddress1,
        phone: crmLead.telephone1,
        company: crmLead.companyname,
        jobTitle: crmLead.jobtitle,
        source: "CRM Import",
        notes: crmLead.description,
        crmId: crmLead.leadid,
      };
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  return mapped;
};

// ============================================
// Sync Status Management
// ============================================

/**
 * Get sync status for a company
 */
export const getSyncStatus = async (companyId) => {
  const crmIntegration = await CrmIntegration.findOne({ companyId });

  if (!crmIntegration) {
    return {
      hasIntegration: false,
    };
  }

  // Get tenant connection
  const tenantConnection = await getTenantConnection(companyId.toString());
  const { Lead } = getTenantModels(tenantConnection);

  // Get lead sync stats (no companyId filter needed!)
  const totalLeads = await Lead.countDocuments({});
  const syncedLeads = await Lead.countDocuments({ crmSyncStatus: "synced" });
  const pendingLeads = await Lead.countDocuments({ crmSyncStatus: { $in: ["pending", null] } });
  const failedLeads = await Lead.countDocuments({ crmSyncStatus: "failed" });

  return {
    hasIntegration: true,
    provider: crmIntegration.provider,
    status: crmIntegration.status,
    autoSyncEnabled: crmIntegration.settings.autoSync.enabled,
    lastSyncAt: crmIntegration.settings.autoSync.lastSyncAt,
    stats: {
      totalLeads,
      syncedLeads,
      pendingLeads,
      failedLeads,
      syncPercentage:
        totalLeads > 0 ? ((syncedLeads / totalLeads) * 100).toFixed(2) : 0,
    },
    integrationStats: crmIntegration.stats,
  };
};

/**
 * Retry failed syncs
 */
export const retryFailedSyncs = async (companyId) => {
  const crmIntegration = await CrmIntegration.findOne({
    companyId,
    status: "active",
  });

  if (!crmIntegration) {
    throw new Error("No active CRM integration found");
  }

  // Get tenant connection
  const tenantConnection = await getTenantConnection(companyId.toString());
  const { Lead } = getTenantModels(tenantConnection);

  // Get failed leads
  const failedLeads = await Lead.find({ crmSyncStatus: "failed" });

  const leadIds = failedLeads.map((lead) => lead._id);

  // Retry sync
  return await syncLeadsToCrm(tenantConnection, leadIds, crmIntegration);
};
