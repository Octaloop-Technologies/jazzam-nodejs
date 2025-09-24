import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "./config/passport.js";
import helmet from "helmet";
import {
  corsOptions,
  generalRateLimit,
  authRateLimit,
  securityHeaders,
  sanitizeInput,
} from "./middlewares/security.middleware.js";
import {
  validateEnvironment,
  securityConfig,
} from "./config/security.config.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";

const app = express();

// ==========================================================
// Validate environment variables on startup
// ==========================================================
validateEnvironment();

// ==========================================================
// Security headers and middleware
// ==========================================================
app.use(helmet()); // Security headers first
app.use(securityHeaders); // Custom security headers
app.use(cors(corsOptions)); // CORS configuration
app.use(generalRateLimit); // General rate limiting
app.use(express.json({ limit: securityConfig.bodyParser.jsonLimit }));
app.use(
  express.urlencoded({
    limit: securityConfig.bodyParser.urlencodedLimit,
    extended: true,
  })
);
app.use(express.static("public"));
app.use(cookieParser());
app.use(sanitizeInput); // Input sanitization

// ==========================================================
// Session configuration for passport
// ==========================================================
app.use(session(securityConfig.session));

// ==========================================================
// Passport middleware
// ==========================================================
app.use(passport.initialize());
app.use(passport.session());

// ==========================================================
// Routes import
// ==========================================================
import userRouter from "./routes/user.routes.js";
import leadRouter from "./routes/lead.routes.js";
import waitlistRouter from "./routes/waitlist.routes.js";
import webhookRouter from "./routes/webhook.routes.js";

// ==========================================================
// Apply auth rate limiting to auth routes specifically
// ==========================================================
app.use("/api/v1/users/auth", authRateLimit);

// ==========================================================
// Root route - API health check
// ==========================================================
app.get("/", (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";

  const response = {
    success: true,
    message: "Lead Management API is running",
    ...(isProduction
      ? {}
      : {
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || "development",
        }),
  };

  res.status(200).json(response);
});

// ==========================================================
// API health check endpoint
// ==========================================================
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================================
// Cookie test endpoint (development only)
// ==========================================================
if (process.env.NODE_ENV !== "production") {
  app.get("/test-cookies", (req, res) => {
    const testCookieOptions = {
      httpOnly: true,
      secure: false, // false for development
      sameSite: "lax",
      maxAge: 5 * 60 * 1000, // 5 minutes
      path: "/",
    };

    res
      .status(200)
      .cookie("testCookie", "test-value-" + Date.now(), testCookieOptions)
      .json({
        success: true,
        message: "Test cookie set",
        cookieOptions: testCookieOptions,
        origin: req.headers.origin,
        userAgent: req.headers["user-agent"],
        cookies: req.cookies,
      });
  });
}

// ==========================================================
// API documentation endpoint (development only)
// ==========================================================
if (process.env.NODE_ENV !== "production") {
  app.get("/api-docs", (req, res) => {
    res.status(200).json({
      success: true,
      message: "API Documentation",
      endpoints: {
        auth: "/api/v1/users/auth",
        users: "/api/v1/users",
        leads: "/api/v1/lead",
        waitlist: "/api/v1/waitlist",
        webhook: "/api/v1/webhook",
        health: "/health",
      },
      version: "1.0.0",
    });
  });
}

// ==========================================================
// Routes Declaration
// ==========================================================
app.use("/api/v1/users", userRouter);
app.use("/api/v1/lead", leadRouter);
app.use("/api/v1/waitlist", waitlistRouter);
app.use("/api/v1/webhook", webhookRouter);

// ==========================================================
// Error handling middleware (must be last)
// ==========================================================
app.use(notFoundHandler); // Handle 404s
app.use(errorHandler); // Handle all other errors

export { app };
