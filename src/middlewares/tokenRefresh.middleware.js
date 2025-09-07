import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import {
  securityConfig,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
} from "../config/security.config.js";

// ==============================================================
// Token Refresh Middleware - Using centralized config
// ==============================================================
export const autoRefreshToken = asyncHandler(async (req, res, next) => {
  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;

  // If no access token, proceed normally (will fail in auth middleware if protected)
  if (!accessToken) {
    return next();
  }

  try {
    const decodedToken = jwt.decode(accessToken);

    // Check if token expires within the configured threshold
    const thresholdSeconds =
      securityConfig.tokenRefresh.refreshThresholdMinutes * 60;
    const thresholdFromNow = Math.floor(Date.now() / 1000) + thresholdSeconds;

    if (decodedToken.exp && decodedToken.exp < thresholdFromNow) {
      // Token is expiring soon, attempt refresh
      if (refreshToken) {
        try {
          const decodedRefreshToken = jwt.verify(
            refreshToken,
            securityConfig.jwt.refreshTokenSecret
          );
          const user = await User.findById(decodedRefreshToken._id);

          if (user && user.refreshToken === refreshToken) {
            // Generate new tokens
            const newAccessToken = user.generateAccessToken();
            const newRefreshToken = user.generateRefreshToken();

            // Update refresh token in database
            user.refreshToken = newRefreshToken;
            await user.save({ validateBeforeSave: false });

            // Set new cookies using centralized config
            res.cookie(
              "accessToken",
              newAccessToken,
              getAccessTokenCookieOptions()
            );
            res.cookie(
              "refreshToken",
              newRefreshToken,
              getRefreshTokenCookieOptions()
            );

            // Update request cookies for downstream middleware
            req.cookies.accessToken = newAccessToken;
            req.cookies.refreshToken = newRefreshToken;
          }
        } catch (refreshError) {
          // Refresh token is invalid, clear cookies
          res.clearCookie("accessToken");
          res.clearCookie("refreshToken");
        }
      }
    }
  } catch (error) {
    // Error decoding token, let it proceed to auth middleware for proper handling
  }

  next();
});
