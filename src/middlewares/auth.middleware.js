import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { securityConfig } from "../config/security.config.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    // Verify token with proper error handling using centralized config
    const decodedToken = jwt.verify(
      token,
      securityConfig.jwt.accessTokenSecret
    );

    // Check if token is expired manually (additional security)
    if (decodedToken.exp && Date.now() >= decodedToken.exp * 1000) {
      throw new ApiError(401, "Access token expired");
    }

    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new ApiError(401, "Invalid Access Token - User not found");
    }

    // Check if user is still active/verified
    if (!user.isVerified && user.provider === "local") {
      throw new ApiError(401, "Account not verified");
    }

    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT errors without logging them as errors
    if (error.name === "JsonWebTokenError") {
      throw new ApiError(401, "Invalid token format");
    } else if (error.name === "TokenExpiredError") {
      // Token expiry is a normal flow, not an error - just return 401 without logging
      throw new ApiError(401, "Access token expired");
    }

    // Only log unexpected errors (not auth-related ones)
    if (
      process.env.NODE_ENV !== "production" &&
      error.message !== "Unauthorized request" &&
      error.message !== "Access token expired" &&
      error.message !== "Invalid Access Token - User not found" &&
      error.message !== "Account not verified"
    ) {
      console.error("JWT Verification Error:", error.message);
    }

    throw new ApiError(401, error?.message || "Invalid Access Token");
  }
});
