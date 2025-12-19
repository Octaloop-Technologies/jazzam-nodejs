// src/utils/logger.js
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Centralized Logger with Tenant Context
 * Automatically includes tenant information in all logs
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  
  // Format logs for production (JSON) and development (pretty)
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },

  // Base configuration
  base: {
    env: process.env.NODE_ENV || "development",
    service: "jazzaam-api",
  },

  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Redact sensitive fields
  redact: {
    paths: [
      "*.password",
      "*.accessToken",
      "*.refreshToken",
      "*.authorization",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.secret",
      "*.apiKey",
    ],
    remove: true,
  },

  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with tenant context
 */
export const createTenantLogger = (tenantId, tenantEmail, tenantName) => {
  return logger.child({
    tenant: {
      id: tenantId,
      email: tenantEmail,
      name: tenantName,
    },
  });
};

/**
 * Express middleware to add logger to request
 */
export const loggerMiddleware = (req, res, next) => {
  // Create tenant-aware logger if tenant context exists
  if (req.tenantId) {
    req.log = createTenantLogger(
      req.tenantId,
      req.tenantEmail,
      req.tenantName
    );
  } else {
    req.log = logger;
  }

  // Log incoming request
  req.log.info(
    {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
    "Incoming request"
  );

  // Log response
  const originalSend = res.send;
  res.send = function (data) {
    req.log.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
      },
      "Response sent"
    );
    originalSend.call(this, data);
  };

  next();
};

/**
 * Audit logger for critical operations
 */
export const auditLog = (action, tenantId, details = {}) => {
  logger.info(
    {
      audit: true,
      action,
      tenantId,
      timestamp: new Date().toISOString(),
      ...details,
    },
    `AUDIT: ${action}`
  );
};

export default logger;