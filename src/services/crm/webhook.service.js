import { getTenantConnection } from "../../db/tenantConnection.js";
import { getTenantModels } from "../../models/index.js";
import { CrmIntegration } from "../../models/crmIntegration.model.js";
import { getCrmApi } from "./api.service.js";
import { refreshAccessToken } from "./oauth.service.js";
import crypto from "crypto";

/**
 * Process HubSpot webhook event
 */
export const processHubSpotWebhook = async (event, crmIntegration) => {
  const { subscriptionType, objectId, occurredAt, propertyName, propertyValue } = event;
  
  console.log(`📥 HubSpot Webhook: ${subscriptionType} for contact ${objectId}`);
  
  // Update webhook stats
  if (crmIntegration.webhooks) {
    crmIntegration.webhooks.lastReceivedAt = new Date();
    crmIntegration.webhooks.totalReceived = (crmIntegration.webhooks.totalReceived || 0) + 1;
    await crmIntegration.save();
  }
  
  try {
    switch (subscriptionType) {
      case 'contact.creation':
        return await handleContactCreation(objectId, crmIntegration);
        
      case 'contact.propertyChange':
        return await handleContactUpdate(objectId, propertyName, crmIntegration);
        
      case 'contact.deletion':
        return await handleContactDeletion(objectId, crmIntegration);
        
      default:
        console.warn(`⚠️  Unknown webhook event: ${subscriptionType}`);
        return { skipped: true, reason: 'unknown_event' };
    }
  } catch (error) {
    console.error(`❌ Error processing webhook:`, error);
    await crmIntegration.addError('webhook', error.message);
    throw error;
  }
};

/**
 * Handle new contact created in HubSpot
 */
const handleContactCreation = async (contactId, crmIntegration) => {
  try {
    // Refresh tokens if needed
    if (crmIntegration.needsTokenRefresh()) {
      const refreshedTokens = await refreshAccessToken(
        crmIntegration.provider,
        crmIntegration.tokens.refreshToken
      );
      crmIntegration.tokens.accessToken = refreshedTokens.accessToken;
      crmIntegration.tokens.tokenExpiry = new Date(Date.now() + refreshedTokens.expiresIn * 1000);
      await crmIntegration.save();
    }
    
    // Fetch full contact details from HubSpot
    const crmApi = getCrmApi('hubspot');
    const accessToken = crmIntegration.tokens.accessToken;
    
    const hubspotContact = await crmApi.getContact(accessToken, contactId);
    
    // Check if lead_source_system indicates this is our own lead
    const sourceSystem = hubspotContact.properties?.lead_source_system;
    if (sourceSystem === 'Jazzaam') {
      console.log(`⏭️  Skipping contact ${contactId} - originated from our platform`);
      return { skipped: true, reason: 'originated_internally' };
    }
    
    // Get tenant connection
    const tenantConnection = await getTenantConnection(
      crmIntegration.companyId.toString()
    );
    const { Lead } = getTenantModels(tenantConnection);
    
    // Check if lead already exists by email or crmId
    const email = hubspotContact.properties?.email;
    
    if (!email) {
      console.log(`⚠️  Skipping contact ${contactId} - no email address`);
      return { skipped: true, reason: 'no_email' };
    }
    
    const existingLead = await Lead.findOne({
      $or: [
        { email: email },
        { crmId: contactId }
      ]
    });
    
    if (existingLead) {
      // Check if we should update this lead
      if (!existingLead.shouldSyncFromCrm(hubspotContact, 'hubspot')) {
        console.log(`⏭️  Skipping update for contact ${contactId} - originated from platform`);
        return { skipped: true, reason: 'originated_internally' };
      }
      
      console.log(`✏️  Updating existing lead for contact ${contactId}`);
      return await updateLeadFromHubSpot(existingLead, hubspotContact, crmIntegration);
    }
    
    // Create new lead
    console.log(`➕ Creating new lead from HubSpot contact ${contactId}`);
    const leadData = mapHubSpotContactToLead(hubspotContact, crmIntegration);
    
    const newLead = await Lead.create({
      ...leadData,
      crmId: contactId,
      crmSyncStatus: 'synced',
      crmSyncAt: new Date(),
      crmMetadata: {
        sourceSystem: 'HubSpot',
        lastSyncDirection: 'from_crm',
        lastSyncedAt: new Date(),
        syncVersion: 1,
        crmProvider: 'hubspot',
        lastModifiedInCrm: new Date(hubspotContact.updatedAt)
      }
    });
    
    console.log(`✅ Lead created: ${newLead._id}`);
    return { success: true, leadId: newLead._id, action: 'created' };
    
  } catch (error) {
    console.error(`❌ Failed to handle contact creation:`, error);
    throw error;
  }
};

/**
 * Handle contact update in HubSpot
 */
const handleContactUpdate = async (contactId, propertyName, crmIntegration) => {
  try {
    // Refresh tokens if needed
    if (crmIntegration.needsTokenRefresh()) {
      const refreshedTokens = await refreshAccessToken(
        crmIntegration.provider,
        crmIntegration.tokens.refreshToken
      );
      crmIntegration.tokens.accessToken = refreshedTokens.accessToken;
      crmIntegration.tokens.tokenExpiry = new Date(Date.now() + refreshedTokens.expiresIn * 1000);
      await crmIntegration.save();
    }
    
    // Fetch updated contact
    const crmApi = getCrmApi('hubspot');
    const accessToken = crmIntegration.tokens.accessToken;
    
    const hubspotContact = await crmApi.getContact(accessToken, contactId);
    
    // Check source system
    const sourceSystem = hubspotContact.properties?.lead_source_system;
    if (sourceSystem === 'Jazzaam') {
      console.log(`⏭️  Skipping update for contact ${contactId} - originated from platform`);
      return { skipped: true, reason: 'originated_internally' };
    }
    
    // Find lead in our system
    const tenantConnection = await getTenantConnection(
      crmIntegration.companyId.toString()
    );
    const { Lead } = getTenantModels(tenantConnection);
    
    const lead = await Lead.findOne({ crmId: contactId });
    
    if (!lead) {
      console.log(`Lead not found for contact ${contactId}, creating new...`);
      return await handleContactCreation(contactId, crmIntegration);
    }
    
    // Check if we should sync
    if (!lead.shouldSyncFromCrm(hubspotContact, 'hubspot')) {
      console.log(`⏭️  Skipping sync - recent sync or originated internally`);
      return { skipped: true, reason: 'recent_sync_or_internal_origin' };
    }
    
    // Update lead
    return await updateLeadFromHubSpot(lead, hubspotContact, crmIntegration);
    
  } catch (error) {
    console.error(`❌ Failed to handle contact update:`, error);
    throw error;
  }
};

/**
 * Handle contact deletion
 */
const handleContactDeletion = async (contactId, crmIntegration) => {
  try {
    const tenantConnection = await getTenantConnection(
      crmIntegration.companyId.toString()
    );
    const { Lead } = getTenantModels(tenantConnection);
    
    const lead = await Lead.findOne({ crmId: contactId });
    
    if (lead) {
      // Option 1: Mark as unlinked (safer - preserves data)
      lead.crmSyncStatus = 'not_synced';
      lead.crmId = null;
      if (lead.crmMetadata) {
        lead.crmMetadata.lastSyncedAt = new Date();
        lead.crmMetadata.lastSyncDirection = 'from_crm';
      }
      await lead.save();
      
      console.log(`🔗 Unlinked lead ${lead._id} from deleted contact ${contactId}`);
      return { success: true, action: 'unlinked', leadId: lead._id };
    }
    
    return { skipped: true, reason: 'not_found' };
    
  } catch (error) {
    console.error(`❌ Failed to handle contact deletion:`, error);
    throw error;
  }
};

/**
 * Update existing lead with HubSpot data
 */
const updateLeadFromHubSpot = async (lead, hubspotContact, crmIntegration) => {
  const updates = mapHubSpotContactToLead(hubspotContact, crmIntegration);
  
  // Apply updates (HubSpot data takes precedence for bidirectional sync)
  Object.assign(lead, updates);
  
  // Update CRM metadata
  lead.crmMetadata = {
    ...lead.crmMetadata,
    sourceSystem: lead.crmMetadata?.sourceSystem || 'HubSpot',
    lastSyncDirection: 'from_crm',
    lastSyncedAt: new Date(),
    syncVersion: (lead.crmMetadata?.syncVersion || 0) + 1,
    lastModifiedInCrm: new Date(hubspotContact.updatedAt),
    crmProvider: 'hubspot'
  };
  
  lead.crmSyncStatus = 'synced';
  lead.crmSyncAt = new Date();
  
  await lead.save();
  
  console.log(`✅ Lead updated: ${lead._id}`);
  return { success: true, leadId: lead._id, action: 'updated' };
};

/**
 * Map HubSpot contact to Lead format
 */
const mapHubSpotContactToLead = (hubspotContact, crmIntegration) => {
  const props = hubspotContact.properties || {};
  
  return {
    firstName: props.firstname || '',
    lastName: props.lastname || '',
    fullName: `${props.firstname || ''} ${props.lastname || ''}`.trim() || props.email || 'Unknown',
    email: props.email || '',
    phone: props.phone || props.mobilephone || '',
    company: props.company || '',
    jobTitle: props.jobtitle || '',
    location: props.city || props.state || '',
    country: props.country || '',
    city: props.city || '',
    companyWebsite: props.website || '',
    source: 'import',
    platform: 'other',
    platformUrl: `https://app.hubspot.com/contacts/${crmIntegration.accountInfo?.accountId || 'portal'}/contact/${hubspotContact.id}`,
    profileUrl: `https://app.hubspot.com/contacts/${crmIntegration.accountInfo?.accountId || 'portal'}/contact/${hubspotContact.id}`,
    status: mapHubSpotStatus(props.hs_lead_status),
    notes: props.notes || ''
  };
};

/**
 * Map HubSpot lead status to our status
 */
const mapHubSpotStatus = (hubspotStatus) => {
  if (!hubspotStatus) return 'new';
  
  const statusMap = {
    'NEW': 'new',
    'OPEN': 'warm',
    'IN_PROGRESS': 'warm',
    'CONNECTED': 'hot',
    'QUALIFIED': 'qualified',
    'UNQUALIFIED': 'cold'
  };
  
  const upperStatus = hubspotStatus.toUpperCase();
  return statusMap[upperStatus] || 'new';
};

/**
 * Verify HubSpot webhook signature
 */
export const verifyHubSpotSignature = (requestBody, signature, clientSecret) => {
  try {
    const hash = crypto
      .createHmac('sha256', clientSecret)
      .update(requestBody)
      .digest('hex');
      
    return hash === signature;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
};

/**
 * Register webhook with HubSpot (for future use)
 */
/**
 * Register Zoho webhook (placeholder)
 * Note: Zoho webhooks must be configured manually in Zoho CRM UI
 */
export const registerZohoWebhook = async (webhookUrl, events, webhookToken) => {
  console.log('📝 Zoho webhooks must be configured manually:');
  console.log(`   1. Go to Zoho CRM > Settings > Developer Space > Webhooks`);
  console.log(`   2. Create new webhook`);
  console.log(`   3. URL: ${webhookUrl}`);
  console.log(`   4. Token: ${webhookToken}`);
  console.log(`   5. Select events: ${events.join(', ')}`);
  
  return {
    manual: true,
    webhookUrl,
    webhookToken,
    events
  };
};

export const registerHubSpotWebhook = async (accessToken, webhookUrl, events) => {
  const url = 'https://api.hubapi.com/webhooks/v3/subscriptions';
  
  const subscriptions = [];
  for (const event of events) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventType: event,
          active: true
        })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to register webhook: ${response.statusText} - ${errorData}`);
      }
      
      const data = await response.json();
      subscriptions.push(data);
    } catch (error) {
      console.error(`Failed to register ${event}:`, error);
    }
  }
  
  return subscriptions;
};

/**
 * Process webhook for any CRM provider
 */
export const processWebhook = async (provider, event, crmIntegration) => {
  switch (provider) {
    case 'hubspot':
      return await processHubSpotWebhook(event, crmIntegration);
      
    case 'salesforce':
      // TODO: Implement Salesforce webhook processing
      console.log('Salesforce webhook processing not yet implemented');
      return { skipped: true, reason: 'not_implemented' };
      
    case 'zoho':
      return await processZohoWebhook(event, crmIntegration);
      
    default:
      console.warn(`Unsupported webhook provider: ${provider}`);
      return { skipped: true, reason: 'unsupported_provider' };
  }
};
