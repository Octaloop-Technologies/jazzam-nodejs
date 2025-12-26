import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Company } from "../models/company.model.js";

/**
 * Verify API Key for automation team or third-party integrations
 * This middleware validates the API key without requiring JWT token
 * 
 * Expected header format:
 * X-API-Key: your-api-key-here
 * X-Company-ID: company-id-in-base64-or-plain
 */
export const verifyAPIKey = asyncHandler(async (req, _, next) => {
  try {
    const apiKey = req.header("X-API-Key");
    const companyIdHeader = req.header("X-Company-ID");

    if (!apiKey || !companyIdHeader) {
      throw new ApiError(
        401,
        "Missing required headers: X-API-Key and X-Company-ID"
      );
    }

    // Find the company by API key
    // API keys are typically hashed in production, but for simplicity in your current setup
    // you can store them in the Company model
    const company = await Company.findOne({
      _id: companyIdHeader,
      apiKey: apiKey,
      isActive: true,
    }).select("-password -refreshToken");

    if (!company) {
      throw new ApiError(401, "Invalid API Key or Company ID");
    }

    // Attach company to request for use in controllers
    req.company = company;
    req.companyId = company._id;

    // Update last API access time (optional, for tracking)
    company.lastApiAccess = new Date();
    await company.save();

    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, error?.message || "API Key verification failed");
  }
});

/**
 * Optional: Verify API Key with rate limiting
 * This can be used to prevent abuse from automation team
 */
export const verifyAPIKeyWithRateLimit = asyncHandler(async (req, _, next) => {
  try {
    const apiKey = req.header("X-API-Key");
    const companyIdHeader = req.header("X-Company-ID");

    if (!apiKey || !companyIdHeader) {
      throw new ApiError(
        401,
        "Missing required headers: X-API-Key and X-Company-ID"
      );
    }

    const company = await Company.findOne({
      _id: companyIdHeader,
      apiKey: apiKey,
      isActive: true,
    }).select("-password -refreshToken");

    if (!company) {
      throw new ApiError(401, "Invalid API Key or Company ID");
    }

    // Check rate limit (e.g., max 1000 requests per hour)
    if (!company.apiRateLimit) {
      company.apiRateLimit = {
        requestCount: 0,
        resetTime: new Date(Date.now() + 3600000), // 1 hour from now
      };
    }

    const now = new Date();
    if (now > company.apiRateLimit.resetTime) {
      // Reset the counter
      company.apiRateLimit.requestCount = 0;
      company.apiRateLimit.resetTime = new Date(now.getTime() + 3600000);
    }

    // Check if rate limit exceeded (e.g., 1000 requests per hour)
    const MAX_REQUESTS = 1000;
    if (company.apiRateLimit.requestCount >= MAX_REQUESTS) {
      throw new ApiError(
        429,
        `Rate limit exceeded. Max ${MAX_REQUESTS} requests per hour`
      );
    }

    company.apiRateLimit.requestCount++;
    company.lastApiAccess = new Date();
    await company.save();

    req.company = company;
    req.companyId = company._id;

    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, error?.message || "API Key verification failed");
  }
});
