# Bidirectional CRM Lead Syncing - Setup Guide

## Overview

This guide explains how to set up **real-time bidirectional lead syncing** with HubSpot CRM, with intelligent duplicate prevention to ensure you only see leads that were created directly in the CRM, not those you uploaded from your platform.

## 🎯 What This Achieves

### ✅ What You Get:
1. **Real-time sync FROM HubSpot** - When leads are created/updated in HubSpot, they automatically appear in your platform
2. **No Duplicates** - Leads you upload to HubSpot won't sync back to create duplicates
3. **Bidirectional Updates** - Changes in either system are reflected in the other
4. **Source Tracking** - Always know where each lead originated

### ⚠️ What's Prevented:
- ❌ Duplicate leads from your own uploads
- ❌ Infinite sync loops
- ❌ Conflicting data between systems

---

## 📋 Prerequisites

Before you begin, you need:
1. An active HubSpot account (Professional or Enterprise recommended)
2. HubSpot Private App or OAuth integration already configured
3. Your platform API accessible via public URL (for webhooks)
4. Admin access to HubSpot settings

---

## 🔧 Setup Steps

### Step 1: Create Custom Property in HubSpot

This custom property is **critical** for preventing duplicates.

#### Option A: Via HubSpot UI (Recommended)

1. **Go to HubSpot Settings**
   - Click on the settings icon (⚙️) in HubSpot
   - Navigate to **Properties** under **Data Management**

2. **Create New Property**
   - Click **"Create property"**
   - Select object type: **Contact**

3. **Configure the Property**
   ```
   Label: Lead Source System
   Internal name: lead_source_system
   Field type: Dropdown select
   Group: Contact Information
   ```

4. **Add Options**
   ```
   jazzaam - Your Platform
   hubspot - HubSpot CRM
   manual - Manual Entry
   ```

5. **Save the Property**

#### Option B: Via HubSpot API

```bash
POST https://api.hubapi.com/crm/v3/properties/contacts
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "name": "lead_source_system",
  "label": "Lead Source System",
  "type": "enumeration",
  "fieldType": "select",
  "groupName": "contactinformation",
  "options": [
    {
      "label": "Your Platform",
      "value": "jazzaam",
      "description": "Lead originated from your platform",
      "displayOrder": 1
    },
    {
      "label": "HubSpot CRM",
      "value": "hubspot",
      "description": "Lead created directly in HubSpot",
      "displayOrder": 2
    },
    {
      "label": "Manual Entry",
      "value": "manual",
      "description": "Manually entered lead",
      "displayOrder": 3
    }
  ]
}
```

---

### Step 2: Register Webhook with HubSpot

Webhooks enable real-time notifications when leads are created/updated in HubSpot.

#### Option A: Via Your Platform API (Recommended)

Once you have your CRM integration set up, use this endpoint:

```bash
POST /api/v1/crm-integration/:integrationId/enable-webhooks
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "webhookUrl": "https://yourdomain.com/api/v1/webhooks/hubspot"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "id": "12345",
        "eventType": "contact.creation",
        "active": true
      },
      {
        "id": "12346",
        "eventType": "contact.propertyChange",
        "active": true
      }
    ],
    "webhookUrl": "https://yourdomain.com/api/v1/webhooks/hubspot"
  },
  "message": "Webhooks enabled successfully"
}
```

#### Option B: Via HubSpot UI

1. **Go to HubSpot Settings**
   - Settings → Integrations → Private Apps
   - Select your app or create a new one

2. **Configure Webhooks**
   - Go to the **Webhooks** tab
   - Click **"Create subscription"**

3. **Subscribe to Events**
   - Event type: `contact.creation`
   - Target URL: `https://yourdomain.com/api/v1/webhooks/hubspot`
   - Click **"Create"**

4. **Repeat for Additional Events**
   - `contact.propertyChange` - for updates
   - `contact.deletion` - for deletions (optional)

#### Option C: Via HubSpot API

```bash
POST https://api.hubapi.com/webhooks/v3/subscriptions
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "eventType": "contact.creation",
  "active": true
}
```

Repeat for `contact.propertyChange`.

---

### Step 3: Configure Your Environment

Add these environment variables to your `.env` file:

```env
# HubSpot Webhook Configuration
HUBSPOT_WEBHOOK_SECRET=your_webhook_secret_here
API_URL=https://yourdomain.com

# Optional: If you want signature verification
HUBSPOT_CLIENT_SECRET=your_hubspot_client_secret
```

---

### Step 4: Test the Integration

#### Test 1: Upload Lead from Your Platform to HubSpot

1. **Create a lead in your platform** (via form submission or manual entry)
2. **Sync to HubSpot** (automatic if auto-sync is enabled)
3. **Check HubSpot** - Lead should appear with `lead_source_system = jazzaam`
4. **Check your platform** - Lead should NOT duplicate

**Expected Result:** ✅ Lead appears in HubSpot but doesn't sync back to create duplicate

#### Test 2: Create Lead Directly in HubSpot

1. **Go to HubSpot** - Contacts → Create contact
2. **Fill in details** (email, name, etc.)
3. **Leave `lead_source_system` empty or set to "hubspot"**
4. **Save the contact**
5. **Check your platform** - Lead should appear within seconds

**Expected Result:** ✅ Lead appears in your platform in real-time

#### Test 3: Update Lead in HubSpot

1. **Go to existing HubSpot contact** (one that originated in HubSpot)
2. **Update phone number or job title**
3. **Save changes**
4. **Check your platform** - Changes should reflect immediately

**Expected Result:** ✅ Updates appear in your platform

---

## 🔍 How It Works

### When You Create a Lead in Your Platform:

```mermaid
Your Platform (Lead Created)
  ↓
  [Sync to HubSpot]
  ↓
HubSpot (Contact Created with lead_source_system="jazzaam")
  ↓
  [Webhook fires]
  ↓
Your Platform Webhook Handler
  ↓
  [Checks: lead_source_system === "jazzaam"]
  ↓
✅ SKIPPED (No duplicate created)
```

### When Someone Creates a Lead in HubSpot:

```mermaid
HubSpot (Contact Created, lead_source_system=null or "hubspot")
  ↓
  [Webhook fires]
  ↓
Your Platform Webhook Handler
  ↓
  [Checks: lead_source_system !== "jazzaam"]
  ↓
  [Creates lead in your database]
  ↓
✅ Lead appears in your platform
```

---

## 📊 Monitoring Webhooks

### Check Webhook Status

```bash
GET /api/v1/crm-integration/:integrationId/webhook-status
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "totalReceived": 47,
    "lastReceivedAt": "2025-12-18T10:30:00Z",
    "subscriptionId": "12345",
    "events": [
      "contact.creation",
      "contact.propertyChange"
    ],
    "webhookUrl": "https://yourdomain.com/api/v1/webhooks/hubspot"
  }
}
```

### View Webhook Logs

Check your server logs for webhook processing:

```bash
# Successful processing
📥 HubSpot Webhook: contact.creation for contact 12345
➕ Creating new lead from HubSpot contact 12345
✅ Lead created: 507f1f77bcf86cd799439011

# Skipped (duplicate prevention)
📥 HubSpot Webhook: contact.creation for contact 67890
⏭️  Skipping contact 67890 - originated from our platform

# Update processed
📥 HubSpot Webhook: contact.propertyChange for contact 12345
✏️  Updating existing lead for contact 12345
✅ Lead updated: 507f1f77bcf86cd799439011
```

---

## 🚨 Troubleshooting

### Problem: Webhooks Not Firing

**Symptoms:**
- Leads created in HubSpot don't appear in your platform
- Webhook status shows `totalReceived: 0`

**Solutions:**
1. **Verify webhook URL is publicly accessible**
   ```bash
   curl https://yourdomain.com/api/v1/webhooks/hubspot
   # Should return 200 (even without auth)
   ```

2. **Check HubSpot webhook subscriptions**
   - Go to HubSpot Settings → Integrations → Private Apps
   - Verify subscriptions are "Active"

3. **Test with ngrok (for development)**
   ```bash
   ngrok http 3000
   # Use the ngrok URL for webhook endpoint
   ```

### Problem: Duplicate Leads Being Created

**Symptoms:**
- Leads you upload to HubSpot are appearing in your platform again

**Solutions:**
1. **Verify custom property exists in HubSpot**
   - Check if `lead_source_system` property is created
   - Ensure it's assigned to the Contact object

2. **Check if property is being set during sync**
   - View contact in HubSpot
   - Check "Contact Information" section
   - `Lead Source System` should show "Your Platform"

3. **Review sync service logs**
   ```bash
   # Look for this in logs when syncing to HubSpot:
   "Adding lead_source_system property to prevent sync loop"
   ```

### Problem: Leads Not Syncing from HubSpot

**Symptoms:**
- New HubSpot contacts don't appear in your platform
- Webhook is firing but leads aren't created

**Solutions:**
1. **Check webhook processing logs**
   ```bash
   # Look for error messages:
   ❌ Failed to handle contact creation: [error message]
   ```

2. **Verify email addresses**
   - Contacts must have email addresses
   - Check logs for: `⚠️  Skipping contact - no email address`

3. **Check form field requirements**
   - Your Lead model may require certain fields (like formId)
   - You may need to create a default "CRM Import" form

---

## 🔐 Security Considerations

### Webhook Signature Verification

To prevent unauthorized webhook calls, enable signature verification:

1. **Get your client secret from HubSpot**
   - Settings → Integrations → Private Apps
   - Copy the "Client Secret"

2. **Add to environment variables**
   ```env
   HUBSPOT_CLIENT_SECRET=your_secret_here
   ```

3. **Verification is automatic** - The webhook handler will verify signatures if the secret is configured

### Rate Limiting

HubSpot webhooks are not rate-limited, but API calls are:
- **Free/Starter:** 100 requests per 10 seconds
- **Professional:** 150 requests per 10 seconds
- **Enterprise:** 200 requests per 10 seconds

If you receive many webhooks, consider implementing a queue system.

---

## 🎛️ Configuration Options

### Disable Auto-Sync from Platform to HubSpot

If you only want one-way sync (HubSpot → Platform):

```bash
PATCH /api/v1/crm-integration/:integrationId
{
  "settings": {
    "autoSync": {
      "enabled": false
    },
    "syncDirection": "from_crm"
  }
}
```

### Enable Bidirectional Sync

For full two-way syncing:

```bash
PATCH /api/v1/crm-integration/:integrationId
{
  "settings": {
    "autoSync": {
      "enabled": true
    },
    "syncDirection": "bidirectional"
  }
}
```

---

## 📈 Supported CRM Providers

### Currently Implemented:
- ✅ **HubSpot** - Full bidirectional sync with webhooks
- ⚠️ **Salesforce** - One-way sync (Platform → Salesforce)
- ⚠️ **Zoho** - One-way sync (Platform → Zoho)

### Coming Soon:
- 🔄 Salesforce bidirectional sync
- 🔄 Zoho bidirectional sync
- 🔄 Pipedrive bidirectional sync

---

## 📝 Summary

### What You've Configured:

1. ✅ **Custom Property** in HubSpot (`lead_source_system`)
2. ✅ **Webhook Subscriptions** for real-time notifications
3. ✅ **Webhook Endpoint** in your platform
4. ✅ **Duplicate Prevention Logic** in sync service
5. ✅ **Source Tracking** in lead metadata

### How Duplicates Are Prevented:

- **Leads uploaded FROM your platform** are marked with `lead_source_system=jazzaam`
- **Webhook handler checks this property** and skips syncing back
- **Only leads created directly in HubSpot** (or with different source) are synced to your platform
- **Result:** Real-time bidirectional sync with zero duplicates

### Next Steps:

1. Test the integration thoroughly
2. Monitor webhook logs for the first few days
3. Train your team on where leads originate
4. Consider enabling for additional CRM providers as they become available

---

## 🆘 Support

If you encounter issues:

1. **Check the logs** - Most issues are logged with helpful error messages
2. **Review this guide** - Ensure all steps were completed
3. **Test the webhook endpoint** - Verify it's publicly accessible
4. **Check HubSpot subscription status** - Ensure webhooks are active

For additional help, check:
- HubSpot Developer Documentation: https://developers.hubspot.com/docs/api/webhooks
- Your platform's error logs
- CRM integration error logs in the database

---

## 🎉 Success Checklist

- [ ] Custom property `lead_source_system` created in HubSpot
- [ ] Webhook subscriptions registered and active
- [ ] Environment variables configured
- [ ] Test lead uploaded from platform (should not duplicate)
- [ ] Test lead created in HubSpot (should appear in platform)
- [ ] Test lead update in HubSpot (should sync to platform)
- [ ] Webhook status showing received events
- [ ] No duplicate leads observed

Once all checkboxes are complete, you have fully functional bidirectional CRM syncing! 🚀
