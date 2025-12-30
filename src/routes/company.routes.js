import { Router } from "express";
import {
  changeCurrentPassword,
  deleteCompany,
  getCurrentCompany,
  googleLoginCallback,
  zohoLogin,
  zohoCallback,
  loginCompany,
  logoutCompany,
  refreshAccessToken,
  registerCompany,
  updateCompanyDetails,
  updateOnboardingStatus,
  updateCompanyLogo,
  updateSubscriptionStatus,
  updateSettings,
  getCompanyDashboard,
  companyTeamsMembers,
  getJoinedCompany,
  deactivateTeamMember,
  activateTeamMember,
  changeCompanyName,
  updateUserType,
  verifyEmail,
  resendVerificationCode,
  completeCompanyOnboarding,
  updateUserAssignLeadsType,
} from "../controllers/company.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import passport from "../config/passport.js";
import { handleOAuthCallback } from "../controllers/crmIntegration.controller.js";

const router = Router();

// ================================================
// Register and Login routes
// ================================================

// POST /api/v1/companies/auth/register
router.route("/auth/register").post(registerCompany);

// POST /api/v1/companies/auth/login
router.route("/auth/login").post(loginCompany);

// POST /api/v1/companies/auth/verify-email
router.route("/auth/verify-email").post(verifyEmail);

// POST /api/v1/companies/auth/resend-verification-code
router.route("/auth/resend-verification-code").post(resendVerificationCode);

// ================================================
// OAuth routes (Google, Zoho)
// ================================================

// GET /api/v1/companies/auth/google
router
  .route("/auth/google")
  .get(passport.authenticate("google", 
    { scope: ["profile", "email"], session: false }));
router.route("/auth/google/callback").get(
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=personal_email`,
    session: false,
  }),
  googleLoginCallback
);

// GET /api/v1/companies/auth/zoho
router.route("/auth/zoho").get(zohoLogin);
router.route("/auth/login/zoho/callback").get(zohoCallback);
router.route("/auth/zoho/callback").get(handleOAuthCallback)

// POST /api/v1/companies/auth/refresh-token
router.route("/auth/refresh-token").post(refreshAccessToken);

// ================================================
// Secured routes
// ================================================

router.use(verifyJWT);

// POST /api/v1/companies/auth/logout
router.route("/auth/logout").post(logoutCompany);

// Get all team members
router.route("/auth/team-members/:id").get(companyTeamsMembers)

// Get joined company
router.route("/auth/joined-company/:id").get(getJoinedCompany)

// Deactivate team member
router.route("/auth/deactivate-member/:id").put(deactivateTeamMember)

// Activate team member
router.route("/auth/activate-member/:id").put(activateTeamMember);

// Change company name
router.route("/auth/change-name/:id").patch(changeCompanyName)

// Change assigned leads type
router.route("/auth/change-assigned-leads-type/:id").patch(updateUserAssignLeadsType)

// GET /api/v1/auth/companies/:id
router.route("/:id").get(getCompanyDashboard)

// POST /api/v1/companies/auth/change-password
router.route("/auth/change-password").post(changeCurrentPassword);

// GET /api/v1/companies/auth/current-company
router.route("/auth/current-company").get(getCurrentCompany);

// PATCH /api/v1/companies/auth/update-company
router.route("/auth/update-company").patch(updateCompanyDetails);

// PATCH /api/v1/companies/auth/onboarding
router.route("/auth/onboarding").patch(updateOnboardingStatus);

// PATCH /api/v1/companies/auth/companyOnboarding
router.route("/auth/company-onboarding").patch(completeCompanyOnboarding);


// PATCH /api/v1/companies/auth/update-user-type
router.route("/auth/update-user-type/:id").patch(updateUserType)

// ================================================
// Company settings routes
// ================================================

// PATCH /api/v1/companies/logo
router
  .route("/logo")
  .patch(verifyJWT, upload.single("logo"), updateCompanyLogo);

// PATCH /api/v1/companies/subscription
router.route("/subscription").patch(verifyJWT, updateSubscriptionStatus);

// PATCH /api/v1/companies/settings
router.route("/settings").patch(verifyJWT, updateSettings);

// DELETE /api/v1/companies/delete-account
router.route("/delete-account").delete(verifyJWT, deleteCompany);

export default router;