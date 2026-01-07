import express from "express";
import cors from "cors";
import http from "http";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "./config/passport.js";
import helmet from "helmet";
import fs from "fs";
import path from "path";
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
import { initCrmSyncCron } from "./services/crmSync.cron.js";




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

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Join company-specific room
  socket.on("join:company", (companyId) => {
    const room = `company_${companyId}`;
    socket.join(room);
    console.log(`👤 Socket ${socket.id} joined room: ${room}`);
    socket.emit("joined", { room, companyId });
  });

  // Leave company room
  socket.on("leave:company", (companyId) => {
    const room = `company_${companyId}`;
    socket.leave(room);
    console.log(`👋 Socket ${socket.id} left room: ${room}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});



// cron job for followup scheduling
cron.schedule("0 0 * * *", scheduledLeads, {
  scheduled: true,
  timezone: "Asia/Riyadh"
});

// CRM leads sync cron job (runs every 15 minutes)
initCrmSyncCron();

// cron job for inbound email's
// cron.schedule("*/5 * * * *",  async () => {
//   console.log("checking for email replies.....");
//   await checkReplies();
// }) 

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

// Daily cleanup of old proposal files at 3 AM
cron.schedule("0 3 * * *", async () => {
  console.log("🧹 Running daily proposal file cleanup:", new Date().toISOString());
  try {
    const tempDir = path.join(process.cwd(), 'public', 'temp');
    if (!fs.existsSync(tempDir)) {
      console.log("📁 Temp directory does not exist, skipping cleanup");
      return;
    }

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000; // 2 days in milliseconds
    let deletedCount = 0;

    for (const file of files) {
      // Only clean up proposal files
      if (!file.startsWith('proposal_') || !file.endsWith('.docx')) continue;

      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtime.getTime();

      if (fileAge > twoDaysMs) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`🗑️ Deleted old proposal file: ${file}`);
      }
    }

    console.log(`🧹 Cleaned up ${deletedCount} old proposal files`);
  } catch (error) {
    console.error("❌ File cleanup failed:", error);
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
// Database Health Check Endpoint
// ==========================================================
app.get("/health/db", async (req, res) => {
  try {
    const { checkDatabaseHealth } = await import("./utils/dbHealth.js");
    const health = await checkDatabaseHealth();
    
    const isHealthy = health.mainDatabase.status === "healthy";
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: isHealthy,
      ...health,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
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
import automationRouter from "./routes/automation.routes.js";
import { engagementHistorySchema } from "./models/engagementHistory.model.js";
import dealHealthService from "./services/dealHealth.service.js";
import checkReplies from "./utils/check-inbound-replies.js";
import proposalRouter from "./routes/proposal.routes.js";
import nextBestActionRoutes from "./routes/nextBestAction.routes.js";
import { Company } from "./models/company.model.js";
import nextBestActionService from "./services/nextBestAction.service.js";
import socketService from "./services/socket.service.js";
socketService.initialize(io);


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
app.use("/api/v1/proposals", proposalRouter);
app.use("/api/v1/automation", automationRouter);
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
