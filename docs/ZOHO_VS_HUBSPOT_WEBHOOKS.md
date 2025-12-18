# Zoho vs HubSpot Webhook Comparison

## Quick Overview

| Feature | HubSpot | Zoho |
|---------|---------|------|
| **Webhook Registration** | Automatic via API | Manual via UI |
| **Authentication** | Validated during subscription | Custom token in header |
| **Signature Verification** | Not used (v3) | Token-based |
| **Event Format** | Subscription-based | Operation-based |
| **Real-time** | Yes (instant) | Yes (instant) |
| **Custom Field API Name** | `lead_source_system` | `Lead_Source_System` |
| **Custom Field Values** | Same: Jazzaam, HubSpot, Manual | Same: Jazzaam, Zoho, Manual |

---

## Setup Comparison

### HubSpot Setup

```javascript
// ✅ Automatic via API
POST /api/v1/crm-integration/:id/enable-webhooks
{
  "webhookUrl": "https://domain.com/api/v1/webhooks/hubspot"
}

// Platform automatically:
// 1. Registers webhook subscriptions with HubSpot API
// 2. Subscribes to contact.creation, contact.propertyChange
// 3. Validates endpoint during subscription
// 4. No additional manual steps needed
```

**Custom Field:**
- Field Name: `Lead Source System`
- API Name: `lead_source_system` (lowercase with underscores)
- Type: Dropdown/Select
- Values: `Jazzaam`, `HubSpot`, `Manual`

### Zoho Setup

```javascript
// ⚠️ Semi-automatic (manual configuration required)
POST /api/v1/crm-integration/:id/enable-webhooks
{
  "webhookUrl": "https://domain.com/api/v1/webhooks/zoho"
}

// Platform generates:
// 1. Webhook URL
// 2. Webhook security token
// 3. Instructions for manual setup

// You must manually:
// 1. Go to Zoho CRM → Settings → Developer Space → Webhooks
// 2. Create webhook with provided URL and token
// 3. Select events: Leads.create, Leads.edit, Leads.delete
```

**Custom Field:**
- Field Name: `Lead Source System`
- API Name: `Lead_Source_System` (Pascal case with underscores)
- Type: Pick List
- Values: `Jazzaam`, `Zoho`, `Manual`

---

## Webhook Payload Comparison

### HubSpot Webhook Payload

```json
[
  {
    "objectId": 12345,
    "subscriptionType": "contact.creation",
    "portalId": 987654,
    "occurredAt": 1639584000000,
    "eventId": 123,
    "subscriptionId": 456
  }
]
```

**Processing:**
1. Extract `objectId` (contact ID)
2. Fetch full contact data via API: `GET /crm/v3/objects/contacts/{objectId}`
3. Check `properties.lead_source_system`
4. If `'Jazzaam'` → Skip
5. If `'HubSpot'` or `'Manual'` → Import

### Zoho Webhook Payload

```json
{
  "operation": "insert",
  "module": "Leads",
  "ids": ["1234567890123456789"],
  "token": "YOUR_WEBHOOK_TOKEN"
}
```

**Processing:**
1. Validate `token` matches stored webhookToken
2. Extract `ids` array (record IDs)
3. Fetch full record data via API: `GET /crm/v3/Leads/{id}`
4. Check `Lead_Source_System` field
5. If `'Jazzaam'` → Skip
6. If `'Zoho'` or `'Manual'` → Import

---

## Event Types

### HubSpot Events

| Event Type | When Fired | Action |
|------------|------------|--------|
| `contact.creation` | New contact created | Import to platform |
| `contact.propertyChange` | Contact field updated | Update in platform |
| `contact.deletion` | Contact deleted | Unlink from platform |

**Subscribe to specific events during registration.**

### Zoho Events

| Operation | When Fired | Action |
|-----------|------------|--------|
| `insert` / `create` | New record created | Import to platform |
| `update` / `edit` | Record field updated | Update in platform |
| `delete` | Record deleted | Unlink from platform |

**Configure which modules and operations trigger webhooks in Zoho UI.**

---

## Authentication & Security

### HubSpot

```javascript
// No signature verification in v3
// HubSpot validates endpoint during subscription setup
// Endpoint must return 200 OK to validation request

// Headers received:
{
  "Content-Type": "application/json",
  "User-Agent": "HubSpot Webhooks"
}
```

**Security:**
- ✅ Endpoint validated during subscription
- ✅ Webhook subscriptions tied to OAuth app
- ❌ No signature verification in v3 (was in v2)
- ✅ Can validate portalId if needed

### Zoho

```javascript
// Token-based authentication
// You generate token, include in webhook config

// Headers you send to Zoho config:
{
  "X-Webhook-Token": "YOUR_GENERATED_TOKEN"
}

// Zoho includes token in payload:
{
  "token": "YOUR_GENERATED_TOKEN",
  "operation": "insert",
  "module": "Leads",
  "ids": ["123"]
}
```

**Security:**
- ✅ Token validation on every request
- ✅ Token stored securely in database
- ✅ Can rotate token anytime
- ✅ Custom header for additional security

---

## Code Implementation

### HubSpot Webhook Handler

```javascript
// src/controllers/webhook.controller.js

export const handleHubSpotWebhook = asyncHandler(async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  
  // No signature verification needed for v3
  
  for (const event of events) {
    // Find CRM integration
    const crmIntegration = await CrmIntegration.findOne({
      provider: 'hubspot',
      status: 'active'
    });
    
    // Process webhook
    const result = await processWebhook('hubspot', event, crmIntegration);
  }
  
  // Always return 200
  return res.status(200).json({ success: true });
});
```

### Zoho Webhook Handler

```javascript
// src/controllers/webhook.controller.js

export const handleZohoWebhook = asyncHandler(async (req, res) => {
  const event = req.body;
  
  // Find CRM integration
  const crmIntegration = await CrmIntegration.findOne({
    provider: 'zoho',
    status: 'active'
  });
  
  // Validate token
  if (crmIntegration.webhooks?.webhookToken && 
      event.token !== crmIntegration.webhooks.webhookToken) {
    console.warn('Invalid webhook token');
    return res.status(200).json({ 
      success: true, 
      skipped: true, 
      reason: 'invalid_token' 
    });
  }
  
  // Process webhook
  const result = await processWebhook('zoho', event, crmIntegration);
  
  // Always return 200
  return res.status(200).json({ success: true });
});
```

---

## Duplicate Prevention Logic

### Both Use Same Strategy

```javascript
// When syncing FROM platform TO CRM
// Set custom field to 'Jazzaam'

// HubSpot:
mappedData.customFields = {
  lead_source_system: 'Jazzaam'
};

// Zoho:
mappedData.customFields = {
  Lead_Source_System: 'Jazzaam'
};
```

```javascript
// When webhook fires (CRM → Platform)
// Check custom field value

// HubSpot:
const sourceSystem = contact.properties.lead_source_system;
if (sourceSystem === 'Jazzaam') {
  console.log('⏭️ Skipping - originated from platform');
  return { skipped: true };
}

// Zoho:
const sourceSystem = record.Lead_Source_System;
if (sourceSystem === 'Jazzaam') {
  console.log('⏭️ Skipping - originated from platform');
  return { skipped: true };
}
```

---

## Testing

### Test HubSpot Webhook

```bash
# 1. Create lead in platform
POST /api/v1/leads
{
  "name": "Test User",
  "email": "test@example.com"
}

# 2. Sync to HubSpot
POST /api/v1/crm-integration/sync-leads
{
  "leadIds": ["LEAD_ID"]
}

# 3. Verify in HubSpot:
# - Contact exists
# - lead_source_system = 'Jazzaam' ✅

# 4. Update contact in HubSpot UI
# - Change phone number
# - lead_source_system still = 'Jazzaam'

# 5. Webhook fires → Platform skips update ✅
# Logs: "⏭️ Skipping - originated from platform"
```

### Test Zoho Webhook

```bash
# 1. Create lead in platform
POST /api/v1/leads
{
  "name": "Test User",
  "email": "test@example.com"
}

# 2. Sync to Zoho
POST /api/v1/crm-integration/sync-leads
{
  "leadIds": ["LEAD_ID"]
}

# 3. Verify in Zoho CRM:
# - Lead exists
# - Lead_Source_System = 'Jazzaam' ✅

# 4. Update lead in Zoho UI
# - Change phone number
# - Lead_Source_System still = 'Jazzaam'

# 5. Webhook fires → Platform skips update ✅
# Logs: "⏭️ Skipping - originated from platform"
```

---

## Troubleshooting

### HubSpot Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook not firing | Subscription not created | Check HubSpot webhook subscriptions API |
| 400 during subscription | Invalid webhook URL | Ensure URL is publicly accessible |
| Duplicates creating | Custom field not set | Verify `lead_source_system` is set during sync |
| Field not found | Custom property not created | Create `lead_source_system` property in HubSpot |

### Zoho Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook not firing | Not configured in Zoho | Go to Settings → Webhooks in Zoho UI |
| Invalid token | Token mismatch | Verify token in Zoho matches database |
| Duplicates creating | Custom field not set | Verify `Lead_Source_System` is set during sync |
| Field not found | Custom field not created | Create `Lead_Source_System` field in Zoho |

---

## Performance Considerations

### HubSpot

- **Rate Limits**: 100 requests/10 seconds per OAuth app
- **Batch Operations**: Can receive multiple events in one webhook
- **Retry Logic**: HubSpot retries failed webhooks (3 attempts)
- **Timeout**: Expects response within 5 seconds

### Zoho

- **Rate Limits**: 
  - Free: 1,000 API calls/day
  - Standard: 10,000 API calls/day
  - Professional: 25,000 API calls/day
- **Batch Operations**: One record per webhook (use `ids` array for multiple)
- **Retry Logic**: Zoho retries failed webhooks (configurable)
- **Timeout**: Expects response within 10 seconds

---

## Best Practices

### For Both CRMs

1. **Always return 200 OK** - Even if processing fails
2. **Log all webhook events** - For debugging and audit
3. **Validate data** - Check required fields before importing
4. **Handle duplicates** - Use custom field consistently
5. **Monitor webhook health** - Track success/failure rates
6. **Implement retry logic** - For failed API calls
7. **Rate limit protection** - Queue webhook processing if needed
8. **Error logging** - Store errors in CRM integration document

### HubSpot Specific

- Subscribe to minimal events needed
- Use property filters if available
- Cache contact data when possible
- Batch process multiple events

### Zoho Specific

- Minimize API calls (each webhook = 1 API call to fetch data)
- Use webhook token rotation
- Configure only needed modules
- Consider webhook quotas in plan

---

## Migration Path

### From HubSpot to Zoho

1. **Export HubSpot data**
2. **Import to Zoho** with `Lead_Source_System = 'Zoho'`
3. **Set up Zoho webhooks**
4. **Disable HubSpot webhooks**
5. **Update platform CRM integration to Zoho**

### From Zoho to HubSpot

1. **Export Zoho data**
2. **Import to HubSpot** with `lead_source_system = 'HubSpot'`
3. **Set up HubSpot webhooks** (automatic)
4. **Disable Zoho webhooks**
5. **Update platform CRM integration to HubSpot**

---

## Summary

Both HubSpot and Zoho support real-time bidirectional lead syncing with duplicate prevention. Key differences:

- **HubSpot**: Automatic webhook registration, no signature verification
- **Zoho**: Manual webhook configuration, token-based authentication
- **Both**: Use custom field strategy for duplicate prevention
- **Both**: Support create, update, delete operations
- **Both**: Require publicly accessible webhook endpoint

Choose based on your CRM preference - both implementations are production-ready!
