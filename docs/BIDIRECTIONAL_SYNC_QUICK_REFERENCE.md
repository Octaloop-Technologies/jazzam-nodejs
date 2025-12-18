# Bidirectional CRM Sync - Quick Reference

## 🎯 Key Concept

**Problem:** When you upload leads to a CRM, they might sync back and create duplicates.

**Solution:** Use a custom property (`lead_source_system`) to track where each lead originated, and skip syncing leads that came from your platform.

---

## 🔑 How Duplicate Prevention Works

### The Magic Property: `lead_source_system`

Every contact in HubSpot has this property with one of these values:
- `jazzaam` - Lead originated from your platform
- `hubspot` - Lead created directly in HubSpot
- `manual` - Manually entered

### The Logic:

```javascript
// When webhook receives a contact from HubSpot:
if (contact.lead_source_system === 'jazzaam') {
  // This is OUR lead that we uploaded - SKIP IT
  return { skipped: true, reason: 'originated_internally' };
}

// Otherwise, it's a new HubSpot lead - import it!
createLeadInPlatform(contact);
```

---

## 📊 Lead Flow Diagrams

### Flow 1: Platform → HubSpot (No Duplicate)

```
1. User submits form on your platform
   ↓
2. Lead created in your database
   ↓
3. Auto-sync to HubSpot (if enabled)
   ↓
4. Contact created in HubSpot with lead_source_system="jazzaam"
   ↓
5. HubSpot fires webhook: "contact.creation"
   ↓
6. Your webhook handler checks lead_source_system
   ↓
7. Sees "jazzaam" → SKIP (prevents duplicate)
   ✅ No duplicate created!
```

### Flow 2: HubSpot → Platform (Real-time Import)

```
1. Sales rep creates contact in HubSpot
   ↓
2. lead_source_system is empty or "hubspot"
   ↓
3. HubSpot fires webhook: "contact.creation"
   ↓
4. Your webhook handler checks lead_source_system
   ↓
5. Sees NOT "jazzaam" → PROCEED
   ↓
6. Lead created in your platform
   ✅ Real-time sync complete!
```

---

## 🚀 Quick Setup (5 Minutes)

### 1. Create Custom Property in HubSpot
- Settings → Properties → Create property
- Name: `lead_source_system`
- Type: Dropdown
- Options: `jazzaam`, `hubspot`, `manual`

### 2. Enable Webhooks
```bash
POST /api/v1/crm-integration/{integrationId}/enable-webhooks
```

### 3. Test
- Create lead in your platform → Should appear in HubSpot, NOT duplicate
- Create contact in HubSpot → Should appear in your platform

---

## 🔍 Troubleshooting One-Liners

| Problem | Solution |
|---------|----------|
| Webhooks not firing | Check webhook URL is publicly accessible |
| Duplicates still appearing | Verify `lead_source_system` property exists in HubSpot |
| HubSpot leads not importing | Check logs for `⏭️ Skipping` messages |
| No email on HubSpot contact | Contacts must have email to import |

---

## 📝 Important Endpoints

### Enable Webhooks
```
POST /api/v1/crm-integration/:integrationId/enable-webhooks
```

### Check Webhook Status
```
GET /api/v1/crm-integration/:integrationId/webhook-status
```

### Disable Webhooks
```
POST /api/v1/crm-integration/:integrationId/disable-webhooks
```

### Manual Import from CRM
```
POST /api/v1/crm-integration/import
```

---

## 🎛️ Configuration

### Database Fields Added

**Lead Model (`crmMetadata`):**
```javascript
{
  sourceSystem: 'jazzaam' | 'hubspot' | 'salesforce' | 'zoho',
  lastSyncDirection: 'to_crm' | 'from_crm',
  lastSyncedAt: Date,
  syncVersion: Number,
  crmProvider: 'hubspot' | 'salesforce' | 'zoho'
}
```

**CRM Integration Model (`webhooks`):**
```javascript
{
  enabled: Boolean,
  subscriptionId: String,
  totalReceived: Number,
  lastReceivedAt: Date,
  events: ['contact.creation', 'contact.propertyChange']
}
```

---

## 📊 Monitoring

### Log Messages to Watch For

```bash
# Good - Normal operation
📥 HubSpot Webhook: contact.creation for contact 12345
➕ Creating new lead from HubSpot contact 12345
✅ Lead created: 507f1f77bcf86cd799439011

# Good - Duplicate prevented
⏭️  Skipping contact 67890 - originated from our platform

# Warning - Needs attention
⚠️  Skipping contact 12345 - no email address

# Error - Needs fixing
❌ Failed to handle contact creation: [error details]
```

---

## 🔐 Security

- Webhook endpoint is public (no auth) - this is normal
- Optional: Enable signature verification with `HUBSPOT_CLIENT_SECRET`
- HubSpot verifies the webhook endpoint when you register it

---

## 💡 Pro Tips

1. **Start with one integration** - Test HubSpot thoroughly before adding others
2. **Monitor for 24 hours** - Watch webhook logs after initial setup
3. **Test both directions** - Create leads in both systems to verify
4. **Check the custom property** - Always verify it's set correctly in HubSpot
5. **Use ngrok for development** - Test webhooks locally before deploying

---

## ✅ Success Indicators

- ✅ Webhook status shows `totalReceived > 0`
- ✅ Logs show `⏭️ Skipping` for platform-originated leads
- ✅ Logs show `✅ Lead created` for HubSpot-originated leads
- ✅ No duplicate leads in your database
- ✅ Real-time updates (< 5 seconds delay)

---

## 🆘 Emergency Fixes

### If Duplicates Are Being Created

**Quick Fix:**
```bash
# Disable webhooks immediately
POST /api/v1/crm-integration/:integrationId/disable-webhooks

# Then investigate and fix the root cause
```

### If Webhooks Stop Working

**Quick Check:**
```bash
# Test webhook endpoint
curl -X POST https://yourdomain.com/api/v1/webhooks/hubspot \
  -H "Content-Type: application/json" \
  -d '[{"subscriptionType":"contact.creation","objectId":"123"}]'

# Should return 200 OK
```

---

## 🎓 Key Takeaways

1. **Custom property is critical** - Without `lead_source_system`, duplicates will occur
2. **Webhooks are real-time** - Updates appear in < 5 seconds
3. **One-way prevention works both ways** - Mark outgoing, check incoming
4. **Logs are your friend** - They tell you exactly what's happening
5. **Test thoroughly** - Create leads in both systems and verify behavior

---

## 📚 Related Documentation

- [Complete Setup Guide](./BIDIRECTIONAL_SYNC_SETUP.md) - Detailed step-by-step instructions
- [HubSpot Sync Plan](./HUBSPOT_BIDIRECTIONAL_SYNC_PLAN.md) - Original implementation plan
- [CRM Integration Guide](./CRM_INTEGRATION_GUIDE.md) - General CRM integration docs

---

**Questions?** Check the logs first - they contain detailed information about what's happening with each webhook and sync operation.
