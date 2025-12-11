import express from "express";
import cors from "cors";
import http from "http";
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
import cron from "node-cron";
import { scheduledLeads } from "./controllers/lead.controller.js";
import { Server } from "socket.io";




// ==========================================================
// Setup socket io
// ==========================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions
});

// ==========================================================
// Trust proxy - Required when behind reverse proxy/load balancer
// ==========================================================
console.log("Setting trust proxy to true");
app.set('trust proxy', true);


// ==========================================================
// Validate environment variables on startup
// ==========================================================
validateEnvironment();

// ==========================================================
// Security headers and middleware
// ==========================================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin access for static assets
  })
); // Security headers first
app.use(securityHeaders); // Custom security headers
app.use(cors(corsOptions)); // CORS configuration
app.use(generalRateLimit); // General rate limiting

// Attach io to req so routes can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// cron job for followup scheduling
cron.schedule("0 0 * * *", scheduledLeads, {
  scheduled: true,
  timezone: "Asia/Riyadh"
});

// cron job for inbound email's
cron.schedule("*/5 * * * *",  async () => {
  console.log("checking for email replies.....");
  await checkReplies();
}) 

// Daily health recalculation at 2 AM
cron.schedule("0 2 * * *", async () => {
  console.log("🕛 Running daily deal health recalculation:", new Date().toISOString());
  try {
    const companies = await Company.find();
    for (const company of companies) {
      await dealHealthService.batchCalculateHealth(company._id);
    }
  } catch (error) {
    console.error("❌ Health recalculation failed:", error);
  }
}, {
  timezone: "Asia/Riyadh"
});

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});


// Raw body for Stripe webhooks (before JSON parsing)
app.use(
  "/api/v1/billing/webhook/stripe",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  }
);

// Regular JSON and URL-encoded parsing for other routes
app.use(express.json({ limit: securityConfig.bodyParser.jsonLimit }));
app.use(
  express.urlencoded({
    limit: securityConfig.bodyParser.urlencodedLimit,
    extended: true,
  })
);
app.use(express.static("public"));
// app.use(cookieParser());
// app.use(sanitizeInput); // Input sanitization

app.use(passport.initialize());

// ==========================================================
// Session configuration for passport
// ==========================================================
// app.use(session(securityConfig.session));

// ==========================================================
// Passport middleware
// ==========================================================
// app.use(passport.session());

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
  try {
    // After recalculating health, batch-generate Next Best Actions for the company (non-blocking)
    nextBestActionService
      .batchGenerateActions(company._id)
      .catch((err) => console.error("[NBA] Batch generation failed:", err.message));
  } catch (err) {
    console.error("[NBA] Batch generation error:", err?.message || err);
  }
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
import subscriptionRouter from "./routes/subscription.routes.js";
import contactRouter from "./routes/contactUs.routes.js";
import invitationRoute from "./routes/invitation.routes.js";
import notificationsRoute from "./routes/notification.routes.js";
import dealHealthRouter from "./routes/dealHealth.routes.js";
import ServicesRouter from "./routes/services.routes.js";
import { EngagementHistory } from "./models/engagementHistory.model.js";
import dealHealthService from "./services/dealHealth.service.js";
import checkReplies from "./utils/check-inbound-replies.js";
import nextBestActionRoutes from "./routes/nextBestAction.routes.js";
import { Company } from "./models/company.model.js";
import nextBestActionService from "./services/nextBestAction.service.js";


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
app.use("/api/v1/billing", subscriptionRouter);
app.use("/api/v1/contact", contactRouter);
app.use("/api/v1/invite", invitationRoute);
app.use("/api/v1/notifications", notificationsRoute);
app.use("/api/v1/deal-health", dealHealthRouter);
app.use("/api/v1/services", ServicesRouter);
app.use("/api/v1/next-best-action", nextBestActionRoutes);
app.get("/api/email/track/open/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const leadId = token.split("-")[0];

    // Update tracking in database
    await EngagementHistory.findOneAndUpdate(
      {
        leadId,
        "emailMetrics.messageId": token,
        engagementType: "email_sent"
      },
      {
        $set: {
          engagementType: "email_opened",
          "emailMetrics.openedAt": new Date(),
          engagementDate: new Date(),
        },
        $inc: {
          "emailMetrics.openCount": 1
        }
      },
      { new: true }
    );

    console.log(`📬 Email opened with token: ${token}`);
    console.log(`👤 User Agent: ${req.headers['user-agent']}`);
    console.log(`🌐 IP: ${req.ip}`);

    // Return a 1x1 transparent GIF pixel
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.end(pixel);
  } catch (error) {
    console.error('Error tracking email open:', error);
    // Still return a pixel even on error to avoid breaking email display
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    res.type('image/gif').send(pixel);
  }
})

// ==========================================================
// Error handling middleware (must be last)
// ==========================================================
app.use(notFoundHandler); // Handle 404s
app.use(errorHandler); // Handle all other errors

export { app, server };
