import { Router } from "express";
import {
  assignLeadToUser,
  assignLeadsToUserBulk,
  getTeamMembersForAssignment,
} from "../controllers/lead.controller.js";
import { verifyAPIKey, verifyAPIKeyWithRateLimit } from "../middlewares/apiKey.middleware.js";
import { injectTenantConnection } from "../middlewares/tenant.middleware.js";

const router = Router();

/**
 * Automation Team API Routes
 * 
 * These routes allow automation team to perform lead assignment operations
 * without JWT authentication using API Key instead.
 * 
 * All routes require:
 * - Header: X-API-Key: <your-api-key>
 * - Header: X-Company-ID: <company-id>
 * 
 * Example headers:
 * X-API-Key: abc123def456ghi789
 * X-Company-ID: 507f1f77bcf86cd799439011
 */

// ================================================
// API Key Authentication (No JWT required)
// ================================================
router.use(verifyAPIKey, injectTenantConnection);

// ================================================
// Lead Assignment Routes
// ================================================

/**
 * Get available team members for this company
 * 
 * GET /api/v1/automation/team-members
 * 
 * Headers:
 *   X-API-Key: your-api-key
 *   X-Company-ID: your-company-id
 * 
 * Response:
 * {
 *   "statusCode": 200,
 *   "data": {
 *     "totalMembers": 5,
 *     "teamMembers": [
 *       { "userId": "...", "fullName": "John Doe", "email": "john@company.com" },
 *       { "userId": "...", "fullName": "Jane Smith", "email": "jane@company.com" }
 *     ]
 *   },
 *   "message": "Team members fetched successfully"
 * }
 */
router.route("/team-members").get(getTeamMembersForAssignment);

/**
 * Assign a single lead to a team member
 * 
 * POST /api/v1/automation/assign-lead
 * 
 * Headers:
 *   X-API-Key: your-api-key
 *   X-Company-ID: your-company-id
 *   Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "leadId": "507f1f77bcf86cd799439012",
 *   "assignedToUserId": "507f1f77bcf86cd799439011",
 * }
 * 
 * Response:
 * {
 *   "statusCode": 200,
 *   "data": {
 *     "leadId": "507f1f77bcf86cd799439012",
 *     "assignedTo": "507f1f77bcf86cd799439011",
 *     "assignmentDate": "2025-12-26T10:30:00Z",
 *     "status": "assigned"
 *   },
 *   "message": "Lead assigned successfully"
 * }
 */
router.route("/assign-lead").post(assignLeadToUser);

/**
 * Assign multiple leads to a team member in bulk
 * 
 * POST /api/v1/automation/assign-leads-bulk
 * 
 * Headers:
 *   X-API-Key: your-api-key
 *   X-Company-ID: your-company-id
 *   Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "leadIds": [
 *     "507f1f77bcf86cd799439012",
 *     "507f1f77bcf86cd799439013",
 *     "507f1f77bcf86cd799439014"
 *   ],
 *   "assignedToUserId": "507f1f77bcf86cd799439011",
 *   "notes": "Leads from LinkedIn campaign"
 * }
 * 
 * Response:
 * {
 *   "statusCode": 200,
 *   "data": {
 *     "totalProcessed": 3,
 *     "successfullyAssigned": 3,
 *     "failedCount": 0,
 *     "assignedToUserId": "507f1f77bcf86cd799439011",
 *     "assignmentDate": "2025-12-26T10:30:00Z"
 *   },
 *   "message": "Successfully assigned 3 leads"
 * }
 */
router.route("/assign-leads-bulk").post(assignLeadsToUserBulk);

export default router;
