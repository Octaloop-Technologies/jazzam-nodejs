# Zoho CRM Webhook Setup - Quick Checklist

Use this checklist to set up Zoho CRM bidirectional lead syncing in 15 minutes.

---

## ☑️ Pre-Setup Checklist

- [ ] Zoho CRM account with admin access
- [ ] Platform is publicly accessible (or using ngrok for testing)
- [ ] OAuth connection to Zoho CRM configured
- [ ] Node.js server running

---

## Step 1: Create Custom Field in Zoho (5 min)

### In Zoho CRM UI:

- [ ] Go to **Settings** ⚙️ → **Customization** → **Modules and Fields**
- [ ] Select **Leads** module
- [ ] Click **+ New Custom Field**
- [ ] Configure field:
  - **Field Label**: `Lead Source System`
  - **API Name**: `Lead_Source_System` ⚠️ (exact spelling)
  - **Field Type**: `Pick List`
  - **Options**: 
    - [ ] `Jazzaam`
    - [ ] `Zoho`
    - [ ] `Manual`
  - **Default Value**: `Manual`
  - **Required**: No
- [ ] Click **Save**
- [ ] **Optional**: Repeat for **Contacts** module with field `Contact_Source_System`

### Verify:

```bash
# Open any lead in Zoho CRM
# You should see "Lead Source System" field with dropdown
```

---

## Step 2: Connect Zoho to Platform (2 min)

### Via Platform:

- [ ] Login to your platform
- [ ] Go to **Settings** → **Integrations** → **CRM**
- [ ] Click **Connect Zoho CRM**
- [ ] Login to Zoho and authorize
- [ ] Verify "Connected" status appears

### Via API (Alternative):

```bash
# Navigate to OAuth URL
GET /api/v1/companies/auth/zoho
# Complete OAuth flow
```

---

## Step 3: Enable Webhook in Platform (1 min)

### Generate webhook configuration:

```bash
POST http://your-domain.com/api/v1/crm-integration/:integrationId/enable-webhooks
Headers:
  Authorization: Bearer YOUR_TOKEN
  x-company-id: YOUR_COMPANY_ID
Body:
{
  "webhookUrl": "https://your-domain.com/api/v1/webhooks/zoho"
}
```

### Save these values from response:

- [ ] **Webhook URL**: `________________________________`
- [ ] **Webhook Token**: `________________________________`

⚠️ **Important**: Keep the webhook token secure!

---

## Step 4: Configure Webhook in Zoho CRM (5 min)

### In Zoho CRM UI:

- [ ] Go to **Settings** ⚙️ → **Developer Space** → **Webhooks**
- [ ] Click **+ Configure Webhook**

### Webhook Settings:

- [ ] **Module**: `Leads`
- [ ] **URL to Notify**: Paste webhook URL from Step 3
- [ ] **Method**: `POST`
- [ ] **Content Type**: `application/json`

### Authentication:

- [ ] **Type**: `Custom Header`
- [ ] **Header Name**: `X-Webhook-Token`
- [ ] **Header Value**: Paste webhook token from Step 3

### Triggers (select all):

- [ ] ✅ **Record Created** (`Leads.create`)
- [ ] ✅ **Record Updated** (`Leads.edit`)
- [ ] ✅ **Record Deleted** (`Leads.delete`)

### Request Format:

```json
{
  "operation": "${operation}",
  "module": "${module}",
  "ids": ["${record_id}"],
  "token": "PASTE_YOUR_WEBHOOK_TOKEN_HERE"
}
```

- [ ] Replace `PASTE_YOUR_WEBHOOK_TOKEN_HERE` with your token
- [ ] Click **Save**

### Test Webhook:

- [ ] Click **Test** button next to webhook
- [ ] Verify response: **200 OK**
- [ ] Check platform logs for: `📥 Received Zoho webhook`

### Optional - Repeat for Contacts:

- [ ] Create another webhook for **Contacts** module
- [ ] Same URL and configuration
- [ ] Events: `Contacts.create`, `Contacts.edit`, `Contacts.delete`

---

## Step 5: Test the Integration (5 min)

### Test 1: Platform → Zoho (Outbound)

```bash
# 1. Create lead in platform
POST /api/v1/leads
{
  "name": "Test User",
  "email": "test@example.com",
  "phone": "+1234567890",
  "company": "Test Corp"
}

# 2. Copy lead ID from response

# 3. Sync to Zoho
POST /api/v1/crm-integration/sync-leads
{
  "leadIds": ["LEAD_ID_FROM_STEP_1"]
}
```

#### Verify in Zoho:

- [ ] Open **Leads** in Zoho CRM
- [ ] Find lead "Test User"
- [ ] Check **Lead Source System** = `Jazzaam` ✅
- [ ] This prevents duplicate imports!

#### Check Platform Logs:

```bash
✅ Successfully synced lead to Zoho: test@example.com
   CRM ID: 1234567890123456789
```

---

### Test 2: Zoho → Platform (Inbound Webhook)

#### In Zoho CRM:

- [ ] Click **Create Lead**
- [ ] Fill in:
  - **First Name**: `Jane`
  - **Last Name**: `Doe`
  - **Email**: `jane@example.com`
  - **Phone**: `+9876543210`
  - **Company**: `Example Inc`
  - **Lead Source System**: Leave as `Manual` or `Zoho`
- [ ] Click **Save**

#### Check Platform Logs:

```bash
📥 Received Zoho webhook: { operation: 'insert', module: 'Leads' }
🔔 Processing Zoho webhook
📝 Processing new Zoho Leads record: 1234567890123456789
✅ Created new lead from Zoho: 507f1f77bcf86cd799439011
```

#### Verify in Platform:

```bash
GET /api/v1/leads?email=jane@example.com

# Should return:
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "source": "import",
  "sourceSystem": "Zoho",
  "crmMetadata": {
    "crmId": "1234567890123456789",
    "sourceSystem": "Zoho"
  }
}
```

- [ ] Lead "Jane Doe" appears in platform ✅

---

### Test 3: Duplicate Prevention

#### In Zoho CRM:

- [ ] Find the lead "Test User" (from Test 1)
- [ ] Note: **Lead Source System** = `Jazzaam`
- [ ] Edit the lead
- [ ] Change phone number to `+9999999999`
- [ ] **DON'T change Lead Source System** (stays `Jazzaam`)
- [ ] Click **Save**

#### Check Platform Logs:

```bash
📥 Received Zoho webhook: { operation: 'edit', module: 'Leads' }
🔔 Processing Zoho webhook
🔄 Processing updated Zoho Leads record: 1234567890123456789
⏭️ Skipping record 1234567890123456789 - originated from our platform
```

- [ ] Webhook received ✅
- [ ] Import skipped (duplicate prevented) ✅
- [ ] No duplicate created in platform ✅

---

## ✅ Setup Complete!

You now have bidirectional lead syncing with duplicate prevention!

### What Happens Now:

1. **Platform → Zoho**:
   - Create lead in platform → Syncs to Zoho
   - Marked with `Lead_Source_System = 'Jazzaam'`
   - Won't sync back (prevents duplicates)

2. **Zoho → Platform**:
   - Create lead in Zoho → Webhook fires
   - If `Lead_Source_System ≠ 'Jazzaam'` → Imports to platform
   - If `Lead_Source_System = 'Jazzaam'` → Skips (already in platform)

3. **Updates**:
   - Updates in Zoho → Webhook fires
   - Platform checks source system
   - Only imports if not originated from platform

---

## 📊 Monitor Webhook Health

### Check Webhook Status:

```bash
GET /api/v1/crm-integration/:integrationId/webhook-status

# Returns:
{
  "enabled": true,
  "totalReceived": 5,
  "lastReceivedAt": "2025-12-18T10:30:00Z",
  "webhookUrl": "https://your-domain.com/api/v1/webhooks/zoho"
}
```

### View Logs:

```bash
# Server logs
grep "Zoho webhook" logs/*.log

# Database - check error logs
db.crmintegrations.findOne({ provider: 'zoho' })
# Look at: errorLogs array
```

---

## 🔧 Troubleshooting

### Webhook Not Firing?

- [ ] Check webhook is enabled in Zoho CRM
- [ ] Test webhook from Zoho UI
- [ ] Verify URL is publicly accessible
- [ ] Check firewall/security settings
- [ ] If local: Use ngrok and update webhook URL

### Invalid Token Error?

- [ ] Verify token in Zoho webhook config matches platform
- [ ] Check request format includes `"token": "YOUR_TOKEN"`
- [ ] Regenerate token if needed

### Leads Not Importing?

- [ ] Check `Lead_Source_System` field value
- [ ] If `'Jazzaam'` → Correct (should be skipped)
- [ ] Create new lead with `'Manual'` or `'Zoho'`
- [ ] Verify webhook events are configured for Leads module

### Duplicates Creating?

- [ ] Verify custom field API name: `Lead_Source_System`
- [ ] Check sync service sets field correctly
- [ ] Verify webhook checks field value
- [ ] Values are case-sensitive: `'Jazzaam'` not `'jazzaam'`

---

## 📚 Next Steps

- [ ] **Document your setup** for your team
- [ ] **Monitor webhook logs** for first few days
- [ ] **Train users** on Lead Source System field
- [ ] **Set up alerts** for webhook failures
- [ ] **Consider rate limits** based on Zoho plan
- [ ] **Review Salesforce setup** if needed (similar process)

---

## 📖 Related Documentation

- Full Setup Guide: [docs/ZOHO_BIDIRECTIONAL_SYNC_SETUP.md](./ZOHO_BIDIRECTIONAL_SYNC_SETUP.md)
- HubSpot vs Zoho: [docs/ZOHO_VS_HUBSPOT_WEBHOOKS.md](./ZOHO_VS_HUBSPOT_WEBHOOKS.md)
- HubSpot Setup: [docs/BIDIRECTIONAL_SYNC_SETUP.md](./BIDIRECTIONAL_SYNC_SETUP.md)
- API Reference: [docs/MULTI_TENANT_API_REFERENCE.md](../MULTI_TENANT_API_REFERENCE.md)

---

## 🎉 Success!

Your Zoho CRM bidirectional sync is now live! Leads will sync in real-time between your platform and Zoho, with intelligent duplicate prevention.

**Questions?** Refer to the troubleshooting section above or check the full documentation.
