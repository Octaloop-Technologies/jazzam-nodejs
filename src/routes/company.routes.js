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
} from "../controllers/company.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import passport from "../config/passport.js";

const router = Router();

// ================================================
// Register and Login routes
// ================================================

// POST /api/v1/companies/auth/register
router.route("/auth/register").post(upload.single("logo"), registerCompany);

// POST /api/v1/companies/auth/login
router.route("/auth/login").post(loginCompany);

// ================================================
// OAuth routes (Google, Zoho)
// ================================================

// GET /api/v1/companies/auth/google
router
  .route("/auth/google")
  .get(passport.authenticate("google", { scope: ["profile", "email"] }));
router.route("/auth/google/callback").get(
  passport.authenticate("google", {
    failureRedirect: "/login?error=auth_failed",
  }),
  googleLoginCallback
);

// GET /api/v1/companies/auth/zoho
router.route("/auth/zoho").get(zohoLogin);
router.route("/auth/zoho/callback").get(zohoCallback);

// POST /api/v1/companies/auth/refresh-token
router.route("/auth/refresh-token").post(refreshAccessToken);

// ================================================
// Secured routes
// ================================================

router.use(verifyJWT);

// POST /api/v1/companies/auth/logout
router.route("/auth/logout").post(logoutCompany);

// POST /api/v1/companies/auth/change-password
router.route("/auth/change-password").post(changeCurrentPassword);

// GET /api/v1/companies/auth/current-company
router.route("/auth/current-company").get(getCurrentCompany);

// PATCH /api/v1/companies/auth/update-company
router.route("/auth/update-company").patch(updateCompanyDetails);

// PATCH /api/v1/companies/auth/onboarding
router.route("/auth/onboarding").patch(updateOnboardingStatus);

// ================================================
// Company settings routes
// ================================================

// PATCH /api/v1/companies/logo
router
  .route("/logo")
  .patch(verifyJWT, upload.single("logo"), updateCompanyLogo);

// PATCH /api/v1/companies/subscription
router.route("/subscription").patch(verifyJWT, updateSubscriptionStatus);

// DELETE /api/v1/companies/delete-account
router.route("/delete-account").delete(verifyJWT, deleteCompany);

export default router;
