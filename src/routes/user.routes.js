import { Router } from "express";
import {
  changeCurrentPassword,
  getCurrentUser,
  googleLoginCallback,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registeruser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  zohoCrmLoginUser,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import passport from "../config/passport.js";

const router = Router();

// ================================================
// Register and Login routes
// ================================================

// GET /api/v1/users/auth/register
router.route("/auth/register").post(
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  registeruser
);

// GET /api/v1/users/auth/login
router.route("/auth/login").post(loginUser);

// ================================================
// OAuth routes (Google, Zoho CRM)
// ================================================

// GET /api/v1/users/auth/google
router
  .route("/auth/google")
  .get(passport.authenticate("google", { scope: ["profile", "email"] }));
router.route("/auth/google/callback").get(
  passport.authenticate("google", {
    failureRedirect: "/login?error=auth_failed",
  }),
  googleLoginCallback
);

// GET /api/v1/users/auth/zohocrm
router.route("/auth/zohocrm").get(zohoCrmLoginUser);
router.route("/auth/zohocrm/callback").get(zohoCrmLoginUser);

// POST /api/v1/users/auth/refresh-token
router.route("/auth/refresh-token").post(refreshAccessToken);
// ================================================
// Secured routes
// ================================================

router.use(verifyJWT);

// POST /api/v1/users/auth/logout
router.route("/auth/logout").post(logoutUser);

// POST /api/v1/users/auth/change-password
router.route("/auth/change-password").post(changeCurrentPassword);

// GET /api/v1/users/auth/current-user
router.route("/auth/current-user").get(getCurrentUser);

// PATCH /api/v1/users/auth/update-account
router.route("/auth/update-account").patch(updateAccountDetails);

// ================================================
// User settings routes
// ================================================

// PATCH /api/v1/users/avatar
router
  .route("/avatar")
  .patch(verifyJWT, upload.single("avatar"), updateUserAvatar);

// PATCH /api/v1/users/cover-image
router
  .route("/cover-image")
  .patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage);

export default router;
