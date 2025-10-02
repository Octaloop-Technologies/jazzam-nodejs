import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { Company } from "../models/company.model.js";
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

    const company = await Company.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    if (!company) {
      throw new ApiError(401, "Invalid Access Token - Company not found");
    }

    // Check if company is still active
    if (!company.isActive) {
      throw new ApiError(401, "Company account is deactivated");
    }

    // Check if company has active subscription or is on trial
    // Temporarily allow all companies to access forms for testing
    // if (!company.canAccessPremiumFeatures()) {
    //   throw new ApiError(403, "Company subscription expired or inactive");
    // }

    req.company = company;
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
      error.message !== "Invalid Access Token - Company not found" &&
      error.message !== "Company account is deactivated" &&
      error.message !== "Company subscription expired or inactive"
    ) {
      console.error("JWT Verification Error:", error.message);
    }

    throw new ApiError(401, error?.message || "Invalid Access Token");
  }
});
