// ==============================================================
// Security Configuration - Single Source
// ==============================================================

export const securityConfig = {
  // JWT Configuration
  jwt: {
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
  },

  // Cookie Configuration
  cookies: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    domain:
      process.env.NODE_ENV === "production"
        ? process.env.COOKIE_DOMAIN
        : undefined,
    maxAge: {
      accessToken: 15 * 60 * 1000, // 15 minutes in milliseconds
      refreshToken: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    },
  },

  // CORS Configuration
  cors: {
    allowedOrigins: [process.env.CLIENT_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Cookie",
    ],
    exposedHeaders: ["Set-Cookie"],
  },

  // Rate Limiting Configuration
  rateLimit: {
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // 10 attempts per window
      message: {
        error: "Too many authentication attempts, please try again later.",
      },
      standardHeaders: true,
      legacyHeaders: false,
    },
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests per window
      message: {
        error: "Too many requests, please try again later.",
      },
      standardHeaders: true,
      legacyHeaders: false,
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // 3 password reset attempts per hour
    },
  },

  // Security Headers
  headers: {
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  },

  // Body Parser Configuration
  bodyParser: {
    jsonLimit: "10mb",
    urlencodedLimit: "10mb",
  },

  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || "this-is-a-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    },
  },

  // Token Refresh Configuration
  tokenRefresh: {
    refreshThresholdMinutes: 5, // Refresh token if expires within 5 minutes
  },

  // Password Requirements
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
  },

  // File Upload Security
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5MB in bytes
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  },

  // Environment Checks - Only essential variables
  requiredEnvVars: [
    "CLIENT_URL",
    "ACCESS_TOKEN_SECRET",
    "REFRESH_TOKEN_SECRET",
    "MONGODB_URI",
  ],
};

// ==============================================================
// Validation Functions
// ==============================================================

export const validatePassword = (password) => {
  const config = securityConfig.password;
  const errors = [];

  if (password.length < config.minLength) {
    errors.push(
      `Password must be at least ${config.minLength} characters long`
    );
  }

  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (config.requireNumbers && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (config.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validateEnvironment = () => {
  const missing = securityConfig.requiredEnvVars.filter(
    (variable) => !process.env[variable]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
};

// ==============================================================
// Cookie Options Helper Functions
// ==============================================================

export const getCookieOptions = (tokenType = "accessToken") => {
  const options = {
    httpOnly: securityConfig.cookies.httpOnly,
    secure: securityConfig.cookies.secure,
    sameSite: securityConfig.cookies.sameSite,
    maxAge: securityConfig.cookies.maxAge[tokenType],
    path: "/", // Ensure cookies are available for all paths
  };

  // Only set domain if it's explicitly configured and not empty
  if (
    securityConfig.cookies.domain &&
    securityConfig.cookies.domain.trim() !== ""
  ) {
    options.domain = securityConfig.cookies.domain;
  }

  return options;
};

export const getAccessTokenCookieOptions = () =>
  getCookieOptions("accessToken");
export const getRefreshTokenCookieOptions = () =>
  getCookieOptions("refreshToken");
