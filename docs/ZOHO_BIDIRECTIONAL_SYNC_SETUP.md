# Zoho CRM Bidirectional Lead Sync Setup Guide

## Overview

This guide explains how to set up real-time bidirectional lead syncing between your platform and Zoho CRM with intelligent duplicate prevention.

## Prerequisites

- ✅ Zoho CRM account with admin access
- ✅ Zoho OAuth connection configured in your platform
- ✅ Custom field `Lead_Source_System` created in Zoho (see below)
- ✅ Public webhook endpoint accessible by Zoho

## Architecture

### Duplicate Prevention Strategy

We use a custom field `Lead_Source_System` in Zoho CRM to track where leads originate:

- **`Jazzaam`** - Lead created in your platform and synced to Zoho
- **`Zoho`** - Lead created directly in Zoho CRM  
- **`Manual`** - Lead manually created by user in Zoho

**How it prevents duplicates:**

1. When your platform creates a lead and syncs to Zoho → Sets `Lead_Source_System = 'Jazzaam'`
2. When Zoho webhook fires for that lead → Platform checks `Lead_Source_System`
3. If value is `'Jazzaam'` → **Skip import** (prevents duplicate)
4. If value is `'Zoho'` or `'Manual'` → **Import to platform**

### Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    BIDIRECTIONAL SYNC FLOW                       │
└─────────────────────────────────────────────────────────────────┘

Platform → Zoho (Outbound):
────────────────────────────
1. Lead created in platform
2. Sync to Zoho API
3. Set Lead_Source_System = 'Jazzaam'
4. Store CRM ID in platform

Zoho → Platform (Inbound via Webhook):
──────────────────────────────────────
1. Lead created/updated in Zoho
2. Webhook fires to platform
3. Platform fetches full lead data
4. Check Lead_Source_System field
5. If 'Jazzaam' → Skip (already in platform)
6. If 'Zoho'/'Manual' → Import to platform
7. Store CRM ID for future sync
```

## Step 1: Create Custom Field in Zoho

### Option A: Via Zoho UI

1. **Navigate to Settings**
   - Go to Zoho CRM
   - Click ⚙️ **Settings** (top right)

2. **Access Customization**
   - Go to **Customization** → **Modules and Fields**
   - Select **Leads** module

3. **Create Custom Field**
   - Click **+ New Custom Field**
   - **Field Label**: `Lead Source System`
   - **Field Type**: `Pick List` (Dropdown)
   - **API Name**: `Lead_Source_System` (important!)
   - **Options**: Add these exact values:
     ```
     Jazzaam
     Zoho
     Manual
     ```
   - **Default Value**: `Manual`
   - **Required**: No (Optional)
   - Click **Save**

4. **Repeat for Contacts Module** (Optional)
   - Go to **Contacts** module
   - Create identical field `Contact_Source_System`
   - Same options: `Jazzaam`, `Zoho`, `Manual`

### Option B: Via Zoho API (Advanced)

```javascript
// Create custom field via API
const fieldConfig = {
  api_name: "Lead_Source_System",
  display_label: "Lead Source System",
  data_type: "picklist",
  pick_list_values: [
    { display_value: "Jazzaam", actual_value: "Jazzaam" },
    { display_value: "Zoho", actual_value: "Zoho" },
    { display_value: "Manual", actual_value: "Manual" }
  ],
  default_value: "Manual"
};

// POST to: https://www.zohoapis.com/crm/v3/settings/fields?module=Leads
```

### Verify Custom Field

1. Open any Lead record in Zoho
2. You should see **"Lead Source System"** field
3. Test selecting values from dropdown

---

## Step 2: Connect Zoho CRM to Platform

### Connect via Platform UI

1. **Login to your platform**
2. **Navigate to Settings → Integrations → CRM**
3. **Click "Connect Zoho CRM"**
4. **Authorize** - Login to Zoho and grant permissions
5. **Verify connection** - You should see "Connected" status

### Verify OAuth Connection

Check that Zoho OAuth is working:

```bash
# Test connection via API
curl -X GET http://localhost:5000/api/v1/crm-integration/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-company-id: YOUR_COMPANY_ID"
```

Expected response:
```json
{
  "success": true,
  "provider": "zoho",
  "connected": true,
  "userInfo": {
    "id": "123456",
    "name": "Your Name",
    "email": "you@example.com"
  }
}
```

---

## Step 3: Enable Webhook in Platform

### Generate Webhook Configuration

1. **Via API:**

```bash
POST http://localhost:5000/api/v1/crm-integration/:integrationId/enable-webhooks
Headers:
  Authorization: Bearer YOUR_TOKEN
  x-company-id: YOUR_COMPANY_ID
Body:
{
  "webhookUrl": "https://your-domain.com/api/v1/webhooks/zoho"
}
```

2. **Response will include:**

```json
{
  "success": true,
  "data": {
    "webhookUrl": "https://your-domain.com/api/v1/webhooks/zoho",
    "webhookToken": "abc123def456...",
    "events": [
      "Leads.create",
      "Leads.edit", 
      "Leads.delete",
      "Contacts.create",
      "Contacts.edit",
      "Contacts.delete"
    ],
    "instructions": "Configure this webhook URL and token in Zoho CRM Settings..."
  },
  "message": "Webhook configuration generated. Please configure in Zoho CRM manually."
}
```

3. **Save the `webhookToken`** - You'll need it for Step 4

---

## Step 4: Configure Webhook in Zoho CRM

### Navigate to Webhooks

1. **Go to Zoho CRM**
2. **Click ⚙️ Settings** (top right)
3. **Navigate**: **Developer Space** → **Webhooks**

### Create New Webhook

1. **Click "+ Configure Webhook"**

2. **Webhook Configuration:**

   | Field | Value |
   |-------|-------|
   | **Module** | `Leads` |
   | **URL to Notify** | `https://your-domain.com/api/v1/webhooks/zoho` |
   | **Method** | `POST` |
   | **Content Type** | `application/json` |

3. **Authentication:**
   - **Type**: `Custom Header`
   - **Header Name**: `X-Webhook-Token`
   - **Header Value**: Your webhook token from Step 3

4. **Triggers:** Select these events:
   - ✅ **Record Created** (`Leads.create`)
   - ✅ **Record Updated** (`Leads.edit`)
   - ✅ **Record Deleted** (`Leads.delete`)

5. **Request Format:**

```json
{
  "operation": "${operation}",
  "module": "${module}",
  "ids": ["${record_id}"],
  "token": "YOUR_WEBHOOK_TOKEN_HERE"
}
```

6. **Click "Save"**

### Repeat for Contacts (Optional)

If you want to sync Contacts as well:

1. Create another webhook
2. Module: **`Contacts`**
3. Same URL and configuration
4. Events: `Contacts.create`, `Contacts.edit`, `Contacts.delete`

### Test Webhook

1. **In Zoho CRM, click "Test"** next to your webhook
2. Zoho will send a test payload to your endpoint
3. You should see **200 OK** response
4. Check platform logs for: `📥 Received Zoho webhook`

---

## Step 5: Test the Integration

### Test 1: Platform → Zoho (Outbound Sync)

1. **Create a lead in your platform:**

```bash
POST http://localhost:5000/api/v1/leads
Headers:
  Authorization: Bearer YOUR_TOKEN
  x-company-id: YOUR_COMPANY_ID
Body:
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "company": "Acme Corp",
  "jobTitle": "CEO"
}
```

2. **Sync to Zoho:**

```bash
POST http://localhost:5000/api/v1/crm-integration/sync-leads
Headers:
  Authorization: Bearer YOUR_TOKEN
  x-company-id: YOUR_COMPANY_ID
Body:
{
  "leadIds": ["LEAD_ID_FROM_STEP_1"]
}
```

3. **Verify in Zoho CRM:**
   - Open Leads module
   - Find the lead "John Doe"
   - Check **Lead Source System** = `Jazzaam` ✅
   - This is the duplicate prevention marker!

4. **Check platform logs:**

```
🚀 Syncing 1 leads to Zoho...
✅ Successfully synced lead to Zoho: john@example.com
   CRM ID: 1234567890123456789
```

### Test 2: Zoho → Platform (Webhook Import)

1. **Create a lead directly in Zoho CRM:**
   - Go to Zoho CRM Leads
   - Click "+ Create Lead"
   - Fill in details:
     - First Name: `Jane`
     - Last Name: `Smith`
     - Email: `jane@example.com`
     - Phone: `+9876543210`
     - Company: `Tech Inc`
   - **Lead Source System**: Leave as `Manual` or select `Zoho`
   - Click **Save**

2. **Webhook fires automatically** - Check platform logs:

```
📥 Received Zoho webhook: { operation: 'insert', module: 'Leads', ids: ['123...'] }
🔔 Processing Zoho webhook: {...}
📝 Processing new Zoho Leads record: 1234567890123456789
✅ Created new lead from Zoho: 507f1f77bcf86cd799439011
```

3. **Verify in platform:**

```bash
GET http://localhost:5000/api/v1/leads
Headers:
  Authorization: Bearer YOUR_TOKEN
  x-company-id: YOUR_COMPANY_ID
```

You should see Jane Smith with:
- `source: "import"`
- `sourceSystem: "Zoho"`
- `crmMetadata.crmId: "1234567890123456789"`

### Test 3: Duplicate Prevention

1. **The lead "John Doe" is already in Zoho** (from Test 1)
2. **Try updating it in Zoho:**
   - Open John Doe in Zoho
   - Change phone number
   - **IMPORTANT**: `Lead Source System` is still `Jazzaam`
   - Save

3. **Webhook fires** - Check platform logs:

```
📥 Received Zoho webhook: { operation: 'edit', module: 'Leads', ids: ['123...'] }
🔔 Processing Zoho webhook: {...}
🔄 Processing updated Zoho Leads record: 1234567890123456789
⏭️ Skipping record 1234567890123456789 - originated from our platform
```

4. **✅ SUCCESS!** - The duplicate was **prevented** because `Lead_Source_System = 'Jazzaam'`

---

## Troubleshooting

### Issue: Webhook Not Firing

**Symptoms:**
- Lead created in Zoho
- No logs in platform
- No webhook events received

**Solutions:**

1. **Check webhook configuration in Zoho:**
   - Settings → Developer Space → Webhooks
   - Verify URL is correct and publicly accessible
   - Test the webhook from Zoho UI

2. **Check firewall/ngrok:**
   ```bash
   # If testing locally, use ngrok
   ngrok http 5000
   
   # Update webhook URL in Zoho to ngrok URL:
   # https://abc123.ngrok.io/api/v1/webhooks/zoho
   ```

3. **Check platform logs:**
   ```bash
   # Look for webhook receipt
   grep "Received Zoho webhook" logs/*.log
   ```

### Issue: Invalid Webhook Token

**Symptoms:**
- Webhook fires
- Platform responds with error
- Logs show "Invalid Zoho webhook token"

**Solutions:**

1. **Verify token in Zoho webhook configuration**
   - Check X-Webhook-Token header value
   - Must match token from Step 3

2. **Check CRM integration document:**
   ```javascript
   await CrmIntegration.findOne({ provider: 'zoho' })
   // Check: crmIntegration.webhooks.webhookToken
   ```

3. **Regenerate token if needed:**
   - Call enable-webhooks API again
   - Update token in Zoho webhook configuration

### Issue: Leads Not Importing

**Symptoms:**
- Webhook fires successfully
- Logs show "Skipping record"
- Lead not created in platform

**Check 1: Lead Source System Field**

```javascript
// Webhook is skipping because Lead_Source_System = 'Jazzaam'
⏭️ Skipping record - originated from our platform
```

**Solution:**
- In Zoho, check the lead's **Lead Source System** field
- If it's `Jazzaam`, the lead was synced FROM your platform
- This is correct behavior (prevents duplicates)
- Create a NEW lead with `Lead Source System = 'Manual'` or `'Zoho'`

**Check 2: Email Validation**

```javascript
// Lead model requires valid email
ValidationError: email: Path `email` is required
```

**Solution:**
- Ensure leads in Zoho have valid email addresses
- Check Zoho webhook payload includes email field

**Check 3: Module Name**

```javascript
// Webhook only processes Leads and Contacts
⏭️ Skipping non-lead/contact module: Accounts
```

**Solution:**
- Webhook is configured correctly
- It only processes Leads and Contacts, not other modules

### Issue: Duplicates Still Creating

**Symptoms:**
- Same lead exists in both platform and Zoho
- Both have different IDs

**Check:**

1. **Custom field exists:**
   ```bash
   # In Zoho, check if Lead_Source_System field exists
   # API Name must be exactly: Lead_Source_System
   ```

2. **Field is being set:**
   ```javascript
   // Check sync service logs
   customFields.Lead_Source_System = 'Jazzaam'
   ```

3. **Field value is correct:**
   ```javascript
   // In webhook service, check what value is read
   const sourceSystem = record.Lead_Source_System
   // Should be 'Jazzaam', 'Zoho', or 'Manual'
   ```

4. **Case sensitivity:**
   ```javascript
   // Values are case-sensitive!
   'Jazzaam' ✅
   'jazzaam' ❌
   'JAZZAAM' ❌
   ```

### Issue: Webhook Validation Errors

**Symptoms:**
```javascript
ValidationError: formId: Path `formId` is required
ValidationError: sourceSystem: `zoho` is not a valid enum value
```

**Solutions:**

1. **formId is optional for CRM imports:**
   - Already fixed in lead.model.js
   - formId: { required: false }

2. **sourceSystem must be capitalized:**
   - Use `'Zoho'` not `'zoho'`
   - Enum values: ['Jazzaam', 'HubSpot', 'Salesforce', 'Zoho', 'Manual', 'Import']

3. **source must be valid enum:**
   - Use `'import'` for CRM-imported leads
   - Enum values: ['website', 'landing_page', 'form', 'import', 'manual', 'crm', 'api']

---

## Monitoring & Maintenance

### Check Webhook Status

```bash
GET http://localhost:5000/api/v1/crm-integration/:integrationId/webhook-status
Headers:
  Authorization: Bearer YOUR_TOKEN
  x-company-id: YOUR_COMPANY_ID
```

Response:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "totalReceived": 47,
    "lastReceivedAt": "2025-12-18T10:30:00.000Z",
    "events": ["Leads.create", "Leads.edit", "Leads.delete"],
    "webhookUrl": "https://your-domain.com/api/v1/webhooks/zoho"
  }
}
```

### View Webhook Logs

```bash
# Check CRM integration errors
db.crmintegrations.findOne({ provider: 'zoho' })
# Look at: errorLogs array for webhook errors
```

### Disable Webhooks

```bash
POST http://localhost:5000/api/v1/crm-integration/:integrationId/disable-webhooks
Headers:
  Authorization: Bearer YOUR_TOKEN
  x-company-id: YOUR_COMPANY_ID
```

Also disable in Zoho:
- Settings → Developer Space → Webhooks
- Toggle webhook OFF or delete

---

## API Reference

### Enable Webhooks

```http
POST /api/v1/crm-integration/:integrationId/enable-webhooks
```

**Request:**
```json
{
  "webhookUrl": "https://your-domain.com/api/v1/webhooks/zoho"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "webhookUrl": "https://your-domain.com/api/v1/webhooks/zoho",
    "webhookToken": "a1b2c3d4...",
    "events": ["Leads.create", "Leads.edit", "Leads.delete"],
    "instructions": "Configure this webhook in Zoho CRM..."
  }
}
```

### Webhook Endpoint (Called by Zoho)

```http
POST /api/v1/webhooks/zoho
```

**Headers:**
```
X-Webhook-Token: YOUR_WEBHOOK_TOKEN
Content-Type: application/json
```

**Request Body (from Zoho):**
```json
{
  "operation": "insert",
  "module": "Leads",
  "ids": ["1234567890123456789"],
  "token": "YOUR_WEBHOOK_TOKEN"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed",
  "result": {
    "success": true,
    "operation": "create",
    "processed": 1,
    "results": [
      {
        "recordId": "1234567890123456789",
        "created": true,
        "leadId": "507f1f77bcf86cd799439011"
      }
    ]
  }
}
```

---

## Security Considerations

### Webhook Token

- Store securely in database
- Don't expose in logs
- Rotate periodically
- Validate on every webhook request

### Webhook Endpoint

- No authentication required (Zoho validates via token)
- Always return 200 OK (even on errors)
- Log all webhook events for audit
- Rate limit if needed

### Data Privacy

- Only sync necessary fields
- Don't log sensitive data
- Comply with GDPR/privacy laws
- Allow users to opt-out of sync

---

## Next Steps

1. ✅ **Set up custom field** in Zoho
2. ✅ **Connect Zoho CRM** to platform
3. ✅ **Enable webhooks** via platform API
4. ✅ **Configure webhook** in Zoho CRM
5. ✅ **Test bidirectional sync**
6. ✅ **Monitor webhook logs**
7. 🔄 **Consider Salesforce** next (if needed)

---

## Additional Resources

- [Zoho CRM Webhooks Documentation](https://www.zoho.com/crm/developer/docs/api/v3/webhooks.html)
- [Zoho CRM API Reference](https://www.zoho.com/crm/developer/docs/api/v3/)
- [Custom Fields in Zoho](https://www.zoho.com/crm/developer/docs/api/v3/field-meta.html)
- Platform bidirectional sync implementation summary: `docs/BIDIRECTIONAL_SYNC_IMPLEMENTATION_SUMMARY.md`

---

## Support

If you encounter issues:

1. Check logs: `grep "webhook" logs/*.log`
2. Test webhook manually from Zoho UI
3. Verify custom field API name: `Lead_Source_System`
4. Check webhook token matches
5. Ensure URL is publicly accessible

**Need help?** Contact your system administrator or refer to the troubleshooting section above.
