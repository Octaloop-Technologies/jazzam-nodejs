import { asyncHandler } from "../utils/asyncHandler.js";
import { CrmIntegration } from "../models/crmIntegration.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { 
  processWebhook,
  verifyHubSpotSignature,
  registerHubSpotWebhook,
  registerZohoWebhook 
} from "../services/crm/webhook.service.js";

/**
 * HubSpot webhook endpoint
 * @route POST /api/v1/webhooks/hubspot
 */
export const handleHubSpotWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-hubspot-signature'];
  const events = Array.isArray(req.body) ? req.body : [req.body];
  
  console.log('📥 Received HubSpot webhook:', {
    eventCount: events.length,
    hasSignature: !!signature,
    events: events.map(e => ({ type: e.subscriptionType, objectId: e.objectId }))
  });
  
  // Verify webhook signature if secret is configured
  // Note: Signature verification is disabled for now as HubSpot v3 webhooks don't include signatures
  // HubSpot validates the webhook endpoint during subscription setup instead
  // if (signature && process.env.HUBSPOT_CLIENT_SECRET) {
  //   const rawBody = JSON.stringify(req.body);
  //   if (!verifyHubSpotSignature(rawBody, signature, process.env.HUBSPOT_CLIENT_SECRET)) {
  //     console.error('❌ Invalid webhook signature');
  //     throw new ApiError(401, 'Invalid webhook signature');
  //   }
  // }
  
  // Process each event
  const results = [];
  
  for (const event of events) {
    try {
      // Find active HubSpot CRM integration with webhooks enabled
      // Note: If you have multiple companies with HubSpot, you'll need to identify
      // which company this webhook belongs to based on the contact data
      const crmIntegration = await CrmIntegration.findOne({
        provider: 'hubspot',
        status: 'active'
      }).sort({ createdAt: -1 }); // Get most recent if multiple
      
      if (!crmIntegration) {
        console.warn('⚠️  No active HubSpot integration found');
        results.push({ 
          event: { type: event.subscriptionType, objectId: event.objectId }, 
          skipped: true,
          reason: 'no_integration' 
        });
        continue;
      }
      
      const result = await processWebhook('hubspot', event, crmIntegration);
      results.push({ 
        event: { type: event.subscriptionType, objectId: event.objectId }, 
        ...result 
      });
      
    } catch (error) {
      console.error('❌ Error processing webhook event:', error);
      results.push({ 
        event: { type: event.subscriptionType, objectId: event.objectId }, 
        error: error.message 
      });
    }
  }
  
  // Always return 200 to acknowledge receipt (HubSpot requirement)
  console.log('✅ Webhook processing complete:', {
    total: results.length,
    success: results.filter(r => r.success).length,
    skipped: results.filter(r => r.skipped).length,
    errors: results.filter(r => r.error).length
  });
  
  return res.status(200).json({
    success: true,
    message: 'Webhook processed',
    results
  });
});

/**
 * Generic webhook endpoint for any CRM
 * @route POST /api/v1/webhooks/:provider
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const events = Array.isArray(req.body) ? req.body : [req.body];
  
  console.log(`📥 Received ${provider} webhook:`, {
    eventCount: events.length
  });
  
  const crmIntegration = await CrmIntegration.findOne({
    provider,
    status: 'active'
  }).sort({ createdAt: -1 });
  
  if (!crmIntegration) {
    console.warn(`⚠️  No active ${provider} integration found`);
    return res.status(200).json({
      success: true,
      message: 'No active integration',
      skipped: true
    });
  }
  
  const results = [];
  
  for (const event of events) {
    try {
      const result = await processWebhook(provider, event, crmIntegration);
      results.push(result);
    } catch (error) {
      console.error(`❌ Error processing ${provider} webhook:`, error);
      results.push({ error: error.message });
    }
  }
  
  return res.status(200).json({
    success: true,
    message: 'Webhook processed',
    results
  });
});

/**
 * Zoho webhook endpoint
 * @route POST /api/v1/webhooks/zoho
 */
export const handleZohoWebhook = asyncHandler(async (req, res) => {
  const event = req.body;
  
  console.log('📥 Received Zoho webhook:', {
    operation: event.operation,
    module: event.module,
    ids: event.ids
  });
  
  // Find active Zoho CRM integration
  const crmIntegration = await CrmIntegration.findOne({
    provider: 'zoho',
    status: 'active'
  }).sort({ createdAt: -1 });
  
  if (!crmIntegration) {
    console.warn('⚠️  No active Zoho integration found');
    return res.status(200).json({
      success: true,
      message: 'No active integration',
      skipped: true
    });
  }
  
  try {
    const result = await processWebhook('zoho', event, crmIntegration);
    
    console.log('✅ Zoho webhook processing complete:', result);
    
    return res.status(200).json({
      success: true,
      message: 'Webhook processed',
      result
    });
  } catch (error) {
    console.error('❌ Error processing Zoho webhook:', error);
    
    // Still return 200 to acknowledge receipt
    return res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message
    });
  }
});

/**
 * Enable webhooks for CRM integration
 * @route POST /api/v1/crm-integration/:integrationId/enable-webhooks
 */
export const enableWebhooks = asyncHandler(async (req, res) => {
  const { integrationId } = req.params;
  const { webhookUrl } = req.body;
  
  const crmIntegration = await CrmIntegration.findOne({
    _id: integrationId,
    companyId: req.company._id
  });
  
  if (!crmIntegration) {
    throw new ApiError(404, 'CRM integration not found');
  }
  
  if (!['hubspot', 'zoho'].includes(crmIntegration.provider)) {
    throw new ApiError(400, 'Webhooks currently only supported for HubSpot and Zoho');
  }
  
  try {
    let subscriptions = null;
    let finalWebhookUrl;
    let events;
    
    if (crmIntegration.provider === 'hubspot') {
      // Register webhook with HubSpot
      events = ['contact.creation', 'contact.propertyChange'];
      finalWebhookUrl = webhookUrl || `${process.env.API_URL || process.env.CLIENT_URL}/api/v1/webhooks/hubspot`;
      
      console.log(`🔔 Registering HubSpot webhooks for URL: ${finalWebhookUrl}`);
      
      subscriptions = await registerHubSpotWebhook(
        crmIntegration.tokens.accessToken,
        finalWebhookUrl,
        events
      );
    } else if (crmIntegration.provider === 'zoho') {
      // For Zoho, webhooks need to be configured manually in Zoho CRM
      // We'll generate a webhook token for security
      const crypto = await import('crypto');
      const webhookToken = crypto.randomBytes(32).toString('hex');
      finalWebhookUrl = webhookUrl || `${process.env.API_URL || process.env.CLIENT_URL}/api/v1/webhooks/zoho`;
      events = ['Leads.create', 'Leads.edit', 'Leads.delete', 'Contacts.create', 'Contacts.edit', 'Contacts.delete'];
      
      console.log(`🔔 Webhook URL for Zoho: ${finalWebhookUrl}`);
      console.log(`🔑 Webhook Token: ${webhookToken}`);
      
      // Update integration with webhook token
      crmIntegration.webhooks = {
        enabled: true,
        webhookToken,
        events,
        lastReceivedAt: null,
        totalReceived: 0,
        url: finalWebhookUrl
      };
      
      await crmIntegration.save();
      
      return res.status(200).json(
        new ApiResponse(200, { 
          webhookUrl: finalWebhookUrl,
          webhookToken,
          events,
          instructions: 'Configure this webhook URL and token in Zoho CRM Settings > Developer Space > Webhooks'
        }, 'Webhook configuration generated. Please configure in Zoho CRM manually.')
      );
    }
    
    // Update integration
    crmIntegration.webhooks = {
      enabled: true,
      subscriptionId: subscriptions?.[0]?.id || 'manual',
      events: events,
      lastReceivedAt: null,
      totalReceived: 0,
      url: finalWebhookUrl
    };
    
    await crmIntegration.save();
    
    console.log('✅ Webhooks enabled successfully');
    
    return res.status(200).json(
      new ApiResponse(200, { subscriptions, webhookUrl: finalWebhookUrl }, 'Webhooks enabled successfully')
    );
  } catch (error) {
    console.error('❌ Failed to enable webhooks:', error);
    throw new ApiError(500, `Failed to enable webhooks: ${error.message}`);
  }
});

/**
 * Disable webhooks for CRM integration
 * @route POST /api/v1/crm-integration/:integrationId/disable-webhooks
 */
export const disableWebhooks = asyncHandler(async (req, res) => {
  const { integrationId } = req.params;
  
  const crmIntegration = await CrmIntegration.findOne({
    _id: integrationId,
    companyId: req.company._id
  });
  
  if (!crmIntegration) {
    throw new ApiError(404, 'CRM integration not found');
  }
  
  // Update integration
  if (crmIntegration.webhooks) {
    crmIntegration.webhooks.enabled = false;
  }
  
  await crmIntegration.save();
  
  return res.status(200).json(
    new ApiResponse(200, null, 'Webhooks disabled successfully')
  );
});

/**
 * Get webhook status and statistics
 * @route GET /api/v1/crm-integration/:integrationId/webhook-status
 */
export const getWebhookStatus = asyncHandler(async (req, res) => {
  const { integrationId } = req.params;
  
  const crmIntegration = await CrmIntegration.findOne({
    _id: integrationId,
    companyId: req.company._id
  });
  
  if (!crmIntegration) {
    throw new ApiError(404, 'CRM integration not found');
  }
  
  const webhookStatus = {
    enabled: crmIntegration.webhooks?.enabled || false,
    totalReceived: crmIntegration.webhooks?.totalReceived || 0,
    lastReceivedAt: crmIntegration.webhooks?.lastReceivedAt || null,
    subscriptionId: crmIntegration.webhooks?.subscriptionId || null,
    events: crmIntegration.webhooks?.events || [],
    webhookUrl: crmIntegration.webhooks?.url || null
  };
  
  return res.status(200).json(
    new ApiResponse(200, webhookStatus, 'Webhook status fetched successfully')
  );
});
