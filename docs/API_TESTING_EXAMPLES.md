# API Testing Examples for Bidirectional Lead Sync

## Prerequisites
- Active CRM integration (HubSpot, Salesforce, Zoho, or Dynamics)
- Valid authentication token
- At least one lead in your platform
- At least one lead in your CRM

---

## Test 1: Get All Leads (Platform + CRM)

### Request
```http
GET http://localhost:3000/api/v1/lead/all?includeCrmLeads=true&page=1&limit=20
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
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
        "crmId": "hubspot_12345",
        "crmSyncStatus": "synced",
        "createdAt": "2025-01-15T10:00:00Z"
      },
      {
        "_id": "crm_hubspot_67890",
        "fullName": "Jane Smith",
        "email": "jane@example.com",
        "company": "TechCorp",
        "status": "warm",
        "leadOrigin": "crm",
        "originCrmProvider": "hubspot",
        "originCrmId": "67890",
        "isCrmLead": true,
        "sourceType": "crm",
        "source": "HubSpot CRM",
        "createdAt": "2025-01-14T15:30:00Z"
      }
    ],
    "totalResults": 2,
    "page": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false,
    "limit": 20
  },
  "message": "Leads fetched successfully"
}
```

### What to Verify
- ✅ Both platform and CRM leads appear
- ✅ No duplicate leads (same lead doesn't appear twice)
- ✅ Platform leads have `leadOrigin: "platform"`
- ✅ CRM leads have `isCrmLead: true`
- ✅ Synced platform leads have `crmId` set

---

## Test 2: Get Only Platform Leads

### Request
```http
GET http://localhost:3000/api/v1/lead/all?includeCrmLeads=false&page=1&limit=20
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
```json
{
  "statusCode": 200,
  "data": {
    "leads": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "fullName": "John Doe",
        "email": "john@example.com",
        "leadOrigin": "platform",
        "crmSyncStatus": "synced"
      }
    ],
    "totalResults": 1,
    "page": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false,
    "limit": 20
  },
  "message": "Leads fetched successfully"
}
```

### What to Verify
- ✅ Only platform leads returned
- ✅ No CRM leads in response
- ✅ Faster response time

---

## Test 3: Get Leads with Status Filter

### Request
```http
GET http://localhost:3000/api/v1/lead/all?status=hot&includeCrmLeads=true
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
```json
{
  "statusCode": 200,
  "data": {
    "leads": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "fullName": "John Doe",
        "status": "hot",
        "leadOrigin": "platform"
      }
    ],
    "totalResults": 1
  },
  "message": "Leads fetched successfully"
}
```

### What to Verify
- ✅ Only "hot" status leads returned
- ✅ Filter applied to both platform and CRM leads

---

## Test 4: Create Platform Lead

### Request
```http
POST http://localhost:3000/api/v1/form/submit
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN_HERE

{
  "formId": "507f1f77bcf86cd799439011",
  "fullName": "Test User",
  "email": "test@example.com",
  "company": "Test Company",
  "phone": "+1234567890",
  "message": "Test message"
}
```

### Expected Response
```json
{
  "statusCode": 201,
  "data": {
    "lead": {
      "_id": "507f1f77bcf86cd799439012",
      "fullName": "Test User",
      "email": "test@example.com",
      "leadOrigin": "platform",
      "crmSyncStatus": "not_synced",
      "crmId": null
    }
  },
  "message": "Lead created successfully"
}
```

### What to Verify
- ✅ Lead created with `leadOrigin: "platform"`
- ✅ `crmId` is null initially
- ✅ `crmSyncStatus` is "not_synced"

---

## Test 5: Sync Lead to CRM

### Request
```http
POST http://localhost:3000/api/v1/crm-integration/sync
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN_HERE

{
  "leadIds": ["507f1f77bcf86cd799439012"]
}
```

### Expected Response
```json
{
  "statusCode": 200,
  "data": {
    "successful": [
      {
        "leadId": "507f1f77bcf86cd799439012",
        "crmId": "hubspot_98765",
        "provider": "hubspot",
        "success": true
      }
    ],
    "failed": [],
    "total": 1
  },
  "message": "Leads sync completed"
}
```

### What to Verify
- ✅ Lead successfully synced
- ✅ CRM ID returned
- ✅ No failures

---

## Test 6: Verify No Duplicate After Sync

### Request
```http
GET http://localhost:3000/api/v1/lead/all?includeCrmLeads=true
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
The lead you just synced should appear ONCE with:
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "fullName": "Test User",
  "leadOrigin": "platform",
  "crmId": "hubspot_98765",
  "crmSyncStatus": "synced"
}
```

### What to Verify
- ✅ Lead appears only ONCE
- ✅ Has `crmId` set
- ✅ `crmSyncStatus` is "synced"
- ✅ NOT duplicated from CRM fetch

---

## Test 7: Import Leads from CRM

### Request
```http
GET http://localhost:3000/api/v1/crm-integration/import
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
```json
{
  "statusCode": 200,
  "data": {
    "imported": 5,
    "updated": 2,
    "skipped": 3,
    "total": 10
  },
  "message": "Leads imported from CRM successfully"
}
```

### What to Verify
- ✅ Leads imported successfully
- ✅ Platform-originated leads were skipped
- ✅ Only CRM-native leads imported

---

## Test 8: Get Leads with Pagination

### Request
```http
GET http://localhost:3000/api/v1/lead/all?page=1&limit=5&includeCrmLeads=true
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
```json
{
  "statusCode": 200,
  "data": {
    "leads": [/* 5 leads */],
    "totalResults": 25,
    "page": 1,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false,
    "limit": 5
  }
}
```

### What to Verify
- ✅ Correct page returned
- ✅ Pagination info accurate
- ✅ Merged leads paginated correctly

---

## Test 9: Check CRM Integration Status

### Request
```http
GET http://localhost:3000/api/v1/crm-integration
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
```json
{
  "statusCode": 200,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "provider": "hubspot",
      "status": "active",
      "accountInfo": {
        "accountName": "My HubSpot Account",
        "accountEmail": "user@example.com"
      },
      "tokens": {
        "hasAccessToken": true,
        "hasRefreshToken": true,
        "tokenExpiry": "2025-01-20T10:00:00Z"
      }
    }
  ],
  "message": "CRM integrations fetched successfully"
}
```

### What to Verify
- ✅ CRM integration is active
- ✅ Tokens are valid
- ✅ Not expired

---

## Test 10: Test CRM Connection

### Request
```http
GET http://localhost:3000/api/v1/crm-integration/test/:integrationId
Authorization: Bearer YOUR_TOKEN_HERE
```

### Expected Response
```json
{
  "statusCode": 200,
  "data": {
    "success": true,
    "userInfo": {
      "id": "12345",
      "name": "John Admin",
      "email": "admin@example.com"
    }
  },
  "message": "CRM connection test successful"
}
```

### What to Verify
- ✅ Connection successful
- ✅ User info returned
- ✅ No errors

---

## Postman Collection

### Environment Variables
```json
{
  "base_url": "http://localhost:3000",
  "token": "YOUR_JWT_TOKEN_HERE",
  "lead_id": "507f1f77bcf86cd799439011",
  "crm_integration_id": "507f1f77bcf86cd799439013"
}
```

### Collection Structure
```
Bidirectional Lead Sync Tests
│
├── Get All Leads (With CRM)
├── Get All Leads (Platform Only)
├── Get Leads (Filtered by Status)
├── Create New Lead
├── Sync Lead to CRM
├── Verify No Duplicates
├── Import from CRM
├── Paginated Leads
├── Check CRM Status
└── Test CRM Connection
```

---

## cURL Examples

### Get All Leads
```bash
curl -X GET "http://localhost:3000/api/v1/lead/all?includeCrmLeads=true&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get Platform Leads Only
```bash
curl -X GET "http://localhost:3000/api/v1/lead/all?includeCrmLeads=false" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Sync Lead to CRM
```bash
curl -X POST "http://localhost:3000/api/v1/crm-integration/sync" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "leadIds": ["507f1f77bcf86cd799439011"]
  }'
```

### Import from CRM
```bash
curl -X GET "http://localhost:3000/api/v1/crm-integration/import" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Common Issues and Solutions

### Issue: Getting 401 Unauthorized
**Solution:** Ensure your token is valid and not expired

### Issue: CRM leads not appearing
**Solutions:**
1. Check CRM integration status
2. Verify `includeCrmLeads=true`
3. Test CRM connection
4. Check token expiry

### Issue: Seeing duplicates
**Solutions:**
1. Verify `crmId` is set on synced leads
2. Check deduplication logic in logs
3. Ensure lead origin is correctly set

### Issue: Slow response
**Solutions:**
1. Reduce limit parameter
2. Use `includeCrmLeads=false` for faster queries
3. Check CRM API rate limits

---

## Expected Performance

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Get Platform Leads Only | 50-200ms | Fast, database only |
| Get Leads with CRM | 500-2000ms | Depends on CRM API |
| Sync to CRM | 300-1000ms | Per lead |
| Import from CRM | 2-10s | Depends on volume |

---

## Success Criteria

✅ All tests pass without errors
✅ No duplicate leads in responses
✅ CRM leads properly identified with `isCrmLead: true`
✅ Platform leads properly tracked with `leadOrigin: "platform"`
✅ Synced leads have `crmId` field populated
✅ Pagination works correctly with merged leads
✅ Filters apply to both platform and CRM leads
✅ Performance is acceptable (<2s for combined fetch)
