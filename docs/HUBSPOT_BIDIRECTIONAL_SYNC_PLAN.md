# HubSpot Bidirectional Lead Sync Implementation Plan

## Overview
This document outlines how to achieve bidirectional lead synchronization between your platform and HubSpot CRM using webhooks and APIs.

---

## ✅ What You Already Have

### Current Infrastructure
1. **CRM Integration Model** ([src/models/crmIntegration.model.js](../src/models/crmIntegration.model.js))
   - OAuth token management
   - Multi-provider support (HubSpot included)
   - Field mapping configuration
   - Sync statistics tracking

2. **CRM Services**
   - **OAuth Service**: Token exchange and refresh
   - **API Service**: HubSpot contact CRUD operations
   - **Sync Service**: One-way sync (Your Platform → HubSpot)

3. **Lead Model** ([src/models/lead.model.js](../src/models/lead.model.js))
   - `crmId`: Stores HubSpot contact ID
   - `crmSyncStatus`: Tracks sync state
   - `crmSyncAt`: Last sync timestamp

4. **Existing Capabilities**
   - ✅ Push leads to HubSpot (Flow A)
   - ✅ OAuth2 authentication
   - ✅ Token refresh mechanism
   - ✅ Field mapping system
   - ❌ Pull leads from HubSpot (Flow B) - **MISSING**
   - ❌ Webhook handling - **MISSING**
   - ❌ Loop prevention - **MISSING**

---

## 🎯 What You Need to Implement

### 1. HubSpot Webhooks (Critical Component)

#### Webhook Events to Subscribe To:
```javascript
- contact.creation      // New contact created in HubSpot
- contact.propertyChange // Contact updated in HubSpot
- contact.deletion      // Contact deleted (optional)
```

#### Webhook Registration Process:
**Option A: HubSpot UI (Easier for testing)**
1. Go to Settings → Integrations → Private Apps
2. Create a private app (or use existing)
3. Enable webhook subscriptions
4. Add your webhook URL: `https://yourdomain.com/api/v1/webhooks/hubspot`

**Option B: API (Programmatic)**
```javascript
POST https://api.hubapi.com/webhooks/v3/subscriptions
Authorization: Bearer YOUR_ACCESS_TOKEN

{
  "eventType": "contact.propertyChange",
  "propertyName": "email", // Or specific properties you care about
  "active": true
}
```

---

### 2. Prevent Infinite Sync Loops (CRITICAL)

#### Strategy: Source Tracking with Custom Properties

**Step 1: Create Custom Property in HubSpot**
```javascript
// Create via HubSpot API or UI
{
  "name": "lead_source_system",
  "label": "Lead Source System",
  "type": "enumeration",
  "fieldType": "select",
  "options": [
    { "label": "Your Platform", "value": "jazzaam" },
    { "label": "HubSpot", "value": "hubspot" },
    { "label": "Manual", "value": "manual" }
  ]
}
```

**Step 2: Update Lead Model**
```javascript
// Add to lead.model.js
{
  crmMetadata: {
    sourceSystem: {
      type: String,
      enum: ['jazzaam', 'hubspot', 'manual'],
      default: 'jazzaam'
    },
    lastSyncDirection: {
      type: String,
      enum: ['to_crm', 'from_crm']
    },
    hubspotContactId: String, // Alternative to crmId
    lastModifiedBy: String    // Track who modified last
  }
}
```

**Step 3: Loop Prevention Logic**
```javascript
// When syncing TO HubSpot
if (lead was created internally) {
  set lead_source_system = "jazzaam"
}

// When receiving FROM HubSpot webhook
if (contact.lead_source_system === "jazzaam") {
  // Skip sync - this is our own lead
  return;
}
```

---

### 3. Database Modifications

#### Update Lead Model Schema
Add these fields to [src/models/lead.model.js](../src/models/lead.model.js):

```javascript
// Add inside leadSchema
crmMetadata: {
  sourceSystem: {
    type: String,
    enum: ['jazzaam', 'hubspot', 'manual', 'import'],
    default: 'jazzaam'
  },
  lastSyncDirection: {
    type: String,
    enum: ['to_crm', 'from_crm']
  },
  lastSyncedAt: {
    type: Date
  },
  syncVersion: {
    type: Number,
    default: 1
  },
  lastModifiedInCrm: {
    type: Date
  }
},

// Add method
leadSchema.methods.shouldSyncFromCrm = function(hubspotContact) {
  // Don't sync if we created it
  if (hubspotContact.properties.lead_source_system === 'jazzaam') {
    return false;
  }
  
  // Don't sync if recently synced (prevent rapid back-and-forth)
  if (this.crmMetadata?.lastSyncedAt) {
    const timeSinceSync = Date.now() - this.crmMetadata.lastSyncedAt.getTime();
    if (timeSinceSync < 60000) { // Less than 1 minute
      return false;
    }
  }
  
  return true;
};
```

#### Update CRM Integration Model
Add webhook configuration to [src/models/crmIntegration.model.js](../src/models/crmIntegration.model.js):

```javascript
webhooks: {
  enabled: {
    type: Boolean,
    default: false
  },
  subscriptionId: {
    type: String  // HubSpot webhook subscription ID
  },
  secret: {
    type: String  // Webhook signature verification
  },
  events: [{
    type: String,
    enum: ['contact.creation', 'contact.propertyChange', 'contact.deletion']
  }],
  lastReceivedAt: {
    type: Date
  },
  totalReceived: {
    type: Number,
    default: 0
  }
}
```

---

### 4. New Files to Create

#### File 1: `src/services/crm/webhook.service.js`
Create a new webhook service:

```javascript
import { getTenantConnection } from "../../db/tenantConnection.js";
import { getTenantModels } from "../../models/index.js";
import { CrmIntegration } from "../../models/crmIntegration.model.js";
import { getCrmApi } from "./api.service.js";
import crypto from "crypto";

/**
 * Process HubSpot webhook event
 */
export const processHubSpotWebhook = async (event, crmIntegration) => {
  const { subscriptionType, objectId, occurredAt, propertyName, propertyValue } = event;
  
  console.log(`📥 HubSpot Webhook: ${subscriptionType} for contact ${objectId}`);
  
  // Update webhook stats
  crmIntegration.webhooks.lastReceivedAt = new Date();
  crmIntegration.webhooks.totalReceived += 1;
  await crmIntegration.save();
  
  switch (subscriptionType) {
    case 'contact.creation':
      return await handleContactCreation(objectId, crmIntegration);
      
    case 'contact.propertyChange':
      return await handleContactUpdate(objectId, propertyName, crmIntegration);
      
    case 'contact.deletion':
      return await handleContactDeletion(objectId, crmIntegration);
      
    default:
      console.warn(`Unknown webhook event: ${subscriptionType}`);
  }
};

/**
 * Handle new contact created in HubSpot
 */
const handleContactCreation = async (contactId, crmIntegration) => {
  try {
    // Fetch full contact details from HubSpot
    const crmApi = getCrmApi('hubspot');
    const accessToken = crmIntegration.tokens.accessToken;
    
    const hubspotContact = await crmApi.getContact(accessToken, contactId);
    
    // Check if lead_source_system indicates this is our own lead
    const sourceSystem = hubspotContact.properties?.lead_source_system;
    if (sourceSystem === 'jazzaam') {
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
    const existingLead = await Lead.findOne({
      $or: [
        { email: email },
        { crmId: contactId }
      ]
    });
    
    if (existingLead) {
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
      crmMetadata: {
        sourceSystem: 'hubspot',
        lastSyncDirection: 'from_crm',
        lastSyncedAt: new Date(),
        syncVersion: 1
      }
    });
    
    console.log(`✅ Lead created: ${newLead._id}`);
    return { success: true, leadId: newLead._id, action: 'created' };
    
  } catch (error) {
    console.error(`❌ Failed to handle contact creation:`, error);
    await crmIntegration.addError('webhook', error.message);
    throw error;
  }
};

/**
 * Handle contact update in HubSpot
 */
const handleContactUpdate = async (contactId, propertyName, crmIntegration) => {
  try {
    // Fetch updated contact
    const crmApi = getCrmApi('hubspot');
    const accessToken = crmIntegration.tokens.accessToken;
    
    const hubspotContact = await crmApi.getContact(accessToken, contactId);
    
    // Check source system
    const sourceSystem = hubspotContact.properties?.lead_source_system;
    if (sourceSystem === 'jazzaam') {
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
    if (!lead.shouldSyncFromCrm(hubspotContact)) {
      return { skipped: true, reason: 'recent_sync' };
    }
    
    // Update lead
    return await updateLeadFromHubSpot(lead, hubspotContact, crmIntegration);
    
  } catch (error) {
    console.error(`Failed to handle contact update:`, error);
    await crmIntegration.addError('webhook', error.message);
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
      // Option 1: Delete lead
      // await lead.remove();
      
      // Option 2: Mark as deleted (safer)
      lead.crmSyncStatus = 'not_synced';
      lead.crmId = null;
      await lead.save();
      
      return { success: true, action: 'unlinked' };
    }
    
    return { skipped: true, reason: 'not_found' };
    
  } catch (error) {
    console.error(`Failed to handle contact deletion:`, error);
    throw error;
  }
};

/**
 * Update existing lead with HubSpot data
 */
const updateLeadFromHubSpot = async (lead, hubspotContact, crmIntegration) => {
  const updates = mapHubSpotContactToLead(hubspotContact, crmIntegration);
  
  // Conflict resolution: HubSpot wins (for bidirectional sync)
  Object.assign(lead, updates);
  
  lead.crmMetadata = {
    ...lead.crmMetadata,
    lastSyncDirection: 'from_crm',
    lastSyncedAt: new Date(),
    syncVersion: (lead.crmMetadata?.syncVersion || 0) + 1,
    lastModifiedInCrm: new Date(hubspotContact.updatedAt)
  };
  
  lead.crmSyncStatus = 'synced';
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
    fullName: `${props.firstname || ''} ${props.lastname || ''}`.trim() || 'Unknown',
    email: props.email || '',
    phone: props.phone || '',
    company: props.company || '',
    jobTitle: props.jobtitle || '',
    location: props.city || props.state || '',
    country: props.country || '',
    source: 'HubSpot CRM',
    platform: 'other',
    platformUrl: `https://app.hubspot.com/contacts/${crmIntegration.accountInfo?.accountId}/contact/${hubspotContact.id}`,
    profileUrl: `https://app.hubspot.com/contacts/${crmIntegration.accountInfo?.accountId}/contact/${hubspotContact.id}`,
    status: props.hs_lead_status?.toLowerCase() || 'new'
  };
};

/**
 * Verify HubSpot webhook signature
 */
export const verifyHubSpotSignature = (requestBody, signature, clientSecret) => {
  const hash = crypto
    .createHmac('sha256', clientSecret)
    .update(requestBody)
    .digest('hex');
    
  return hash === signature;
};

/**
 * Register webhook with HubSpot
 */
export const registerHubSpotWebhook = async (accessToken, webhookUrl, events) => {
  const url = 'https://api.hubapi.com/webhooks/v3/subscriptions';
  
  const subscriptions = [];
  for (const event of events) {
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
      throw new Error(`Failed to register webhook: ${response.statusText}`);
    }
    
    const data = await response.json();
    subscriptions.push(data);
  }
  
  return subscriptions;
};
```

#### File 2: `src/controllers/webhook.controller.js`
Create webhook endpoint controller:

```javascript
import { asyncHandler } from "../utils/asyncHandler.js";
import { CrmIntegration } from "../models/crmIntegration.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { 
  processHubSpotWebhook, 
  verifyHubSpotSignature 
} from "../services/crm/webhook.service.js";

/**
 * HubSpot webhook endpoint
 * @route POST /api/v1/webhooks/hubspot
 */
export const handleHubSpotWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-hubspot-signature'];
  const events = req.body;
  
  console.log('📥 Received HubSpot webhook:', {
    eventCount: events.length,
    hasSignature: !!signature
  });
  
  // Verify webhook signature (optional but recommended)
  // const rawBody = req.rawBody; // Need rawBody middleware
  // if (signature && !verifyHubSpotSignature(rawBody, signature, process.env.HUBSPOT_CLIENT_SECRET)) {
  //   throw new ApiError(401, 'Invalid webhook signature');
  // }
  
  // Process each event
  const results = [];
  
  for (const event of events) {
    try {
      // Find CRM integration for this event
      // Note: HubSpot doesn't send app/company info in webhook
      // You need to identify which company this webhook belongs to
      
      // Strategy 1: Single HubSpot account (simplest)
      const crmIntegration = await CrmIntegration.findOne({
        provider: 'hubspot',
        status: 'active',
        'webhooks.enabled': true
      });
      
      if (!crmIntegration) {
        console.warn('No active HubSpot integration with webhooks enabled');
        continue;
      }
      
      const result = await processHubSpotWebhook(event, crmIntegration);
      results.push({ event, result });
      
    } catch (error) {
      console.error('Error processing webhook event:', error);
      results.push({ 
        event, 
        error: error.message 
      });
    }
  }
  
  // Always return 200 to acknowledge receipt
  return res.status(200).json(
    new ApiResponse(200, results, 'Webhook processed')
  );
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
  
  if (crmIntegration.provider !== 'hubspot') {
    throw new ApiError(400, 'Webhooks only supported for HubSpot');
  }
  
  // Register webhook with HubSpot
  const events = ['contact.creation', 'contact.propertyChange'];
  const subscriptions = await registerHubSpotWebhook(
    crmIntegration.tokens.accessToken,
    webhookUrl || `${process.env.API_URL}/api/v1/webhooks/hubspot`,
    events
  );
  
  // Update integration
  crmIntegration.webhooks = {
    enabled: true,
    subscriptionId: subscriptions[0].id,
    events: events,
    lastReceivedAt: null,
    totalReceived: 0
  };
  
  await crmIntegration.save();
  
  return res.status(200).json(
    new ApiResponse(200, subscriptions, 'Webhooks enabled successfully')
  );
});
```

#### File 3: `src/routes/webhook.routes.js`
Create webhook routes:

```javascript
import { Router } from "express";
import { handleHubSpotWebhook } from "../controllers/webhook.controller.js";

const router = Router();

// POST /api/v1/webhooks/hubspot (No auth - public webhook endpoint)
router.post("/hubspot", handleHubSpotWebhook);

export default router;
```

---

### 5. Update Existing Files

#### Update `src/services/crm/api.service.js`
Add method to get single contact:

```javascript
// Add to hubspotApi object
async getContact(accessToken, contactId) {
  const url = `${CRM_API_URLS.hubspot.base}${CRM_API_URLS.hubspot.contacts}/${contactId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch contact: ${response.statusText}`);
  }
  
  return await response.json();
}
```

#### Update `src/services/crm/sync.service.js`
Modify `syncLeadToCrm` to set lead_source_system:

```javascript
// In syncLeadToCrm function, update the HubSpot case:
case "hubspot":
  // Add lead_source_system to prevent loop
  mappedData.properties = {
    ...mappedData.properties,
    lead_source_system: 'jazzaam'  // Mark as our lead
  };
  
  result = await crmApi.createContact(accessToken, mappedData);
  
  // Update lead metadata
  lead.crmMetadata = {
    sourceSystem: 'jazzaam',
    lastSyncDirection: 'to_crm',
    lastSyncedAt: new Date()
  };
  break;
```

#### Update `src/app.js`
Register webhook routes:

```javascript
import webhookRoutes from "./routes/webhook.routes.js";

// Add webhook routes (BEFORE other middleware that might interfere)
app.use("/api/v1/webhooks", webhookRoutes);
```

---

### 6. Environment Variables

Add to `.env`:

```env
# HubSpot Webhook Configuration
HUBSPOT_WEBHOOK_SECRET=your_webhook_secret_here
WEBHOOK_URL=https://yourdomain.com/api/v1/webhooks/hubspot

# API URL for webhook registration
API_URL=https://yourdomain.com
```

---

## 🔄 Complete Bidirectional Flow

### Flow A: Your Platform → HubSpot (Already Working)
```
1. Lead created in your platform (via form submission)
2. Auto-sync triggered (if enabled)
3. Create contact in HubSpot with lead_source_system = "jazzaam"
4. Store HubSpot contact ID in lead.crmId
5. Mark lead.crmSyncStatus = "synced"
```

### Flow B: HubSpot → Your Platform (New Implementation)
```
1. Contact created/updated in HubSpot (any source)
2. HubSpot fires webhook to your endpoint
3. Your webhook handler receives event
4. Check lead_source_system property:
   - If "jazzaam" → SKIP (loop prevention)
   - If "hubspot" or null → PROCEED
5. Fetch full contact details via API
6. Check if lead exists (by email or crmId)
7. If exists → Update lead
8. If not → Create new lead
9. Set lead.crmMetadata.sourceSystem = "hubspot"
```

---

## 🛡️ Loop Prevention Strategy

### Scenario: Lead Created in Your Platform
```javascript
Your Platform (Lead Created)
  ↓ [Sync TO HubSpot]
HubSpot (Contact Created with lead_source_system="jazzaam")
  ↓ [Webhook Fires: contact.creation]
Your Platform Webhook Handler
  ↓ [Check: lead_source_system === "jazzaam"]
  ✅ SKIP SYNC (prevents loop)
```

### Scenario: Contact Created in HubSpot
```javascript
HubSpot (Contact Created, lead_source_system=null or "hubspot")
  ↓ [Webhook Fires: contact.creation]
Your Platform Webhook Handler
  ↓ [Check: lead_source_system !== "jazzaam"]
  ↓ [Create Lead with sourceSystem="hubspot"]
Your Platform (Lead Created)
  ↓ [Auto-sync disabled for leads from CRM OR check sourceSystem]
  ✅ NO SYNC BACK (prevents loop)
```

---

## 🚀 Implementation Steps (Priority Order)

### Phase 1: Foundation (Week 1)
1. ✅ Update Lead Model with crmMetadata fields
2. ✅ Update CRM Integration Model with webhook config
3. ✅ Create webhook.service.js
4. ✅ Test loop prevention logic locally

### Phase 2: Webhook Infrastructure (Week 1-2)
5. ✅ Create webhook.controller.js
6. ✅ Create webhook.routes.js
7. ✅ Update app.js to register routes
8. ✅ Add webhook signature verification
9. ✅ Deploy to staging with public URL

### Phase 3: HubSpot Configuration (Week 2)
10. ✅ Create custom property in HubSpot (lead_source_system)
11. ✅ Register webhook subscriptions via API or UI
12. ✅ Test webhook delivery with ngrok/staging

### Phase 4: Integration Updates (Week 2-3)
13. ✅ Update sync.service.js to set lead_source_system
14. ✅ Add getContact method to api.service.js
15. ✅ Update existing sync logic to respect sourceSystem
16. ✅ Add UI toggle for bidirectional sync

### Phase 5: Testing & Refinement (Week 3-4)
17. ✅ Test complete bidirectional flow
18. ✅ Test loop prevention scenarios
19. ✅ Add logging and monitoring
20. ✅ Handle edge cases (duplicate emails, conflicts)
21. ✅ Performance testing (webhook queue)

### Phase 6: Production Rollout (Week 4)
22. ✅ Deploy to production
23. ✅ Enable webhooks for pilot customers
24. ✅ Monitor webhook delivery and errors
25. ✅ Gradual rollout to all customers

---

## ⚠️ Important Considerations

### Rate Limits
- **HubSpot API**: 100 requests per 10 seconds (Professional)
- **Webhooks**: No rate limit, but batch processing recommended
- **Solution**: Use queue system (Bull/BullMQ) for webhook processing

### Multi-Tenant Architecture
Your app is multi-tenant. For webhooks:
- **Problem**: HubSpot webhook doesn't include company/tenant info
- **Solutions**:
  1. **Recommended**: Use separate webhook URL per tenant
     - `https://yourdomain.com/api/v1/webhooks/hubspot/:companyId`
  2. Match contact email to lead in all tenant databases (slow)
  3. Single HubSpot account = single company (simplest)

### Conflict Resolution
When lead updated in both systems simultaneously:
```javascript
// Strategy 1: Last write wins
if (hubspotUpdatedAt > leadUpdatedAt) {
  updateFromHubSpot();
}

// Strategy 2: CRM always wins (recommended for sales teams)
updateFromHubSpot(); // Always take HubSpot data

// Strategy 3: Merge changes
mergeChanges(leadData, hubspotData);
```

### Data Privacy & Compliance
- ✅ Webhook endpoint must use HTTPS
- ✅ Verify webhook signatures
- ✅ Log all sync operations for audit
- ✅ Handle GDPR deletion requests

---

## 📊 Monitoring & Observability

### Metrics to Track
```javascript
// Add to CRM Integration stats
{
  webhooks: {
    totalReceived: Number,
    totalProcessed: Number,
    totalFailed: Number,
    totalSkipped: Number,
    lastReceivedAt: Date,
    avgProcessingTime: Number
  },
  syncMetrics: {
    toHubspot: { success: 0, failed: 0 },
    fromHubspot: { success: 0, failed: 0 }
  }
}
```

### Logging
```javascript
console.log('📥 Webhook received:', event.subscriptionType);
console.log('✅ Lead synced:', leadId);
console.log('⏭️  Skipped (loop prevention):', contactId);
console.log('❌ Sync failed:', error);
```

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Loop prevention logic
- [ ] Field mapping functions
- [ ] Webhook signature verification
- [ ] Conflict resolution

### Integration Tests
- [ ] Webhook endpoint responds with 200
- [ ] Contact creation creates lead
- [ ] Contact update updates lead
- [ ] Duplicate detection works
- [ ] Source system tracking works

### End-to-End Tests
- [ ] Create lead in platform → appears in HubSpot
- [ ] Create contact in HubSpot → appears in platform
- [ ] Update in HubSpot → syncs to platform
- [ ] No infinite loops occur
- [ ] Token refresh works during webhook

---

## 📚 Additional Resources

### HubSpot Documentation
- [Webhooks API](https://developers.hubspot.com/docs/api/webhooks)
- [CRM API v3](https://developers.hubspot.com/docs/api/crm/contacts)
- [Custom Properties](https://developers.hubspot.com/docs/api/crm/properties)
- [Private Apps](https://developers.hubspot.com/docs/api/private-apps)

### Best Practices
- Use async processing for webhooks (queue system)
- Implement retry logic with exponential backoff
- Log all webhook events for debugging
- Use idempotency keys for safety
- Monitor webhook health regularly

---

## 🎯 Your Next Steps

1. **Immediate Actions**:
   - Create custom property in HubSpot UI
   - Update Lead model with new fields
   - Create webhook.service.js file

2. **This Week**:
   - Implement webhook controller and routes
   - Deploy to staging environment
   - Register webhook with HubSpot

3. **Next Week**:
   - Test complete bidirectional flow
   - Update sync logic with loop prevention
   - Monitor and refine

---

## ✅ Summary

**What you need to build**:
1. ✅ Webhook service (new file)
2. ✅ Webhook controller (new file)
3. ✅ Webhook routes (new file)
4. ✅ Update Lead model (add crmMetadata)
5. ✅ Update sync.service.js (add lead_source_system)
6. ✅ Add getContact to api.service.js
7. ✅ Create custom property in HubSpot
8. ✅ Register webhooks with HubSpot

**Backend stack**: Node.js (Express) ✅  
**Multi-tenant**: Yes (separate databases) ✅  
**Volume**: Depends on webhook rate  
**Architecture**: Already solid, just needs webhook layer

This is a **well-supported, production-ready pattern**. HubSpot fully supports this use case!
