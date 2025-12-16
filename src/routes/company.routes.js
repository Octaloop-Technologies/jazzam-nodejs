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
} from "../controllers/company.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import passport from "../config/passport.js";
import { handleOAuthCallback } from "../controllers/crmIntegration.controller.js";
import { enforceTenantScope, 
  validateTeamAccess, 
  validateTenantAccess } from "../middlewares/tenant.middleware.js";
import { requirePermission } from "../middlewares/rbac.middleware.js";

const router = Router();

// ================================================
// Public routes
// ================================================
router.route("/auth/register").post(registerCompany);
router.route("/auth/login").post(loginCompany);
router.route("/auth/verify-email").post(verifyEmail);
router.route("/auth/resend-verification-code").post(resendVerificationCode);

// OAuth routes
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
router.route("/auth/zoho").get(zohoLogin);
router.route("/auth/login/zoho/callback").get(zohoCallback);
router.route("/auth/zoho/callback").get(handleOAuthCallback)
router.route("/auth/refresh-token").post(refreshAccessToken);

// ================================================
// Secured routes - APPLY MIDDLEWARE
// ================================================
router.use(verifyJWT);
router.use(enforceTenantScope); // ADD THIS - Global tenant scope

// Basic authenticated routes
router.route("/auth/logout").post(logoutCompany);
router.route("/auth/current-company").get(getCurrentCompany);
router.route("/auth/change-password").post(changeCurrentPassword);

// Dashboard access - validate team membership
router.route("/:id").get(
  validateTeamAccess, 
  getCompanyDashboard
);

// Team management - require team permissions
router.route("/auth/team-members/:id").get(
  validateTeamAccess,
  requirePermission('team:manage'),
  companyTeamsMembers
);


router.route("/auth/joined-company/:id").get(
  validateTeamAccess,
  getJoinedCompany
);


router.route("/auth/deactivate-member/:id").put(
  validateTeamAccess,
  requirePermission('team:remove'),
  deactivateTeamMember
);

router.route("/auth/activate-member/:id").put(
  validateTeamAccess,
  requirePermission('team:manage'),
  activateTeamMember);

router.route("/auth/change-name/:id").patch(
  validateTeamAccess,
  requirePermission('company:write'),
  changeCompanyName)

// Company management
router.route("/auth/update-company").patch(
  requirePermission('company:write'),
  updateCompanyDetails);


router.route("/auth/onboarding").patch(updateOnboardingStatus);
router.route("/auth/company-onboarding").patch(completeCompanyOnboarding);
router.route("/auth/update-user-type/:id").patch(updateUserType);

// settings - require write permissions
router
  .route("/logo")
  .patch(
  upload.single("logo"), 
  requirePermission('company:write'),
  updateCompanyLogo
);


router.route("/subscription").patch(
  requirePermission('billing:write'),
  updateSubscriptionStatus
);

router.route("/settings").patch(
  requirePermission('settings:write'),
  updateSettings);
  
router.route("/delete-account").delete(
  requirePermission('company:delete'),  
  deleteCompany
);

export default router;
