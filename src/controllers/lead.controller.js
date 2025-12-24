import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getTenantModels } from "../models/index.js";
import mongoose from "mongoose";
import bantService from "../services/bant.service.js";
import emailService from "../services/email.service.js";
import ExcelJs from "exceljs";
import { CrmIntegration } from "../models/crmIntegration.model.js";
import { getCrmApi } from "../services/crm/api.service.js";
import { refreshAccessToken, calculateTokenExpiry } from "../services/crm/oauth.service.js";

// ==============================================================
// Helper Functions
// ==============================================================

/**
 * Import and save leads from connected CRMs to database
 * Avoids duplicates by checking if lead was synced from platform
 */
const importCrmLeadsToDatabase = async (companyId, tenantConnection) => {
  try {
    // Get tenant models
    const { Form } = getTenantModels(tenantConnection);
    
    // Get ALL active CRM integrations (user might have multiple CRMs connected)
    const crmIntegrations = await CrmIntegration.find({
      companyId: companyId,
      status: "active",
    });

    if (!crmIntegrations || crmIntegrations.length === 0) {
      return null;
    }

    // Get or create a default form for CRM imports
    let crmForm = await Form.findOne({ 
      companyId, 
      formType: 'custom',
      'config.isCrmImportForm': true 
    });

    if (!crmForm) {
      crmForm = await Form.create({
        companyId,
        formType: 'custom',
        config: {
          isCrmImportForm: true,
          fields: [
            { name: 'fullName', type: 'text', label: 'Full Name', required: true },
            { name: 'email', type: 'email', label: 'Email', required: true },
            { name: 'phone', type: 'tel', label: 'Phone', required: false },
            { name: 'company', type: 'text', label: 'Company', required: false },
            { name: 'jobTitle', type: 'text', label: 'Job Title', required: false },
          ],
          settings: {
            theme: "default",
            submitButtonText: "Import",
            successMessage: "Lead imported from CRM",
          },
        },
        name: 'CRM Import Form',
        description: 'Default form for leads imported from connected CRMs',
        isActive: true,
      });
    }

    const crmFormId = crmForm._id;

    // Collect leads from ALL connected CRMs
    let allCrmLeads = [];

    for (const crmIntegration of crmIntegrations) {
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
          console.error(`Token refresh failed for ${crmIntegration.provider}`);
          continue;
        }
      }

      // Get CRM API handler
      const crmApi = getCrmApi(crmIntegration.provider);
      if (!crmApi) {
        continue;
      }

      const accessToken = crmIntegration.tokens.accessToken;
      let crmLeads = [];

      try {
        // Fetch leads based on provider
        switch (crmIntegration.provider) {
          case "hubspot": {
            const hubspotOptions = {
              limit: 100,
              after: 0,
            };
            const response = await crmApi.getContacts(accessToken, hubspotOptions);
            crmLeads = (response.results || []).map((contact) => ({
              id: contact.id,
              crmId: contact.id,
              firstName: contact.properties?.firstname || "",
              lastName: contact.properties?.lastname || "",
              fullName: `${contact.properties?.firstname || ""} ${contact.properties?.lastname || ""}`.trim(),
              email: contact.properties?.email || "",
              phone: contact.properties?.phone || "",
              company: contact.properties?.company || "",
              jobTitle: contact.properties?.jobtitle || "",
              status: contact.properties?.hs_lead_status?.toLowerCase() || "new",
              createdAt: contact.createdAt,
              updatedAt: contact.updatedAt,
              source: "HubSpot CRM",
            }));
            break;
          }

          case "salesforce": {
            const sfOptions = {
              limit: 100,
              offset: 0,
            };
            const response = await crmApi.getLeads(
              accessToken,
              crmIntegration.credentials.instanceUrl,
              sfOptions
            );
            crmLeads = (response.records || []).map((lead) => ({
              id: lead.Id,
              crmId: lead.Id,
              firstName: lead.FirstName || "",
              lastName: lead.LastName || "",
              fullName: `${lead.FirstName || ""} ${lead.LastName || ""}`.trim(),
              email: lead.Email || "",
              phone: lead.Phone || "",
              company: lead.Company || "",
              jobTitle: lead.Title || "",
              status: lead.Status?.toLowerCase() || "new",
              createdAt: lead.CreatedDate,
              updatedAt: lead.LastModifiedDate,
              source: "Salesforce CRM",
            }));
            break;
          }

          case "zoho": {
            const zohoOptions = {
              page: 1,
              perPage: 100,
            };
            const response = await crmApi.getLeads(
              accessToken,
              crmIntegration.credentials.apiDomain,
              zohoOptions
            );
            crmLeads = (response.data || []).map((lead) => ({
              id: lead.id,
              crmId: lead.id,
              firstName: lead.First_Name || "",
              lastName: lead.Last_Name || "",
              fullName: `${lead.First_Name || ""} ${lead.Last_Name || ""}`.trim(),
              email: lead.Email || "",
              phone: lead.Phone || "",
              company: lead.Company || "",
              jobTitle: lead.Title || "",
              status: lead.Lead_Status?.toLowerCase() || "new",
              createdAt: lead.Created_Time,
              updatedAt: lead.Modified_Time,
              source: "Zoho CRM",
            }));
            break;
          }

          case "dynamics": {
            const dynamicsOptions = {
              top: 100,
              skip: 0,
            };
            const response = await crmApi.getLeads(
              accessToken,
              crmIntegration.credentials.resource,
              dynamicsOptions
            );
            crmLeads = (response.value || []).map((lead) => ({
              id: lead.leadid,
              crmId: lead.leadid,
              firstName: lead.firstname || "",
              lastName: lead.lastname || "",
              fullName: `${lead.firstname || ""} ${lead.lastname || ""}`.trim(),
              email: lead.emailaddress1 || "",
              phone: lead.telephone1 || "",
              company: lead.companyname || "",
              jobTitle: lead.jobtitle || "",
              status: "new",
              createdAt: lead.createdon,
              updatedAt: lead.modifiedon,
              source: "Dynamics 365 CRM",
            }));
            break;
          }

          default:
            console.log(`Unknown CRM provider: ${crmIntegration.provider}`);
            continue;
        }

        // Add leads from this CRM to the collection
        allCrmLeads = [...allCrmLeads, ...crmLeads];
        
      } catch (error) {
        console.error(`Error fetching from ${crmIntegration.provider}`);
        // Continue to next CRM integration
      }
    }

    // Now save these CRM leads to database (avoiding duplicates)
    const { Lead } = getTenantModels(tenantConnection);
    
    // Get all platform leads that have been synced to CRMs
    const syncedLeads = await Lead.find({ crmId: { $ne: null } }).select('crmId email');
    const syncedCrmIds = syncedLeads.map(lead => lead.crmId);
    const syncedEmails = syncedLeads.map(lead => lead.email).filter(Boolean);

    console.log(`Platform has ${syncedCrmIds.length} leads synced to CRMs`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const crmLead of allCrmLeads) {
      try {
        // Skip if this CRM lead was originally synced FROM our platform
        if (syncedCrmIds.includes(crmLead.id)) {
          skipped++;
          continue;
        }

        // Check if lead already exists in database by email or originCrmId
        const existingLead = await Lead.findOne({
          $or: [
            { email: crmLead.email },
            { originCrmId: crmLead.id }
          ]
        });

        if (existingLead) {
          // Update existing CRM lead (only if it's not a platform-originated lead)
          if (existingLead.leadOrigin === 'crm') {
            existingLead.firstName = crmLead.firstName || existingLead.firstName;
            existingLead.lastName = crmLead.lastName || existingLead.lastName;
            existingLead.fullName = crmLead.fullName || existingLead.fullName;
            existingLead.phone = crmLead.phone || existingLead.phone;
            existingLead.company = crmLead.company || existingLead.company;
            existingLead.jobTitle = crmLead.jobTitle || existingLead.jobTitle;
            existingLead.status = crmLead.status || existingLead.status;
            existingLead.lastSyncedAt = new Date();
            await existingLead.save();
            updated++;
            console.log(`Updated CRM lead: ${crmLead.email}`);
          } else {
            // This is a platform lead, don't overwrite it
            skipped++;
            console.log(`Skipping update for platform lead: ${crmLead.email}`);
          }
        } else {
          // Create new lead from CRM
          // Map CRM status to valid lead status enum
          let mappedStatus = 'new';
          if (crmLead.status) {
            const statusLower = crmLead.status.toLowerCase();
            if (['hot', 'warm', 'cold', 'qualified'].includes(statusLower)) {
              mappedStatus = statusLower;
            }
          }

          // Determine CRM provider from source
          const crmProvider = crmLead.source?.includes('HubSpot') ? 'hubspot' : 
                             crmLead.source?.includes('Zoho') ? 'zoho' :
                             crmLead.source?.includes('Salesforce') ? 'salesforce' :
                             crmLead.source?.includes('Dynamics') ? 'dynamics' : null;

          await Lead.create({
            formId: crmFormId,
            fullName: crmLead.fullName,
            firstName: crmLead.firstName,
            lastName: crmLead.lastName,
            email: crmLead.email,
            phone: crmLead.phone,
            company: crmLead.company,
            jobTitle: crmLead.jobTitle,
            status: mappedStatus,
            source: 'import', // Use valid enum value
            leadOrigin: 'crm',
            originCrmProvider: crmProvider,
            originCrmId: crmLead.id,
            crmId: crmLead.id,
            crmSyncStatus: 'synced',
            lastSyncedAt: new Date(),
            platform: 'other',
            platformUrl: `crm-${crmLead.id}`,
            notes: `Imported from ${crmLead.source || 'CRM'}`,
          });
          imported++;
          console.log(`Imported new CRM lead: ${crmLead.email}`);
        }
      } catch (error) {
        console.error(`Error processing CRM lead ${crmLead.email}:`, error.message);
        skipped++;
      }
    }

    console.log(`Import summary: ${imported} imported, ${updated} updated, ${skipped} skipped`);

    return {
      imported,
      updated,
      skipped,
      total: allCrmLeads.length,
    };
  } catch (error) {
    console.error("Error importing CRM leads:", error);
    return null;
  }
};

// ==============================================================
// Lead Controller Functions
// ==============================================================

// Manual trigger to import CRM leads
const syncCrmLeads = asyncHandler(async (req, res) => {
  console.log("📥 Manual CRM import triggered by user");
  
  try {
    const importResult = await importCrmLeadsToDatabase(req.company._id, req.tenantConnection);
    
    if (!importResult) {
      return res.status(200).json(
        new ApiResponse(200, { imported: 0, updated: 0, skipped: 0, total: 0 }, "No active CRM integrations found")
      );
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        importResult,
        `Successfully synced: ${importResult.imported} new leads imported, ${importResult.updated} updated, ${importResult.skipped} skipped`
      )
    );
  } catch (error) {
    console.error("CRM sync error:", error);
    throw new ApiError(500, `Failed to sync CRM leads: ${error.message}`);
  }
});

// Get all leads for a company (including CRM leads - bidirectional sync)
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
    includeCrmLeads = "true",
  } = req.query;

  // Get tenant-specific models
  const { Lead } = getTenantModels(req.tenantConnection);

  // Build match conditions (NO companyId needed - separate DB per tenant!)
  const matchConditions = {};
  if (status) matchConditions.status = status;
  if (platform) matchConditions.platform = platform;
  if (formId) matchConditions.formId = mongoose.Types.ObjectId.createFromHexString(formId);
  if (companyIndustry) matchConditions.companyIndustry = companyIndustry;
  if (companySize) matchConditions.companySize = companySize;
  if (source) matchConditions.source = source;

  // If user type is "user", only show leads assigned to them
  if (req.company.userType === "user") {
    matchConditions.assignedTo = req.company._id;
  }

  // Build sort object
  const sortObj = {};
  sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

  // If CRM leads are included, we need to fetch ALL leads first, then paginate after merging
  const shouldIncludeCrm = includeCrmLeads === "true" || includeCrmLeads === true;
  
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
      $lookup: {
        from: "dealhealths",
        localField: "_id",
        foreignField: "leadId",
        as: "dealHealth",
        pipeline: [
          {
            $project: {
              healthScore: 1,
              healthStatus: 1,
              velocityMetrics: 1,
              analysisCount: 1
            }
          }
        ]
      },
    },
    {
      $lookup: {
        from: "companies",
        localField: "assignedTo",
        foreignField: "_id",
        as: "assignedUser",
        pipeline: [{ $project: { fullName: 1, email: 1, userType: 1 } }],
      },
    },
    {
      $addFields: {
        form: { $arrayElemAt: ["$form", 0] },
        dealHealth: { $arrayElemAt: ["$dealHealth", 0] },
        assignedUser: { $arrayElemAt: ["$assignedUser", 0] },
        // For backward compatibility: use platformUrl if profileUrl doesn't exist
        profileUrl: {
          $ifNull: ["$profileUrl", "$platformUrl"],
        },
      },
    },
    { $sort: sortObj },
  ];

  // Query the database (includes both platform and imported CRM leads)
  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: sortObj,
  };

  const result = await Lead.aggregatePaginate(
    Lead.aggregate(pipeline),
    options
  );

  const allLeads = result.docs;
  const totalResults = result.totalDocs;

  // Transform the response to match frontend expectations (docs -> leads)
  const response = {
    leads: allLeads,
    totalResults: totalResults,
    page: parseInt(page),
    totalPages: Math.ceil(totalResults / parseInt(limit)),
    hasNextPage: parseInt(page) < Math.ceil(totalResults / parseInt(limit)),
    hasPrevPage: parseInt(page) > 1,
    limit: parseInt(limit),
  };

  console.log("dealhealth response*******", response.leads[0]?.dealHealth)

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
    // Get tenant-specific models
    const { Lead, DealHealth, NextBestAction } = getTenantModels(req.tenantConnection);

    const lead = await Lead.findById(id).populate("formId", "name status formType");

    if (!lead) {
      throw new ApiError(404, "Lead not found");
    }

    // For backward compatibility: use platformUrl if profileUrl doesn't exist
    const leadData = lead.toObject();
    if (!leadData.profileUrl && leadData.platformUrl) {
      leadData.profileUrl = leadData.platformUrl;
    }

    // Populate assigned user
    if (leadData.assignedTo) {
      const assignedUser = await mongoose.connection.db.collection('companies').findOne(
        { _id: leadData.assignedTo },
        { projection: { fullName: 1, email: 1, userType: 1 } }
      );
      leadData.assignedUser = assignedUser;
    }

    // Lead deal health and score
    const dealHealth = await DealHealth.findOne({ leadId: id }, {
      engagementMetrics: 1, velocityMetrics: 1, leadId: 1,
      healthScore: 1, healthStatus: 1, aiAnalysis: 1
    });

    // deal health NBA
    const nextBestAction = await NextBestAction.findOne({ dealHealthId: dealHealth?._id }, {
      actionType: 1,
      title: 1,
      description: 1,
      channel: 1,
      confidenceScore: 1
    });

    return res
      .status(200)
      .json(new ApiResponse(200, { leadData, dealHealth, nextBestAction }, "Lead fetched successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, error.message || "Failed to fetch lead");
  }
});

// Update lead by ID
const updateLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes, tags, leadScore, qualificationScore, bant, assignedTo } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid lead ID");
  }

  try {
    // Get tenant-specific models
    const { Lead, Notification } = getTenantModels(req.tenantConnection);

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
    if (assignedTo !== undefined) {
      // Validate that assignedTo is a team member if assigning
      if (assignedTo && req.companyDoc.teamMembers.some(member => member.company.toString() === assignedTo.toString())) {
        updateFields.assignedTo = assignedTo;
      } else if (assignedTo) {
        throw new ApiError(400, "Assigned user must be a team member of the company");
      } else {
        updateFields.assignedTo = null; // Unassign
      }
    }

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );

    if (!updatedLead) {
      throw new ApiError(404, "Lead not found");
    }

    // Real-time notifications
    if (status === "qualified") {
      // Create and emit real-time notification
      const newNotification = await Notification.create({
        companyId: req.company._id,
        title: "Lead Qualified",
        message: `A ${updatedLead?.fullName} as a lead has been qualified.`
      });
      req.io.emit(`notifications`, { action: "newNotification", notification: newNotification });
      console.log(`🔔 Real-time notification sent for company`);
    }

    // Notification for lead assignment
    if (assignedTo) {
      const assignmentNotification = await Notification.create({
        companyId: req.company._id,
        title: "Lead Assigned",
        message: `A lead ${updatedLead?.fullName} has been assigned to you.`
      });
      // Emit to assigned user
      req.io.emit(`notifications-${assignedTo}`, { action: "newNotification", notification: assignmentNotification });
      // Also emit to company
      req.io.emit(`notifications`, { action: "newNotification", notification: assignmentNotification });
      console.log(`🔔 Real-time assignment notification sent to user ${assignedTo}`);
      // Emit real-time event for new lead
      if (req.io) {
        req.io.to(`company_${req.company._id}`).emit("lead:new", {
          type: "lead:new",
          data: updatedLead,
          timestamp: new Date().toISOString(),
        });
        console.log(`📡 Real-time: New lead created - ${updatedLead.fullName}`);
      }
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

  // Get tenant-specific models
  const { Lead } = getTenantModels(req.tenantConnection);

  // Build match conditions (NO companyId needed!)
  const matchConditions = {
    $text: { $search: query.trim() },
  };

  if (status) matchConditions.status = status;
  if (platform) matchConditions.platform = platform;
  if (companyIndustry) matchConditions.companyIndustry = companyIndustry;
  if (source) matchConditions.source = source;

  // If user type is "user", only show leads assigned to them
  if (req.company.userType === "user") {
    matchConditions.assignedTo = req.company._id;
  }

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
      $lookup: {
        from: "companies",
        localField: "assignedTo",
        foreignField: "_id",
        as: "assignedUser",
        pipeline: [{ $project: { fullName: 1, email: 1, userType: 1 } }],
      },
    },
    {
      $addFields: {
        form: { $arrayElemAt: ["$form", 0] },
        assignedUser: { $arrayElemAt: ["$assignedUser", 0] },
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
    // Get tenant-specific models
    const { Lead } = getTenantModels(req.tenantConnection);

    const lead = await Lead.findById(id);

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
    // Get tenant-specific models
    const { Lead } = getTenantModels(req.tenantConnection);

    // Build base match for stats. If requester is a user, limit to their assigned leads.
    const baseMatch = { status: { $ne: null } };
    if (req.company && req.company.userType === "user") {
      baseMatch.assignedTo = req.company._id;
    }

    const stats = await Lead.aggregate([
      { $match: baseMatch },
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
      { $match: baseMatch },
      { $group: { _id: "$companyIndustry", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const platformStats = await Lead.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$platform", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const locationStats = await Lead.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$location", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const formStats = await Lead.aggregate([
      { $match: baseMatch },
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
    // Get tenant-specific models
    const { Lead } = getTenantModels(req.tenantConnection);

    const lead = await Lead.findByIdAndDelete(id);

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

// Create lead follow up
const createLeadFollowup = asyncHandler(async (req, res) => {
  try {
    const leadId = req.params;
    const { subject, message, status, scheduledDate, scheduled } = req.body;
    
    // Get tenant-specific models
    const { Lead, FollowUp, Notification } = getTenantModels(req.tenantConnection);
    
    const transformedScheduleData = scheduledDate ? new Date(scheduledDate) : null;
    const transformLeadId = new mongoose.mongo.ObjectId(leadId);
    const lead = await Lead.findById(transformLeadId);
    if (!lead) {
      return res.status(400).json({ success: false, message: "Lead not found" })
    }
    const followUpData = {
      leadId,
      channel: "email",
      subject,
      message,
      status,
      scheduleDate: transformedScheduleData,
      scheduled,
      dateOfSubmission: new Date
    }
    const newLeadFollowup = await FollowUp.create(followUpData);
    // Create and emit real-time notification
    const newNotification = await Notification.create({
      companyId: req.company._id,
      title: "Follow Up Sent",
      message: `Follow up sent to ${lead.email}`
    });
    // Emit notification to all connected clients of this company
    req.io.emit(`notifications`, { action: "newNotification", notification: newNotification });
    console.log(`🔔 Real-time notification sent for company`);
    return res.status(201).json({
      success: true,
      message: "Leads follow up created successfully",
      data: newLeadFollowup
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, error.message || "Failed to create lead follow up");
  }
})

// Follow up email for lead
const followUpEmail = asyncHandler(async (req, res) => {
  try {
    // Get tenant-specific models
    const { Lead, FollowUp } = getTenantModels(req.tenantConnection);
    
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
    // Get tenant-specific models
    const { FollowUp } = getTenantModels(req.tenantConnection);
    
    const { status, search, page = 1 } = req.query;
    const limit = 5;
    const skip = (page - 1) * limit;
    let filter = {};
    if (status !== "all") filter.status = status
    if (search) filter.$or = [
      { "leadId.fullName": { $regex: search, $options: "i" } },
      { "leadId.email": { $regex: search, $options: "i" } },
    ]

    // const totalRecordsArr = await FollowUp.aggregate([
    //   {
    //     $lookup: {
    //       from: "leads",
    //       localField: "leadId",
    //       foreignField: "_id",
    //       as: "leadId"
    //     }
    //   },
    //   { $unwind: "leadId" },
    //   { $match: filter },
    //   { $count: "total" }
    // ]);

    // const totalRecords = totalRecordsArr.length ? totalRecordsArr[0].total : 0;
    // const totalPages = Math.ceil(totalRecords  / limit)

    const followupLeadsData = await FollowUp.aggregate([
      {
        $lookup: {
          from: "leads",
          localField: "leadId",
          foreignField: "_id",
          as: "leadId"
        }
      },
      { $unwind: "$leadId" },
      { $match: filter },
      { $sort: { createdAt: -1 } },
      // { $skip: skip },
      // { $limit: limit },
      {
        $project: {
          _id: 1,
          companyId: 1,
          channel: 1,
          subject: 1,
          message: 1,
          status: 1,
          scheduleDate: 1,
          scheduled: 1,
          dateOfSubmission: 1,
          createdAt: 1,
          updatedAt: 1,

          leadId: {
            _id: 1,
            profilePic: 1,
            fullName: 1,
            email: 1,
            company: 1,
          }
        }
      }
    ])
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
    // Get tenant-specific models
    const { FollowUp } = getTenantModels(req.tenantConnection);
    
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
      // scheduleDate: { $gte: todayStart, $lte: todayEnd },
      scheduled: true
    }).populate({
      path: "leadId",
      select: "email companyId", // only these from lead
      populate: {
        path: "companyId",
        select: "companyName email"
      }
    });

    console.log(`📩 Found ${followUps.length} follow-up emails to send`);

    // 2️⃣ Send emails one by one
    for (const followUp of followUps) {
      try {
        await emailService.sendFollowUpEmail(followUp.leadId?.companyId?.companyName, followUp?.leadId?.email, followUp?.subject, followUp?.message);

        // 3️⃣ Update status and mark as scheduled
        followUp.status = "submitted";
        followUp.scheduled = false;
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

// Export leads Excel - filter by status
const exportLeadsExcel = asyncHandler(async (req, res) => {
  const { status } = req.query;

  // Get tenant-specific models
  const { Lead } = getTenantModels(req.tenantConnection);

  const filter = {};
  if (status !== "overall") filter.status = status;

  const leads = await Lead.find(filter).select(
    "fullName email company profileUrl platform status createdAt leadScore companyIndustry companySize location tags"
  ).lean();



  // create excel workbook
  const workbook = new ExcelJs.Workbook();
  const sheet = workbook.addWorksheet("Leads");

  sheet.columns = [
    { header: "Name", key: "fullName", width: 30 },
    { header: "Email", key: "email", width: 30 },
    { header: "Company", key: "company", width: 30 },
    { header: "Profile URL", key: "profileUrl", width: 50 },
    { header: "Platform", key: "platform", width: 20 },
    { header: "Status", key: "status", width: 15 },
    { header: "Lead Score", key: "leadScore", width: 12 },
    { header: "Industry", key: "companyIndustry", width: 20 },
    { header: "Company Size", key: "companySize", width: 15 },
    { header: "Location", key: "location", width: 20 },
    { header: "Tags", key: "tags", width: 30 },
    { header: "Created At", key: "createdAt", width: 22 },
  ];

  leads.forEach((l) => {
    sheet.addRow({
      fullName: l.fullName || "",
      email: l.email || "",
      company: (l.company && (typeof l.company === "string" ? l.company : l.company.companyName)) || "",
      profileUrl: l.profileUrl || l.platformUrl || "",
      platform: l.platform || "",
      status: l.status || "",
      leadScore: l.leadScore ?? "",
      companyIndustry: l.companyIndustry || "",
      companySize: l.companySize || "",
      location: l.location || "",
      tags: Array.isArray(l.tags) ? l.tags.join(", ") : (l.tags || ""),
      createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : "",
    });
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="leads-${status}-${Date.now()}.xlsx"`
  );

  const data = await workbook.xlsx.write(res);
  res.end();

})



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
    // Get tenant-specific models
    const { Lead } = getTenantModels(req.tenantConnection);

    const lead = await Lead.findById(id);

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
    // Get tenant-specific models
    const { Lead } = getTenantModels(req.tenantConnection);

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
      });
    } else if (filters) {
      // Qualify leads based on filters
      const matchConditions = {};

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

// Get assignable team members for leads
const getAssignableUsers = asyncHandler(async (req, res) => {
  try {
    // Get team members from company document
    const teamMembers = req.companyDoc.teamMembers.map(member => member.company);

    // Fetch user details from system DB
    const assignableUsers = await Company.find({
      _id: { $in: teamMembers },
      userType: "user"
    }).select("fullName email _id");

    return res
      .status(200)
      .json(new ApiResponse(200, assignableUsers, "Assignable users fetched successfully"));
  } catch (error) {
    throw new ApiError(500, error.message || "Failed to fetch assignable users");
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
  scheduledLeads,
  createLeadFollowup,
  exportLeadsExcel,
  syncCrmLeads,
  getAssignableUsers
};
