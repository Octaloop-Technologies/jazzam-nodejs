# Bidirectional Lead Sync Implementation

## Overview
This implementation enables bidirectional lead synchronization between your platform and connected CRMs (HubSpot, Salesforce, Zoho, Dynamics 365), with intelligent duplicate prevention.

## Features

### ✅ What's Implemented

1. **Bidirectional Sync**
   - Leads created on your platform sync TO CRM
   - Leads created on CRM are fetched and displayed alongside platform leads
   - Real-time merging without database duplication

2. **Duplicate Prevention**
   - Tracks lead origin (platform vs CRM)
   - Stores unique CRM identifiers
   - Filters out leads that were originally synced FROM your platform TO CRM
   - Prevents circular syncing

3. **Unified Lead View**
   - Single API endpoint returns merged leads from both sources
   - Consistent data format across all sources
   - Proper pagination and filtering

## Architecture Changes

### 1. Lead Model Updates (`lead.model.js`)

Added new fields to track lead origin and prevent duplicates:

```javascript
leadOrigin: {
  type: String,
  enum: ["platform", "crm", "imported"],
  default: "platform",
  index: true,
}
originCrmProvider: {
  type: String,
  enum: ["zoho", "salesforce", "hubspot", "dynamics", null],
  default: null,
}
originCrmId: {
  type: String,
  trim: true,
  sparse: true,
}
lastSyncedAt: {
  type: Date,
}
```

**Purpose:**
- `leadOrigin`: Identifies where the lead was originally created
- `originCrmProvider`: Stores which CRM the lead came from
- `originCrmId`: Unique CRM ID to prevent duplicate imports
- `lastSyncedAt`: Tracks last sync timestamp

### 2. Sync Service Updates (`sync.service.js`)

**Enhanced Lead Syncing TO CRM:**
- Marks leads with `leadOrigin: "platform"` when syncing to CRM
- Stores CRM ID in `crmId` field
- Sets `crmSyncStatus: "synced"`

**Enhanced Lead Import FROM CRM:**
- Checks for existing leads by email OR `originCrmId`
- Skips leads that originated from platform (prevents circular sync)
- Marks imported leads with `leadOrigin: "crm"`
- Stores original CRM provider and ID

```javascript
// Skip platform-originated leads when importing from CRM
if (existingLead.leadOrigin === "platform" && existingLead.crmId) {
  results.skipped += 1; // This is a lead we synced TO CRM, don't import it back
}
```

### 3. Lead Controller Updates (`lead.controller.js`)

**New Helper Function: `fetchCrmLeads()`**
- Fetches leads directly from connected CRM
- Supports all CRM providers (HubSpot, Salesforce, Zoho, Dynamics)
- Handles token refresh automatically
- Returns standardized lead format

**Enhanced `getLeads()` Controller:**
```javascript
// New query parameter
includeCrmLeads = "true" // Control whether to fetch CRM leads
```

**Deduplication Logic:**
1. Fetch platform leads from database
2. If `includeCrmLeads` is enabled:
   - Fetch leads from connected CRM
   - Filter out CRM leads that match platform leads' `crmId`
   - Merge remaining CRM leads with platform leads
   - Sort and paginate combined results

```javascript
// Filter out CRM leads that were synced FROM our platform
const platformLeadCrmIds = allLeads
  .filter(lead => lead.crmId)
  .map(lead => lead.crmId);

const genuineCrmLeads = crmLeadsData.leads.filter(crmLead => 
  !platformLeadCrmIds.includes(crmLead.id)
);
```

## API Usage

### Get All Leads (Bidirectional)

**Endpoint:** `GET /api/v1/lead/all`

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10)
- `status`: Filter by status (hot, warm, cold, etc.)
- `includeCrmLeads`: Include CRM leads (default: "true")
- `sortBy`: Sort field (default: "createdAt")
- `sortOrder`: Sort direction (default: "desc")

**Example Request:**
```javascript
GET /api/v1/lead/all?page=1&limit=20&includeCrmLeads=true&status=hot
```

**Response:**
```json
{
  "statusCode": 200,
  "data": {
    "leads": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "fullName": "John Doe",
        "email": "john@example.com",
        "company": "Acme Inc",
        "status": "hot",
        "leadOrigin": "platform",
        "crmId": "123456",
        "crmSyncStatus": "synced",
        "createdAt": "2025-01-15T10:00:00Z"
      },
      {
        "_id": "crm_789012",
        "fullName": "Jane Smith",
        "email": "jane@example.com",
        "company": "TechCorp",
        "status": "warm",
        "leadOrigin": "crm",
        "originCrmProvider": "hubspot",
        "originCrmId": "789012",
        "isCrmLead": true,
        "sourceType": "crm",
        "source": "HubSpot CRM",
        "createdAt": "2025-01-14T15:30:00Z"
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

## How It Works

### Scenario 1: Platform Lead → CRM Sync
1. Lead created on your platform (form submission)
2. Lead marked with `leadOrigin: "platform"`
3. Auto-sync or manual sync triggered
4. Lead sent to CRM, CRM returns ID
5. Lead updated: `crmId: "123"`, `crmSyncStatus: "synced"`

### Scenario 2: CRM Lead Display
1. User calls `/api/v1/lead/all`
2. System fetches platform leads from database
3. System fetches leads from connected CRM
4. **Deduplication:** Filters out CRM leads where `crmLead.id` matches any platform lead's `crmId`
5. Merges remaining CRM leads with platform leads
6. Returns combined, sorted, paginated results

### Scenario 3: CRM Lead Import (Optional)
1. Call `/api/v1/crm-integration/import`
2. Fetches leads from CRM
3. For each CRM lead:
   - Checks if exists by email or `originCrmId`
   - If exists and `leadOrigin === "platform"`: **SKIP** (this is our lead)
   - If exists and `leadOrigin === "crm"`: **UPDATE**
   - If not exists: **CREATE** with `leadOrigin: "crm"`

## Lead Identification Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Lead Created on Platform                  │
│  leadOrigin: "platform"                                      │
│  crmId: null                                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Sync to CRM
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Lead Exists in Both Systems                     │
│  Platform: leadOrigin="platform", crmId="123"               │
│  CRM: id="123"                                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ GET /api/v1/lead/all
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Deduplication Logic                         │
│  1. Fetch platform leads (includes lead with crmId="123")   │
│  2. Fetch CRM leads (includes lead with id="123")           │
│  3. Filter: Remove CRM lead with id="123"                   │
│  4. Return: Only platform version                           │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

1. **No Database Bloat**: CRM-only leads aren't stored in your database
2. **Real-time Data**: Always shows latest CRM data
3. **No Duplicates**: Smart filtering prevents showing same lead twice
4. **Flexible**: Can disable CRM leads with `includeCrmLeads=false`
5. **Scalable**: Handles large lead volumes efficiently

## Configuration

### Enable/Disable CRM Lead Fetching

**Backend (default enabled):**
```javascript
// In route call
GET /api/v1/lead/all?includeCrmLeads=false
```

**Frontend Toggle:**
```javascript
const fetchLeads = async (includeCrm = true) => {
  const response = await axios.get('/api/v1/lead/all', {
    params: { includeCrmLeads: includeCrm }
  });
  return response.data;
};
```

## Performance Considerations

1. **Pagination**: Applied after merging to ensure accurate results
2. **Caching**: Consider adding Redis cache for CRM API responses
3. **Rate Limits**: CRM APIs have rate limits - monitor usage
4. **Async Loading**: Frontend can load platform leads first, then CRM leads

## Migration Guide

### For Existing Leads

Run this migration to add `leadOrigin` to existing leads:

```javascript
// Migration script
const Lead = getTenantModels(tenantConnection).Lead;

// Mark all existing leads without leadOrigin as platform leads
await Lead.updateMany(
  { leadOrigin: { $exists: false } },
  { $set: { leadOrigin: "platform" } }
);

// Mark all leads with crmId as platform-originated
await Lead.updateMany(
  { crmId: { $exists: true, $ne: null } },
  { $set: { leadOrigin: "platform" } }
);
```

## Troubleshooting

### Issue: Seeing Duplicate Leads

**Check:**
1. Verify `leadOrigin` is set correctly
2. Check if `crmId` matches between platform and CRM leads
3. Ensure deduplication logic is running

**Debug:**
```javascript
// In getLeads controller, add logging
console.log("Platform lead CRM IDs:", platformLeadCrmIds);
console.log("CRM leads before filter:", crmLeadsData.leads.length);
console.log("CRM leads after filter:", genuineCrmLeads.length);
```

### Issue: CRM Leads Not Showing

**Check:**
1. CRM integration status is "active"
2. `includeCrmLeads` parameter is "true"
3. OAuth tokens are valid (check expiry)
4. CRM API credentials are correct

**Test CRM Connection:**
```javascript
GET /api/v1/crm-integration/test/:integrationId
```

### Issue: Performance Slow

**Solutions:**
1. Reduce `limit` parameter
2. Add caching layer for CRM responses
3. Implement background sync instead of real-time fetch
4. Use `includeCrmLeads=false` for faster queries

## Future Enhancements

1. **Background Sync**: Periodic job to cache CRM leads in database
2. **Selective Sync**: Only sync specific CRM lead sources
3. **Two-way Updates**: Sync lead updates bidirectionally
4. **Conflict Resolution**: Handle conflicting updates intelligently
5. **Bulk Import**: One-time import all CRM leads to database
6. **Webhook Support**: Real-time updates from CRM webhooks

## Testing

### Test Scenarios

1. **Create platform lead, sync to CRM, verify no duplicate**
   ```javascript
   // Create lead on platform
   POST /api/v1/lead
   // Sync to CRM
   POST /api/v1/crm-integration/sync { leadIds: [...] }
   // Fetch all leads
   GET /api/v1/lead/all
   // Verify: Only one lead appears
   ```

2. **Create lead in CRM, verify it appears**
   ```javascript
   // Create lead directly in HubSpot/Salesforce
   // Fetch all leads
   GET /api/v1/lead/all?includeCrmLeads=true
   // Verify: Lead appears with isCrmLead: true
   ```

3. **Disable CRM leads**
   ```javascript
   GET /api/v1/lead/all?includeCrmLeads=false
   // Verify: Only platform leads returned
   ```

## Summary

This implementation provides a robust bidirectional sync solution that:
- ✅ Displays leads from both platform and CRM
- ✅ Prevents duplicates intelligently
- ✅ Tracks lead origin and sync status
- ✅ Scales efficiently
- ✅ Provides flexibility to enable/disable CRM integration

The key innovation is the **smart deduplication** that uses `crmId` matching to identify and filter out leads that were originally created on your platform, ensuring users see a clean, unified lead list without duplicates.
