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
import {
  swaggerDefinition,
  swaggerUi,
  swaggerUiOptions,
} from "./config/swagger-simple.config.js";

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
    apiDocumentation: isProduction ? null : "/api-docs-legacy",
  };

  res.status(200).json(response);
});

// ==========================================================
// Swagger API Documentation
// ==========================================================
// Serve Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDefinition, swaggerUiOptions)
);

// Serve Swagger JSON
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerDefinition);
});

// Legacy API documentation endpoint (development only)
if (process.env.NODE_ENV !== "production") {
  app.get("/api-docs-legacy", (req, res) => {
    res.status(200).json({
      success: true,
      message: "API Documentation",
      endpoints: {
        companies: "/api/v1/companies",
        forms: "/api/v1/forms",
        leads: "/api/v1/leads",
        crmIntegration: "/api/v1/crm-integration",
        waitlist: "/api/v1/waitlist",
        webhook: "/api/v1/webhook",
        health: "/health",
      },
      version: "1.0.0",
      swagger: "/api-docs",
    });
  });
}

// ==========================================================
// Routes import
// ==========================================================
import companyRouter from "./routes/company.routes.js";
import formRouter from "./routes/form.routes.js";
import leadRouter from "./routes/lead.routes.js";
import crmIntegrationRouter from "./routes/crmIntegration.routes.js";
import waitlistRouter from "./routes/waitlist.routes.js";
import webhookRouter from "./routes/webhook.routes.js";

// ==========================================================
// Apply auth rate limiting to auth routes specifically
// ==========================================================
app.use("/api/v1/companies/auth", authRateLimit);

// ==========================================================
// Routes Declaration
// ==========================================================
app.use("/api/v1/companies", companyRouter);
app.use("/api/v1/forms", formRouter);
app.use("/api/v1/leads", leadRouter);
app.use("/api/v1/crm-integration", crmIntegrationRouter);
app.use("/api/v1/waitlist", waitlistRouter);
app.use("/api/v1/webhook", webhookRouter);

// ==========================================================
// Error handling middleware (must be last)
// ==========================================================
app.use(notFoundHandler); // Handle 404s
app.use(errorHandler); // Handle all other errors

export { app };
