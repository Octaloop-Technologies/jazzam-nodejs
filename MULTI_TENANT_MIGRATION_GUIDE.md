# Multi-Tenant Database Migration Guide

## Overview
This project has been refactored to support multi-tenancy with isolated databases per tenant, following this architecture:

```
MongoDB Server
├── jazzaam_company_{tenantId}    (Isolated tenant databases)
│   ├── leads
│   ├── forms
│   ├── dealhealths
│   ├── engagementhistories
│   ├── followups
│   ├── nextbestactions
│   └── notifications
│
└── jazzaam_system                (Shared system database)
    ├── companies
    ├── invitations
    ├── billinghistories
    ├── auditlogs
    ├── services
    ├── waitlists
    ├── contactus
    ├── otps
    └── crmintegrations
```

## ✅ Completed Changes

### 1. Database Connection Management
- **Created**: `src/db/tenantConnection.js`
  - Connection pooling for tenant databases
  - Automatic cleanup of idle connections
  - Maximum pool size: 50 connections
  - Cleanup interval: 5 minutes

- **Created**: `src/models/tenantModelFactory.js`
  - Model caching per tenant
  - Dynamic model creation
  - Cache cleanup utilities

### 2. Model Refactoring

#### System Models (Default Connection)
✅ Updated to use default mongoose connection:
- `company.model.js` - User/company accounts
- `invitation.model.js` - Team invitations
- `billingHistory.model.js` - Billing records
- `auditLogs.model.js` - System audit logs
- `services.model.js` - Service catalog
- `waitlist.model.js` - Waitlist signups
- `contactUs.model.js` - Contact form submissions
- `otp.model.js` - OTP verification
- `crmIntegration.model.js` - CRM configuration

#### Tenant Models (Per-Tenant Connection)
✅ Converted to schema exports only:
- `lead.model.js` → `leadSchema`
- `form.model.js` → `formSchema`
- `dealHealth.model.js` → `dealHealthSchema`
- `engagementHistory.model.js` → `engagementHistorySchema`
- `followUp.model.js` → `FollowUpLeadSchema`
- `nextBestAction.model.js` → `nextBestActionSchema`
- `notifications.model.js` → `NotiifcationSchema`

✅ Removed `companyId` references from tenant models since DB isolation provides separation

### 3. Model Registry
✅ **Created**: `src/models/index.js`
- Central export for all models
- `getTenantModels(tenantConnection)` helper function
- Simplifies imports in controllers

### 4. Middleware Updates
✅ **Updated**: `src/middlewares/tenant.middleware.js`
- `injectTenantConnection` - Injects tenant DB connection after authentication
- `validateTenantAccess` - Validates resource access (simplified, no companyId checks needed)

### 5. Controller Updates

#### Lead Controller (`lead.controller.js`)
✅ Partially Updated:
- `getLeads()` - ✅ Uses tenant models
- `getLeadById()` - ✅ Uses tenant models
- `updateLeadById()` - ✅ Uses tenant models, removed companyId filter
- `searchLeads()` - ✅ Uses tenant models
- `updateLeadStatus()` - ✅ Uses tenant models
- `getLeadStats()` - ✅ Uses tenant models, removed companyId aggregation
- `deleteLead()` - ✅ Uses tenant models
- `createLeadFollowup()` - ✅ Uses tenant models
- `followUpEmail()` - ✅ Uses tenant models
- `followUpLeads()` - ✅ Uses tenant models, removed companyId filter
- `scheduleFollowUpLeads()` - ✅ Uses tenant models
- `exportLeadsExcel()` - ✅ Uses tenant models
- `qualifyLeadBANT()` - ✅ Uses tenant models
- `batchQualifyLeadsBANT()` - ✅ Uses tenant models

#### Form Controller (`form.controller.js`)
✅ Partially Updated:
- `createPlatformForm()` - ✅ Uses tenant models
- `getPlatformForms()` - ✅ Uses tenant models
- `getAvailablePlatforms()` - ✅ Uses tenant models
- `submitFormData()` - ⚠️ Needs special handling (public endpoint)

## ⚠️ Remaining Tasks

### 1. Complete Controller Updates

#### Controllers needing updates:
- ❌ `company.controller.js` - Mixed system and tenant model usage
- ❌ `dealHealth.controller.js` - Uses tenant models
- ❌ `nextBestAction.controller.js` - Uses tenant models  
- ❌ `crmIntegration.controller.js` - Uses both system and tenant models
- ❌ `notifications.controller.js` - Uses tenant models

### 2. Public Form Submission Endpoint
⚠️ **Critical Issue**: `submitFormData()` in form.controller.js

**Problem**: Public form submissions don't have authentication context

**Solutions**:
1. **Option A (Recommended)**: Encode tenantId in the form embed URL
   ```javascript
   // In form.generateEmbedCode()
   this.embedUrl = `${baseUrl}/form/${this.companyId}/${this.accessToken}`;
   ```

2. **Option B**: Create a system-wide form lookup table
   ```javascript
   // Create a new collection in system DB mapping accessToken → tenantId
   const formLookup = { accessToken, tenantId, formId }
   ```

3. **Option C**: Accept tenantId in query parameter (current temporary solution)
   ```javascript
   GET /api/forms/submit/:accessToken?tenantId=507f1f77bcf86cd799439011
   ```

### 3. Service Layer Updates

Services needing tenant context:
- ❌ `bantService` - Needs tenant connection for Lead model
- ❌ `dealHealthService` - Needs tenant connection
- ❌ `emailService` - Mixed (sends emails, but reads tenant data)
- ❌ `scrapingService` - Works with external APIs, needs tenant context for saving
- ❌ `crm/sync.service.js` - Needs tenant connection to sync leads

**Recommended Pattern**:
```javascript
// In service methods
async function qualifyLead(tenantConnection, leadId) {
  const { Lead } = getTenantModels(tenantConnection);
  const lead = await Lead.findById(leadId);
  // ... service logic
}

// In controller
const result = await bantService.qualifyLead(req.tenantConnection, leadId);
```

### 4. Route Updates

#### Routes needing middleware:
- ✅ Most routes already use `verifyJWT` which provides `req.company`
- ⚠️ Add `injectTenantConnection` middleware after `verifyJWT` for tenant resource routes

**Example Pattern**:
```javascript
// src/routes/lead.routes.js
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { injectTenantConnection } from "../middlewares/tenant.middleware.js";

router.use(verifyJWT, injectTenantConnection); // Apply to all routes

router.get("/", getLeads);
router.get("/:id", getLeadById);
// ... rest of routes
```

#### Routes to update:
- ❌ `lead.routes.js`
- ❌ `form.routes.js`
- ❌ `dealHealth.routes.js`
- ❌ `nextBestAction.routes.js`
- ❌ `notification.routes.js`

### 5. Cron Jobs & Background Tasks

#### Jobs needing tenant iteration:
- ❌ `scheduledLeads()` in lead.controller.js
  - Currently queries all followups
  - Needs to iterate over all tenant databases
  
**Recommended Pattern**:
```javascript
import { getConnectionPoolStats } from "../db/tenantConnection.js";
import { getTenantModels } from "../models/index.js";

async function scheduledLeads() {
  // Get all active tenants
  const companies = await Company.find({ isActive: true });
  
  for (const company of companies) {
    const tenantConnection = await getTenantConnection(company._id.toString());
    const { FollowUp, Lead } = getTenantModels(tenantConnection);
    
    // Process followups for this tenant
    const followUps = await FollowUp.find({ status: "scheduled" });
    // ... process
  }
}
```

### 6. Testing Requirements

#### Critical Test Cases:
1. **Tenant Isolation**
   - Create leads in Tenant A
   - Verify Tenant B cannot see them
   - Verify queries don't leak across tenants

2. **Connection Pool**
   - Test with 50+ concurrent tenant requests
   - Verify cleanup works properly
   - Check for memory leaks

3. **Public Form Submission**
   - Test form submission without auth
   - Verify correct tenant DB is used
   - Test duplicate lead prevention

4. **Migration Path**
   - Test migrating existing data from single DB to multi-tenant
   - Verify data integrity

### 7. Migration Script Needed

Create a migration script to move existing data:

```javascript
// scripts/migrate-to-multitenant.js
async function migrateToMultiTenant() {
  // 1. Get all companies from system DB
  const companies = await Company.find();
  
  for (const company of companies) {
    const tenantId = company._id.toString();
    const tenantConnection = await getTenantConnection(tenantId);
    
    // 2. Migrate leads for this company
    const leads = await OldLead.find({ companyId: company._id });
    const { Lead } = getTenantModels(tenantConnection);
    for (const lead of leads) {
      const { companyId, ...leadData } = lead.toObject();
      await Lead.create(leadData);
    }
    
    // 3. Migrate forms, dealHealths, etc.
    // ...
  }
}
```

## 📝 Usage Examples

### In Controllers
```javascript
import { getTenantModels } from "../models/index.js";

const someController = asyncHandler(async (req, res) => {
  // Get tenant models (req.tenantConnection injected by middleware)
  const { Lead, Form, DealHealth } = getTenantModels(req.tenantConnection);
  
  // Use models normally (NO companyId needed in queries!)
  const leads = await Lead.find({ status: "new" });
  const forms = await Form.find();
  
  // ... rest of logic
});
```

### In Services
```javascript
// Pass tenant connection to services
async function someService(tenantConnection, params) {
  const { Lead } = getTenantModels(tenantConnection);
  const lead = await Lead.findById(params.leadId);
  return lead;
}

// Call from controller
const result = await someService(req.tenantConnection, { leadId: "..." });
```

### In Routes
```javascript
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { injectTenantConnection } from "../middlewares/tenant.middleware.js";

// Apply middleware to all tenant-specific routes
router.use(verifyJWT, injectTenantConnection);

router.get("/leads", leadController.getLeads);
router.post("/leads", leadController.createLead);
```

## 🚨 Breaking Changes

1. **Model Imports**
   - ❌ Old: `import { Lead } from "../models/lead.model.js"`
   - ✅ New: `const { Lead } = getTenantModels(req.tenantConnection)`

2. **Queries**
   - ❌ Old: `Lead.find({ companyId: req.company._id })`
   - ✅ New: `Lead.find({})` // companyId not needed!

3. **Model Creation**
   - ❌ Old: `Lead.create({ companyId, ...data })`
   - ✅ New: `Lead.create({ ...data })` // no companyId

4. **Aggregations**
   - ❌ Old: `Lead.aggregate([{ $match: { companyId } }])`
   - ✅ New: `Lead.aggregate([{ $match: {} }])`

## 📊 Performance Considerations

1. **Connection Pool Size**: Adjust `MAX_POOL_SIZE` in tenantConnection.js based on:
   - Number of concurrent users
   - Number of active tenants
   - Available MongoDB connections

2. **Model Cache**: Models are cached per tenant to avoid recreation

3. **Index Strategy**: Each tenant DB should have proper indexes
   ```javascript
   // Indexes are defined in schemas and automatically created per tenant
   leadSchema.index({ status: 1, createdAt: -1 });
   ```

## 🔐 Security Benefits

1. **Complete Data Isolation**: Each tenant has a separate database
2. **No Query-Level Filtering Needed**: DB isolation prevents cross-tenant data leaks
3. **Easier Compliance**: Tenant data is physically separated
4. **Simpler Access Control**: No need for complex multi-tenant queries

## 🎯 Next Steps

1. ✅ Complete remaining controller updates
2. ✅ Update all service methods to accept tenantConnection
3. ✅ Add middleware to all tenant-specific routes
4. ✅ Solve public form submission tenant detection
5. ✅ Update background jobs for multi-tenant
6. ✅ Create data migration script
7. ✅ Add comprehensive tests
8. ✅ Update API documentation

## 📚 Additional Resources

- [MongoDB Multi-Tenancy Best Practices](https://www.mongodb.com/blog/post/building-with-patterns-a-summary)
- [Mongoose Multi-Tenant Architecture](https://mongoosejs.com/docs/discriminators.html)
- Connection pooling: `src/db/tenantConnection.js`
- Model factory: `src/models/tenantModelFactory.js`
