# Quick Reference Guide - Multi-Tenant Development

## 🚀 Quick Start for Developers

### Before You Start
This codebase now uses **isolated databases per tenant** (company). Each company gets their own MongoDB database.

### Database Architecture
```
System DB (shared):      jazzaam_system
Tenant DB (isolated):    jazzaam_company_{companyId}
```

---

## 📚 Model Categories

### System Models (Shared - jazzaam_system)
Use these directly - they're shared across all tenants:
```javascript
import { Company, Invitation, AuditLogs, CrmIntegration } from "../models/index.js";

// Use directly
const company = await Company.findById(id);
const invitation = await Invitation.create({...});
```

**List**: Company, Invitation, BillingHistory, AuditLogs, Services, Waitlist, ContactUs, OTP, CrmIntegration

### Tenant Models (Isolated per company)
These are **tenant-specific** - get them from tenant connection:
```javascript
import { getTenantModels } from "../models/index.js";

// In controller (after middleware injects req.tenantConnection)
const { Lead, Form, DealHealth } = getTenantModels(req.tenantConnection);

// Use normally
const leads = await Lead.find({ status: "new" });
```

**List**: Lead, Form, DealHealth, EngagementHistory, FollowUp, NextBestAction, Notification

---

## 🛠️ Writing Controllers

### Template for Tenant-Specific Controllers
```javascript
import { asyncHandler } from "../utils/asyncHandler.js";
import { getTenantModels } from "../models/index.js";

export const myController = asyncHandler(async (req, res) => {
  // ✅ Get tenant models
  const { Lead, Form } = getTenantModels(req.tenantConnection);
  
  // ✅ Query WITHOUT companyId (isolation is automatic!)
  const leads = await Lead.find({ status: "new" });
  
  // ❌ DON'T DO THIS (old way):
  // const leads = await Lead.find({ companyId: req.company._id });
  
  return res.status(200).json({ leads });
});
```

### Template for Mixed (System + Tenant) Controllers
```javascript
import { asyncHandler } from "../utils/asyncHandler.js";
import { getTenantModels } from "../models/index.js";
import { Company } from "../models/index.js"; // System model

export const myController = asyncHandler(async (req, res) => {
  // System model - use directly
  const company = await Company.findById(req.company._id);
  
  // Tenant models - get from connection
  const { Lead, Form } = getTenantModels(req.tenantConnection);
  const leads = await Lead.find({ status: "new" });
  
  return res.status(200).json({ company, leads });
});
```

---

## 🛣️ Setting Up Routes

### For Tenant-Specific Resources
```javascript
import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { injectTenantConnection } from "../middlewares/tenant.middleware.js";

const router = Router();

// ⚠️ IMPORTANT: Apply BOTH middlewares for tenant routes
router.use(verifyJWT, injectTenantConnection);

router.get("/leads", getLeads);
router.post("/leads", createLead);

export default router;
```

### For System Resources (Company, Auth, etc.)
```javascript
import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// ✅ Only verifyJWT needed (no tenant context)
router.use(verifyJWT);

router.get("/profile", getProfile);
router.put("/settings", updateSettings);

export default router;
```

---

## 🔧 Updating Services

### Old Pattern (Don't use)
```javascript
❌ async function qualifyLead(leadId) {
  const Lead = mongoose.model('Lead');
  const lead = await Lead.findById(leadId);
  // ...
}
```

### New Pattern (Use this)
```javascript
✅ async function qualifyLead(tenantConnection, leadId) {
  const { Lead } = getTenantModels(tenantConnection);
  const lead = await Lead.findById(leadId);
  // ...
}

// Call from controller
const result = await bantService.qualifyLead(req.tenantConnection, leadId);
```

---

## 🚫 Common Mistakes to Avoid

### ❌ Mistake 1: Filtering by companyId
```javascript
// ❌ DON'T DO THIS - companyId not needed!
const leads = await Lead.find({ companyId: req.company._id });

// ✅ DO THIS - tenant isolation is automatic
const leads = await Lead.find({});
```

### ❌ Mistake 2: Importing tenant models directly
```javascript
// ❌ DON'T DO THIS
import { Lead } from "../models/lead.model.js";
const leads = await Lead.find();

// ✅ DO THIS
const { Lead } = getTenantModels(req.tenantConnection);
const leads = await Lead.find();
```

### ❌ Mistake 3: Including companyId in create
```javascript
// ❌ DON'T DO THIS
const lead = await Lead.create({
  companyId: req.company._id,
  name: "John",
  ...
});

// ✅ DO THIS - NO companyId field!
const lead = await Lead.create({
  name: "John",
  ...
});
```

### ❌ Mistake 4: Forgetting tenant middleware
```javascript
// ❌ DON'T DO THIS
router.use(verifyJWT); // Missing injectTenantConnection!
router.get("/leads", getLeads);

// ✅ DO THIS
router.use(verifyJWT, injectTenantConnection);
router.get("/leads", getLeads);
```

---

## 📝 Cheat Sheet

### Get Tenant Models
```javascript
const { Lead, Form, DealHealth, EngagementHistory, FollowUp, NextBestAction, Notification } = getTenantModels(req.tenantConnection);
```

### Get System Models
```javascript
import { Company, Invitation, AuditLogs, BillingHistory, Services, Waitlist, ContactUs, OTP, CrmIntegration } from "../models/index.js";
```

### Query Patterns
```javascript
// ✅ Tenant models - NO companyId
await Lead.find({ status: "new" });
await Form.findById(formId);
await DealHealth.aggregate([...]);

// ✅ System models - with company reference when needed
await Company.findById(companyId);
await Invitation.find({ senderCompany: companyId });
```

### Aggregations
```javascript
// ❌ Old way
await Lead.aggregate([
  { $match: { companyId: req.company._id, status: "new" } }
]);

// ✅ New way - NO companyId in $match
await Lead.aggregate([
  { $match: { status: "new" } }
]);
```

---

## 🔍 Debugging Tips

### Check if middleware is applied
```javascript
// In your controller
console.log("Tenant ID:", req.tenantId);
console.log("Tenant Connection:", req.tenantConnection?.name);

// Should output:
// Tenant ID: 507f1f77bcf86cd799439011
// Tenant Connection: jazzaam_company_507f1f77bcf86cd799439011
```

### Verify correct database
```javascript
const { Lead } = getTenantModels(req.tenantConnection);
console.log("Using database:", Lead.db.name);

// Should output: jazzaam_company_507f1f77bcf86cd799439011
```

### Check connection pool
```javascript
import { getConnectionPoolStats } from "../db/tenantConnection.js";

const stats = getConnectionPoolStats();
console.log(stats);
// Shows active connections, pool size, etc.
```

---

## 🧪 Testing Your Changes

### Test Tenant Isolation
```javascript
// 1. Create lead as Company A
const leadA = await Lead.create({ name: "Test" });

// 2. Switch to Company B context (different tenant connection)
// 3. Try to find lead from Company A
const leadB = await Lead.findById(leadA._id);

// ✅ Should be null - data is isolated!
console.assert(leadB === null, "Tenant isolation failed!");
```

---

## 📚 Where to Find More Info

- **Full Guide**: `MULTI_TENANT_MIGRATION_GUIDE.md`
- **Implementation Status**: `IMPLEMENTATION_SUMMARY.md`
- **Tenant Connection**: `src/db/tenantConnection.js`
- **Model Factory**: `src/models/tenantModelFactory.js`
- **Model Registry**: `src/models/index.js`
- **Middleware**: `src/middlewares/tenant.middleware.js`

---

## ⚡ Quick Migration Checklist for Existing Code

When updating old controllers/services:

- [ ] Remove `import` statements for tenant models
- [ ] Add `import { getTenantModels } from "../models/index.js"`
- [ ] Get models with `getTenantModels(req.tenantConnection)`
- [ ] Remove all `companyId` from queries
- [ ] Remove all `companyId` from `.create()` calls
- [ ] Remove all `companyId` from aggregation `$match` stages
- [ ] Verify routes have `injectTenantConnection` middleware
- [ ] Update service calls to pass `tenantConnection`
- [ ] Test thoroughly!

---

## 🆘 Need Help?

1. Check if middleware is applied to your route
2. Verify you're using `getTenantModels()` not direct imports
3. Check that you removed `companyId` from queries
4. Look at `lead.controller.js` for working examples
5. Review the migration guide

**Remember**: The key benefit is **you don't need to worry about companyId anymore** - database isolation handles that automatically! 🎉
