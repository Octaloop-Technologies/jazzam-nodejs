# Bidirectional Lead Sync - Quick Reference

## What Was Implemented

✅ **Bidirectional Lead Synchronization** between your platform and connected CRMs (HubSpot, Salesforce, Zoho, Dynamics 365)

✅ **Smart Duplicate Prevention** - Leads synced FROM your platform TO CRM won't appear twice

✅ **Unified API Endpoint** - Single endpoint returns merged leads from both sources

## Modified Files

### 1. Lead Model (`src/models/lead.model.js`)
Added tracking fields:
- `leadOrigin`: Tracks if lead is from "platform", "crm", or "imported"
- `originCrmProvider`: Stores which CRM it came from
- `originCrmId`: Unique CRM ID for deduplication
- `lastSyncedAt`: Last sync timestamp

### 2. Lead Controller (`src/controllers/lead.controller.js`)
- Added `fetchCrmLeads()` helper function
- Enhanced `getLeads()` to merge platform + CRM leads
- Added deduplication logic
- New query param: `includeCrmLeads` (default: true)

### 3. Sync Service (`src/services/crm/sync.service.js`)
- Marks leads with origin when syncing TO CRM
- Prevents circular sync when importing FROM CRM
- Skips platform-originated leads during import

## How To Use

### API Endpoint

```javascript
GET /api/v1/lead/all?includeCrmLeads=true&page=1&limit=20
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Results per page |
| `includeCrmLeads` | boolean/string | "true" | Include CRM leads |
| `status` | string | - | Filter by status (hot, warm, cold, etc.) |
| `sortBy` | string | "createdAt" | Sort field |
| `sortOrder` | string | "desc" | Sort direction (asc/desc) |

### Response Format

```json
{
  "statusCode": 200,
  "data": {
    "leads": [
      {
        "_id": "platform_lead_id",
        "fullName": "John Doe",
        "email": "john@example.com",
        "leadOrigin": "platform",
        "crmId": "hubspot_123",
        "crmSyncStatus": "synced"
      },
      {
        "_id": "crm_hubspot_456",
        "fullName": "Jane Smith",
        "email": "jane@example.com",
        "leadOrigin": "crm",
        "originCrmProvider": "hubspot",
        "originCrmId": "456",
        "isCrmLead": true,
        "sourceType": "crm"
      }
    ],
    "totalResults": 45,
    "page": 1,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false,
    "limit": 20
  },
  "message": "Leads fetched successfully"
}
```

## How It Prevents Duplicates

### The Problem
When you sync a lead FROM your platform TO a CRM (like HubSpot), that same lead now exists in both places. Without proper handling, it would appear twice in your lead list.

### The Solution
1. When syncing TO CRM: Store the CRM's ID in the platform lead's `crmId` field
2. When fetching leads: 
   - Get platform leads (these include `crmId` for synced leads)
   - Get CRM leads
   - **Filter out** CRM leads whose ID matches any platform lead's `crmId`
   - Return merged, deduplicated list

### Code Logic

```javascript
// Extract CRM IDs from platform leads
const platformLeadCrmIds = platformLeads
  .filter(lead => lead.crmId)
  .map(lead => lead.crmId);
// ["hubspot_123", "salesforce_456"]

// Filter out CRM leads that match
const genuineCrmLeads = crmLeads.filter(crmLead => 
  !platformLeadCrmIds.includes(crmLead.id)
);
// Only CRM-native leads remain
```

## Lead Identification

### Platform Lead (Not Synced)
```json
{
  "leadOrigin": "platform",
  "crmId": null,
  "crmSyncStatus": "not_synced"
}
```

### Platform Lead (Synced to CRM)
```json
{
  "leadOrigin": "platform",
  "crmId": "hubspot_123",
  "crmSyncStatus": "synced"
}
```

### CRM-Native Lead (Fetched from CRM)
```json
{
  "leadOrigin": "crm",
  "originCrmProvider": "hubspot",
  "originCrmId": "456",
  "isCrmLead": true
}
```

## Frontend Integration

### Basic Usage

```javascript
// Fetch all leads (platform + CRM)
const response = await fetch('/api/v1/lead/all?includeCrmLeads=true');
const data = await response.json();
console.log(data.data.leads);

// Fetch only platform leads
const response = await fetch('/api/v1/lead/all?includeCrmLeads=false');
```

### Identify Lead Type

```javascript
const renderLeadBadge = (lead) => {
  if (lead.isCrmLead) {
    return `CRM Lead (${lead.originCrmProvider})`;
  }
  if (lead.crmSyncStatus === 'synced') {
    return 'Synced to CRM';
  }
  return 'Platform Lead';
};
```

## Testing Checklist

- [ ] Create lead on platform
- [ ] Sync lead to CRM
- [ ] Call `/api/v1/lead/all` - verify lead appears once
- [ ] Create lead directly in CRM
- [ ] Call `/api/v1/lead/all` - verify both leads appear
- [ ] Test with `includeCrmLeads=false` - verify only platform leads
- [ ] Test pagination with merged leads
- [ ] Test status filtering with merged leads

## Performance Notes

- CRM API calls add latency (~500ms-2s depending on provider)
- Consider caching CRM responses for 1-5 minutes
- For large lead lists, use pagination effectively
- Option to disable CRM fetching with `includeCrmLeads=false`

## Troubleshooting

### Seeing Duplicates?
Check if `crmId` field is properly set on synced leads.

### CRM Leads Not Showing?
1. Verify CRM integration is active: `GET /api/v1/crm-integration`
2. Test connection: `GET /api/v1/crm-integration/test/:id`
3. Check OAuth tokens haven't expired

### Slow Performance?
1. Reduce `limit` parameter
2. Set `includeCrmLeads=false` for faster queries
3. Implement caching layer

## Migration for Existing Data

Run this to mark existing leads:

```javascript
const { Lead } = getTenantModels(tenantConnection);

// Mark all existing leads as platform leads
await Lead.updateMany(
  { leadOrigin: { $exists: false } },
  { $set: { leadOrigin: "platform" } }
);
```

## Next Steps

1. Test the endpoint with Postman/Insomnia
2. Update frontend to use new `includeCrmLeads` parameter
3. Add UI toggle for including/excluding CRM leads
4. Monitor CRM API usage and rate limits
5. Consider implementing response caching

## Support

For issues or questions:
- Check logs for error messages
- Verify CRM integration status
- Test with `includeCrmLeads=false` to isolate issues
- Review network tab for API response details

---

**Summary:** The `/api/v1/lead/all` endpoint now intelligently merges leads from your platform and connected CRMs, automatically filtering out duplicates by tracking which leads originated from your platform and were synced to CRMs.
