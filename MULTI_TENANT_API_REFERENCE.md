# Multi-Tenant API Reference Guide

Quick reference for updated service method signatures in the multi-tenant architecture.

---

## 🎯 Deal Health Service

**File:** [`src/services/dealHealth.service.js`](src/services/dealHealth.service.js)

```javascript
import dealHealthService from './services/dealHealth.service.js';

// Log an engagement event
await dealHealthService.logEngagement(
  tenantConnection,    // Required: Tenant database connection
  leadId,             // Required: Lead ObjectId
  engagementData      // Required: { engagementType, emailMetrics, etc. }
);

// Calculate deal health score
const dealHealth = await dealHealthService.calculateDealHealth(
  tenantConnection,    // Required: Tenant database connection
  leadId              // Required: Lead ObjectId
);

// Get engagement history
const engagements = await dealHealthService.getEngagementHistory(
  tenantConnection,    // Required: Tenant database connection
  leadId,             // Required: Lead ObjectId
  days                // Optional: Number of days (default: 90)
);

// Get dashboard metrics
const metrics = await dealHealthService.getDashboardMetrics(
  tenantConnection    // Required: Tenant database connection
);

// Batch calculate health for multiple leads
const result = await dealHealthService.batchCalculateHealth(
  tenantConnection,    // Required: Tenant database connection
  leadIds             // Optional: Array of lead IDs (null = all leads)
);
```

---

## 🎯 Next Best Action Service

**File:** [`src/services/nextBestAction.service.js`](src/services/nextBestAction.service.js)

```javascript
import nextBestActionService from './services/nextBestAction.service.js';

// Generate next best action for a lead
const action = await nextBestActionService.generateNextBestAction(
  tenantConnection,    // Required: Tenant database connection
  leadId              // Required: Lead ObjectId
);

// Execute an action
const executedAction = await nextBestActionService.executeAction(
  tenantConnection,    // Required: Tenant database connection
  actionId,           // Required: Action ObjectId
  executedBy,         // Required: User ObjectId
  details             // Optional: { outcome, notes, isEffective, etc. }
);

// Snooze an action
const snoozedAction = await nextBestActionService.snoozeAction(
  tenantConnection,    // Required: Tenant database connection
  actionId,           // Required: Action ObjectId
  days                // Optional: Number of days (default: 3)
);

// Decline an action
const declinedAction = await nextBestActionService.declineAction(
  tenantConnection,    // Required: Tenant database connection
  actionId,           // Required: Action ObjectId
  reason              // Optional: Decline reason string
);

// Get active actions for a lead
const actions = await nextBestActionService.getActiveActions(
  tenantConnection,    // Required: Tenant database connection
  leadId              // Required: Lead ObjectId
);

// Get pending actions for dashboard
const pendingActions = await nextBestActionService.getPendingActions(
  tenantConnection,    // Required: Tenant database connection
  limit               // Optional: Number of actions (default: 20)
);

// Batch generate actions
const result = await nextBestActionService.batchGenerateActions(
  tenantConnection,    // Required: Tenant database connection
  leadIds             // Optional: Array of lead IDs (null = all leads)
);
```

---

## 🎯 CRM Sync Service

**File:** [`src/services/crm/sync.service.js`](src/services/crm/sync.service.js)

```javascript
import {
  syncLeadToCrm,
  syncLeadsToCrm,
  importLeadsFromCrm,
  getSyncStatus,
  retryFailedSyncs,
  autoSyncNewLead
} from './services/crm/sync.service.js';

// Sync a single lead to CRM
const result = await syncLeadToCrm(
  tenantConnection,    // Required: Tenant database connection
  leadId,             // Required: Lead ObjectId
  crmIntegration      // Required: CrmIntegration document
);

// Sync multiple leads to CRM
const results = await syncLeadsToCrm(
  tenantConnection,    // Required: Tenant database connection
  leadIds,            // Required: Array of lead ObjectIds
  crmIntegration      // Required: CrmIntegration document
);

// Import leads from CRM
const importResults = await importLeadsFromCrm(
  tenantConnection,    // Required: Tenant database connection
  crmIntegration,     // Required: CrmIntegration document
  options             // Optional: { limit, offset, filters }
);

// Auto-sync new lead (gets tenant connection internally)
const syncResult = await autoSyncNewLead(
  lead,               // Required: Lead document
  companyId           // Required: Company ObjectId
);

// Get sync status (gets tenant connection internally)
const status = await getSyncStatus(
  companyId           // Required: Company ObjectId
);

// Retry failed syncs (gets tenant connection internally)
const retryResults = await retryFailedSyncs(
  companyId           // Required: Company ObjectId
);
```

---

## 🎯 Controller Usage Examples

### **In Authenticated Routes (with Tenant Middleware)**

```javascript
import { asyncHandler } from '../utils/asyncHandler.js';
import { getTenantModels } from '../models/index.js';
import dealHealthService from '../services/dealHealth.service.js';

// Example: Get lead health
const getLeadHealth = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  
  // tenantConnection is injected by middleware
  const dealHealth = await dealHealthService.calculateDealHealth(
    req.tenantConnection,
    leadId
  );
  
  res.json({ success: true, data: dealHealth });
});

// Example: Query tenant-specific data
const getLeads = asyncHandler(async (req, res) => {
  // Get tenant-specific models
  const { Lead } = getTenantModels(req.tenantConnection);
  
  // Query without companyId - database isolation provides separation!
  const leads = await Lead.find({ status: 'active' });
  
  res.json({ success: true, data: leads });
});
```

### **In Public Routes (Manual Tenant Detection)**

```javascript
import { getTenantConnection } from '../db/tenantConnection.js';
import { getTenantModels } from '../models/index.js';

// Example: Public form submission
const submitForm = asyncHandler(async (req, res) => {
  const { accessToken } = req.params;
  const tenantId = req.query.tenantId; // From form embed URL
  
  if (!tenantId) {
    throw new ApiError(400, 'Tenant ID required');
  }
  
  // Get tenant connection manually
  const tenantConnection = await getTenantConnection(tenantId);
  const { Form, Lead } = getTenantModels(tenantConnection);
  
  // Now work with tenant-specific models
  const form = await Form.findOne({ accessToken });
  const lead = await Lead.create({ ...formData });
  
  res.json({ success: true, data: { leadId: lead._id } });
});
```

---

## 🎯 Getting Tenant Connection

### **Option 1: From Middleware (Recommended)**
```javascript
// In controllers with authentication
const tenantConnection = req.tenantConnection; // Injected by middleware
const tenantId = req.tenantId; // Also available
const companyId = req.company._id; // Company document
```

### **Option 2: Manual (For Public Endpoints)**
```javascript
import { getTenantConnection } from '../db/tenantConnection.js';

const tenantId = req.query.tenantId || req.body.tenantId;
const tenantConnection = await getTenantConnection(tenantId);
```

---

## 🎯 Working with Tenant Models

```javascript
import { getTenantModels } from '../models/index.js';

// Get all tenant-specific models at once
const {
  Lead,
  Form,
  DealHealth,
  EngagementHistory,
  FollowUp,
  NextBestAction,
  Notification
} = getTenantModels(tenantConnection);

// Use models normally - they're automatically scoped to tenant DB
const leads = await Lead.find({});
const forms = await Form.find({ status: 'active' });
const dealHealths = await DealHealth.find({}).populate('leadId');

// NO companyId filters needed! 🎉
```

---

## 🎯 Form Embed URLs

### **Format**
```
https://api.jazzaam.com/api/v1/forms/submit/{accessToken}?tenantId={tenantId}
```

### **How It Works**
1. Form is created with tenant-specific access token
2. `tenantId` is automatically appended to embed URL
3. Public submission endpoint extracts `tenantId` from URL
4. System gets correct tenant database connection
5. Lead is created in the correct tenant database

### **Example**
```html
<form action="https://api.jazzaam.com/api/v1/forms/submit/abc123?tenantId=507f1f77bcf86cd799439011" method="POST">
  <!-- Form fields -->
</form>
```

---

## 🎯 Common Patterns

### **Pattern 1: Service Call from Controller**
```javascript
const myController = asyncHandler(async (req, res) => {
  // Option A: Pass req.tenantConnection
  await someService.method(req.tenantConnection, ...args);
  
  // Option B: Get models and query directly
  const { Model } = getTenantModels(req.tenantConnection);
  const data = await Model.find({});
  
  res.json({ success: true, data });
});
```

### **Pattern 2: Background Job with Tenant Context**
```javascript
const processLeadInBackground = async (leadId, companyId) => {
  // Get tenant connection for background job
  const tenantConnection = await getTenantConnection(companyId.toString());
  
  // Use tenant-specific models
  const { Lead } = getTenantModels(tenantConnection);
  const lead = await Lead.findById(leadId);
  
  // Call services with tenant connection
  await dealHealthService.calculateDealHealth(tenantConnection, leadId);
};
```

### **Pattern 3: CRM Integration**
```javascript
const syncToCRM = asyncHandler(async (req, res) => {
  const { leadIds } = req.body;
  
  // Get CRM integration from system DB
  const crmIntegration = await CrmIntegration.findOne({
    companyId: req.company._id,
    status: 'active'
  });
  
  // Get tenant connection
  const tenantConnection = await getTenantConnection(
    req.company._id.toString()
  );
  
  // Sync leads
  const results = await syncLeadsToCrm(
    tenantConnection,
    leadIds,
    crmIntegration
  );
  
  res.json({ success: true, data: results });
});
```

---

## 🎯 Migration from Old Code

### **Before (Old)**
```javascript
// ❌ OLD - Had to pass companyId everywhere
const leads = await Lead.find({ companyId: req.company._id });
await service.method(companyId, leadId, data);
```

### **After (New)**
```javascript
// ✅ NEW - Use tenant connection
const { Lead } = getTenantModels(req.tenantConnection);
const leads = await Lead.find({}); // Automatically scoped!
await service.method(req.tenantConnection, leadId, data);
```

---

## 🎯 Error Handling

```javascript
import { getTenantConnection } from '../db/tenantConnection.js';
import { ApiError } from '../utils/ApiError.js';

const myController = asyncHandler(async (req, res) => {
  try {
    // Validate tenant context exists
    if (!req.tenantConnection) {
      throw new ApiError(400, 'Tenant context required');
    }
    
    // Use tenant connection
    const { Lead } = getTenantModels(req.tenantConnection);
    const leads = await Lead.find({});
    
    res.json({ success: true, data: leads });
  } catch (error) {
    // Handle tenant-specific errors
    if (error.message.includes('tenant')) {
      throw new ApiError(400, 'Invalid tenant context');
    }
    throw error;
  }
});
```

---

## 📊 Performance Tips

1. **Reuse Tenant Connection** - It's cached per company
2. **Batch Operations** - Use batch methods when processing multiple leads
3. **Use Indexes** - Tenant databases have optimized indexes
4. **Connection Pooling** - Each tenant has its own connection pool

---

## 🔒 Security Notes

1. **Middleware Validation** - Always use `tenant.middleware.js` for authenticated routes
2. **Public Endpoints** - Require explicit `tenantId` parameter
3. **No Cross-Tenant Access** - Database-level isolation prevents leaks
4. **Token Validation** - Form access tokens are tenant-specific

---

## ✅ Checklist for New Features

When adding new features:
- [ ] Does the controller use `req.tenantConnection`?
- [ ] Are you using `getTenantModels()` for tenant data?
- [ ] Have you removed any `companyId` filters?
- [ ] Are service calls passing `tenantConnection` as first parameter?
- [ ] Is the tenant middleware applied to the route?
- [ ] Are public endpoints handling `tenantId` properly?

---

**Last Updated:** December 17, 2025  
**Version:** 1.0.0 (Multi-Tenant)
