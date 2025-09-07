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

// ========================================================================
// endpoint /api/v1/users/auth/(register, login, etc...)
// ========================================================================

// Register and Login routes
router.route("/auth/register").post(
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  registeruser
);
router.route("/auth/login").post(loginUser);

// OAuth routes (Google, Zoho CRM)
router
  .route("/auth/google")
  .get(passport.authenticate("google", { scope: ["profile", "email"] }));
router.route("/auth/google/callback").get(
  passport.authenticate("google", {
    failureRedirect: "/login?error=auth_failed",
  }),
  googleLoginCallback
);

router.route("/auth/zohocrm").get(zohoCrmLoginUser);
router.route("/auth/zohocrm/callback").get(zohoCrmLoginUser);

// secured routes
router.route("/auth/logout").post(verifyJWT, logoutUser);
router.route("/auth/refresh-token").post(refreshAccessToken);
router.route("/auth/change-password").post(verifyJWT, changeCurrentPassword);
router.route("/auth/current-user").get(verifyJWT, getCurrentUser);
router.route("/auth/update-account").patch(verifyJWT, updateAccountDetails);

router
  .route("/avatar")
  .patch(verifyJWT, upload.single("avatar"), updateUserAvatar);
router
  .route("/cover-image")
  .patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage);

export default router;
