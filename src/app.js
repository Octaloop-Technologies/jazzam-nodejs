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
import { autoRefreshToken } from "./middlewares/tokenRefresh.middleware.js";
import {
  validateEnvironment,
  securityConfig,
} from "./config/security.config.js";

const app = express();

// Validate environment variables on startup
validateEnvironment();

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
app.use(autoRefreshToken); // Auto token refresh

// Session configuration for passport
app.use(session(securityConfig.session));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Routes import
import userRouter from "./routes/user.routes.js";

// Apply auth rate limiting to auth routes specifically
app.use("/api/v1/users/auth", authRateLimit);

// Routes Declaration
app.use("/api/v1/users", userRouter);

export { app };
