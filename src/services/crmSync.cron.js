import cron from 'node-cron';
import { getTenantModels } from '../models/index.js';
import { CrmIntegration } from '../models/crmIntegration.model.js';
import { getCrmApi } from './crm/api.service.js';
import { refreshAccessToken, calculateTokenExpiry } from './crm/oauth.service.js';
import mongoose from 'mongoose';
import socketService from './socket.service.js';

/**
 * Import and save leads from connected CRMs to database
 * This is the same logic from lead.controller.js but adapted for cron
 */
const importCrmLeadsForCompany = async (companyId, tenantConnection) => {
  try {
    const { Form, Lead } = getTenantModels(tenantConnection);
    
    // Get ALL active CRM integrations for this company
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
            let allHubSpotContacts = [];
            let after = undefined;
            let hasMore = true;
            
            // Fetch all pages
            while (hasMore) {
              const response = await crmApi.getContacts(accessToken, { 
                limit: 100, 
                after: after 
              });
              
              if (!response.results || response.results.length === 0) {
                break;
              }
              
              allHubSpotContacts = [...allHubSpotContacts, ...response.results];
              
              // Check if there are more pages
              if (response.paging?.next?.after) {
                after = response.paging.next.after;
              } else {
                hasMore = false;
              }
            }
            
            if (allHubSpotContacts.length === 0) {
              break;
            }
            
            // Map all contacts to our format
            crmLeads = allHubSpotContacts.map((contact) => ({
              id: contact.id,
              firstName: contact.properties?.firstname || "",
              lastName: contact.properties?.lastname || "",
              fullName: `${contact.properties?.firstname || ""} ${contact.properties?.lastname || ""}`.trim() || "No Name",
              email: contact.properties?.email || "",
              phone: contact.properties?.phone || contact.properties?.mobilephone || "",
              company: contact.properties?.company || "",
              jobTitle: contact.properties?.jobtitle || "",
              status: contact.properties?.hs_lead_status?.toLowerCase() || "new",
              source: "HubSpot CRM",
            }));
            
            console.log(`[CRON] Mapped ${crmLeads.length} HubSpot contacts`);
            
            // Check for specific emails
            const targetEmails = ['adil.munir@octaloop.io', 'adeel.munir@octaloop.io'];
            console.log(`\n[CRON] Searching for target emails in ${crmLeads.length} contacts...`);
            targetEmails.forEach(email => {
              const found = crmLeads.find(l => l.email?.toLowerCase() === email.toLowerCase());
              console.log(`[CRON] ✉️ ${email} found:`, found ? 'YES' : 'NO');
              if (found) {
                console.log(`[CRON] Found lead:`, JSON.stringify(found, null, 2));
              }
            });
            
            // List all emails to see what we have
            console.log(`\n[CRON] All HubSpot emails:`, crmLeads.map(l => l.email).filter(e => e).join(', '));
            
            break;
          }

          case "salesforce": {
            console.log(`[CRON] Fetching leads from Salesforce...`);
            const response = await crmApi.getLeads(accessToken, {
              limit: 100,
            });
            crmLeads = (response.records || []).map((lead) => ({
              id: lead.Id,
              firstName: lead.FirstName || "",
              lastName: lead.LastName || "",
              fullName: `${lead.FirstName || ""} ${lead.LastName || ""}`.trim(),
              email: lead.Email || "",
              phone: lead.Phone || lead.MobilePhone || "",
              company: lead.Company || "",
              jobTitle: lead.Title || "",
              status: lead.Status?.toLowerCase() || "new",
              source: "Salesforce CRM",
            }));
            console.log(`[CRON] Fetched ${crmLeads.length} Salesforce leads`);
            break;
          }

          case "zoho": {
            console.log(`[CRON] Fetching leads from Zoho...`);
            const response = await crmApi.getLeads(
              accessToken,
              crmIntegration.credentials.apiDomain,
              { page: 1, perPage: 100 }
            );
            crmLeads = (response.data || []).map((lead) => ({
              id: lead.id,
              firstName: lead.First_Name || "",
              lastName: lead.Last_Name || "",
              fullName: `${lead.First_Name || ""} ${lead.Last_Name || ""}`.trim(),
              email: lead.Email || "",
              phone: lead.Phone || lead.Mobile || "",
              company: lead.Company || "",
              jobTitle: lead.Designation || "",
              status: lead.Lead_Status?.toLowerCase() || "new",
              source: "Zoho CRM",
            }));
            console.log(`[CRON] Fetched ${crmLeads.length} Zoho leads`);
            break;
          }

          case "dynamics": {
            console.log(`[CRON] Fetching leads from Dynamics 365...`);
            const response = await crmApi.getLeads(
              accessToken,
              crmIntegration.credentials.resource,
              { top: 100, skip: 0 }
            );
            crmLeads = (response.value || []).map((lead) => ({
              id: lead.leadid,
              firstName: lead.firstname || "",
              lastName: lead.lastname || "",
              fullName: `${lead.firstname || ""} ${lead.lastname || ""}`.trim(),
              email: lead.emailaddress1 || "",
              phone: lead.telephone1 || "",
              company: lead.companyname || "",
              jobTitle: lead.jobtitle || "",
              status: lead.statuscode?.toString().toLowerCase() || "new",
              source: "Dynamics 365 CRM",
            }));
            console.log(`[CRON] Fetched ${crmLeads.length} Dynamics 365 leads`);
            break;
          }
        }

        allCrmLeads = [...allCrmLeads, ...crmLeads];
        
      } catch (error) {
        console.error(`Error fetching from ${crmIntegration.provider}:`, error.message);
        continue;
      }
    }

    if (allCrmLeads.length === 0) {
      console.log(`[CRON] No leads to import`);
      return { imported: 0, updated: 0, skipped: 0, total: 0 };
    }

    // Get all platform leads that have been synced to CRMs
    const syncedLeads = await Lead.find({ crmId: { $ne: null } }).select('crmId email');
    const syncedCrmIds = syncedLeads.map(lead => lead.crmId);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const crmLead of allCrmLeads) {
      try {
        const leadIdentifier = crmLead.email || crmLead.id || 'unknown';
        console.log(`\n[CRON] ========== Processing: ${leadIdentifier} ==========`);
        console.log(`[CRON] CRM Lead Data:`, JSON.stringify(crmLead, null, 2));
        
        // Skip leads without email
        if (!crmLead.email || crmLead.email.trim() === '') {
          console.log(`[CRON] ❌ Skipping - no email`);
          skipped++;
          continue;
        }
        
        // Skip if this CRM lead was originally synced FROM our platform
        if (syncedCrmIds.includes(crmLead.id)) {
          skipped++;
          continue;
        }

        // Check if lead already exists
        const existingLead = await Lead.findOne({ email: crmLead.email });
        
        if (existingLead) {
          console.log(`[CRON] 📝 Lead ${crmLead.email} exists - checking if should update`);
          // Only update if it's a CRM-originated lead
          if (existingLead.leadOrigin === 'crm') {
            existingLead.firstName = crmLead.firstName || existingLead.firstName;
            existingLead.lastName = crmLead.lastName || existingLead.lastName;
            existingLead.fullName = crmLead.fullName || existingLead.fullName;
            existingLead.phone = crmLead.phone || existingLead.phone;
            existingLead.company = crmLead.company || existingLead.company;
            existingLead.jobTitle = crmLead.jobTitle || existingLead.jobTitle;
            existingLead.lastSyncedAt = new Date();
            await existingLead.save();
            console.log(`[CRON] ✅ Updated CRM lead: ${crmLead.email}`);
            updated++;
          } else {
            console.log(`[CRON] ⏭️ Skipping ${crmLead.email} - platform-originated lead (won't overwrite)`);
            skipped++;
          }
        } else {
          console.log(`[CRON] 🆕 Lead ${crmLead.email} does NOT exist - will create new`);
          
          // Map CRM status to valid lead status enum
          let mappedStatus = 'new';
          if (crmLead.status) {
            const statusLower = crmLead.status.toLowerCase();
            if (['hot', 'warm', 'cold', 'qualified'].includes(statusLower)) {
              mappedStatus = statusLower;
            }
          }

          // Determine CRM provider
          const crmProvider = crmLead.source?.includes('HubSpot') ? 'hubspot' : 
                             crmLead.source?.includes('Zoho') ? 'zoho' :
                             crmLead.source?.includes('Salesforce') ? 'salesforce' :
                             crmLead.source?.includes('Dynamics') ? 'dynamics' : null;

          // Create new lead
          const newLead = await Lead.create({
            companyId: companyId,
            formId: crmFormId,
            fullName: crmLead.fullName || `${crmLead.firstName} ${crmLead.lastName}`.trim(),
            firstName: crmLead.firstName,
            lastName: crmLead.lastName,
            email: crmLead.email,
            phone: crmLead.phone,
            company: crmLead.company,
            jobTitle: crmLead.jobTitle,
            status: mappedStatus,
            source: 'import',
            leadOrigin: 'crm',
            originCrmProvider: crmProvider,
            originCrmId: crmLead.id,
            lastSyncedAt: new Date(),
            platform: 'other',
            platformUrl: `crm-${crmLead.id}`,
            notes: `Imported from ${crmLead.source || 'CRM'}`,
          });
          
          console.log(`[CRON] ✅ Created new CRM lead: ${crmLead.email}`);
          
          // Emit real-time event to frontend
          socketService.emitNewLead(companyId, newLead);
          
          imported++;
        }
      } catch (error) {
        console.error(`[CRON] ❌ ERROR processing lead ${crmLead.email}:`, error.message);
        console.error(`[CRON] Error stack:`, error.stack);
        console.error(`[CRON] Error name:`, error.name);
        if (error.errors) {
          console.error(`[CRON] Validation errors:`, JSON.stringify(error.errors, null, 2));
        }
        skipped++;
      }
    }

    console.log(`[CRON] Import summary: ${imported} imported, ${updated} updated, ${skipped} skipped`);
    
    // Emit CRM sync completion event to frontend
    if (imported > 0 || updated > 0) {
      console.log(`[CRON] 📡 Emitting CRM sync completion to company ${companyId}`);
      socketService.emitCrmSyncCompleted(companyId, {
        imported,
        updated,
        skipped,
        total: allCrmLeads.length,
        timestamp: new Date().toISOString(),
      });
    }
    
    return { imported, updated, skipped, total: allCrmLeads.length };
  } catch (error) {
    console.error('[CRON] Error in importCrmLeadsForCompany:', error.message);
    throw error;
  }
};

/**
 * Sync leads from all CRMs for all active companies
 */
const syncAllCrmLeads = async () => {
  try {
    console.log('\n🔄 Starting CRM leads sync...');
    
    // Get all unique company IDs with active CRM integrations
    const activeIntegrations = await CrmIntegration.find({ status: 'active' }).distinct('companyId');
    
    if (activeIntegrations.length === 0) {
      console.log('No active CRM integrations found');
      return;
    }

    console.log(`Found ${activeIntegrations.length} companies with active CRM integrations`);

    for (const companyId of activeIntegrations) {
      try {
        console.log(`\n[CRON] ========== Processing Company: ${companyId} ==========`);
        // Get company to find tenant database
        const { Company } = await import('../models/company.model.js');
        const company = await Company.findById(companyId);
        
        if (!company) {
          console.log(`⚠️ [CRON] Company ${companyId} not found`);
          continue;
        }

        console.log(`[CRON] Company name: ${company.companyName}`);

        // Create tenant connection using correct database naming pattern
        const tenantDbName = `jazzam_company_${company._id}`;
        console.log(`[CRON] Using database: ${tenantDbName}`);
        const tenantConnection = mongoose.connection.useDb(tenantDbName, { useCache: true });

        const result = await importCrmLeadsForCompany(companyId, tenantConnection);
        
        if (result && (result.imported > 0 || result.updated > 0)) {
          console.log(`✅ ${company.companyName}: ${result.imported} new, ${result.updated} updated`);
        } else if (result) {
          console.log(`⚠️ [CRON] Company ${companyId}: No new leads (${result.skipped} skipped)`);
        } else {
          console.log(`⚠️ [CRON] Company ${companyId}: No result returned`);
        }
      } catch (error) {
        console.error(`❌ [CRON] Error syncing company ${companyId}:`, error.message);
        console.error(`[CRON] Stack:`, error.stack);
      }
    }

    console.log('✅ CRM leads sync completed\n');
  } catch (error) {
    console.error('CRM sync error:', error.message);
  }
};

/**
 * Initialize CRM sync cron job
 */
const initCrmSyncCron = () => {
  // Schedule cron job
  const cronSchedule = '*/15 * * * *'; // Every 15 minutes

  cron.schedule(cronSchedule, async () => {
    await syncAllCrmLeads();
  });

  console.log('✅ CRM Sync Cron Job initialized (runs every 15 minutes)');

  // Run immediately on startup
  setTimeout(async () => {
    console.log('Running initial CRM sync...');
    await syncAllCrmLeads();
  }, 5000);
};

export { initCrmSyncCron, syncAllCrmLeads };
export default { initCrmSyncCron, syncAllCrmLeads };