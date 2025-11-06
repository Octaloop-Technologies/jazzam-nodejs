import rateLimit from "express-rate-limit";
import { securityConfig } from "../config/security.config.js";

// ==============================================================
// Rate Limiting Middleware - Using centralized config
// ==============================================================
export const authRateLimit = rateLimit({
  ...securityConfig.rateLimit.auth,
  // Store in memory (use Redis for production)
  store: undefined, // Default MemoryStore
  // Trust proxy for accurate IP detection
  trustProxy: process.env.NODE_ENV === "production",
});

export const generalRateLimit = rateLimit({
  ...securityConfig.rateLimit.general,
  // Trust proxy for accurate IP detection
  trustProxy: process.env.NODE_ENV === "production",
});

// ==============================================================
// CORS Configuration - Using centralized config
// ==============================================================
export const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = securityConfig.cors.allowedOrigins;

    // Handle case where allowedOrigins might not be defined
    if (!allowedOrigins) {
      console.warn("CORS allowedOrigins not configured, allowing all origins in development");
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Allow Postman and other development tools in non-production environments
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: securityConfig.cors.credentials,
  methods: securityConfig.cors.methods,
  allowedHeaders: securityConfig.cors.allowedHeaders,
  exposedHeaders: securityConfig.cors.exposedHeaders,
};

// ==============================================================
// Security Headers Middleware - Using centralized config
// ==============================================================
export const securityHeaders = (req, res, next) => {
  // Remove powered by express header
  res.removeHeader("X-Powered-By");

  // Apply all security headers from config
  Object.entries(securityConfig.headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  next();
};

// ==============================================================
// Request Sanitization
// ==============================================================
export const sanitizeInput = (req, res, next) => {
  // Remove any potential script tags from request body
  if (req.body) {
    req.body = JSON.parse(
      JSON.stringify(req.body).replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        ""
      )
    );
  }
  next();
};
