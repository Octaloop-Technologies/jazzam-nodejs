   /**
 * Centralized Model Registry
 * Separates System Models (shared DB) from Tenant Models (isolated DBs)
 */

import { getTenantModel } from "./tenantModelFactory.js";

// ============================================
// SYSTEM MODELS (jazzaam_system database)
// ============================================
// These models use the default mongoose connection
export { Company } from "./company.model.js";
export { Invitation } from "./invitation.model.js";
export { BillingHistory } from "./billingHistory.model.js";
export { AuditLogs } from "./auditLogs.model.js";
export { Services } from "./services.model.js";
export { Waitlist } from "./waitlist.model.js";
export { ContactUs } from "./contactUs.model.js";
export { OTP } from "./otp.model.js";
export { CrmIntegration } from "./crmIntegration.model.js";

// ============================================
// TENANT MODEL SCHEMAS
// ============================================
// These are schemas only - actual models created per tenant
export { leadSchema } from "./lead.model.js";
export { formSchema } from "./form.model.js";
export { dealHealthSchema } from "./dealHealth.model.js";
export { engagementHistorySchema } from "./engagementHistory.model.js";
export { FollowUpLeadSchema } from "./followUp.model.js";
export { nextBestActionSchema } from "./nextBestAction.model.js";
export { NotiifcationSchema } from "./notifications.model.js";

/**
 * Helper function to get tenant-specific models
 * Usage in controllers:
 * const { Lead, Form, DealHealth } = getTenantModels(req.tenantConnection);
 */
export function getTenantModels(tenantConnection) {
  if (!tenantConnection) {
    throw new Error("Tenant connection is required. Ensure tenant middleware is applied.");
  }

  // Verify connection is in ready state
  if (tenantConnection.readyState !== 1) {
    throw new Error(
      `Tenant connection not ready (state: ${tenantConnection.readyState}). ` +
      `Expected state: 1 (connected), got: ${getReadyStateText(tenantConnection.readyState)}`
    );
  }

  return {
    Lead: getTenantModel(tenantConnection, "Lead", leadSchema),
    Form: getTenantModel(tenantConnection, "Form", formSchema),
    DealHealth: getTenantModel(tenantConnection, "DealHealth", dealHealthSchema),
    EngagementHistory: getTenantModel(tenantConnection, "EngagementHistory", engagementHistorySchema),
    FollowUp: getTenantModel(tenantConnection, "FollowUp", FollowUpLeadSchema),
    NextBestAction: getTenantModel(tenantConnection, "NextBestAction", nextBestActionSchema),
    Notification: getTenantModel(tenantConnection, "Notification", NotiifcationSchema),
  };
}

/**
 * Get connection ready state as text
 */
function getReadyStateText(state) {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  return states[state] || "unknown";
}

/**
 * Import all schemas individually for services that need them
 */
import { leadSchema } from "./lead.model.js";
import { formSchema } from "./form.model.js";
import { dealHealthSchema } from "./dealHealth.model.js";
import { engagementHistorySchema } from "./engagementHistory.model.js";
import { FollowUpLeadSchema } from "./followUp.model.js";
import { nextBestActionSchema } from "./nextBestAction.model.js";
import { NotiifcationSchema } from "./notifications.model.js";
