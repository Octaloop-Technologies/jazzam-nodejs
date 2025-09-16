import nodemailer from "nodemailer";
import { ApiError } from "../utils/ApiError.js";
import { Validator } from "../utils/validator.js";
import {
  generateWaitlistNotificationTemplate,
  generateWaitlistConfirmationTemplate,
  escapeHtml,
  capitalizeFirst,
  sanitizeUserData,
  buildUserDataRows,
} from "../templates/email/index.js";

class EmailService {
  #transporter = null;
  #isInitialized = false;

  constructor() {
    this.#initializeTransporter();
  }

  // ================================================
  // Initialize nodemailer transporter with Gmail SMTP configuration
  // ================================================

  async #initializeTransporter() {
    try {
      // Check if email configuration is available
      if (!process.env.EMAIL_COMPANY || !process.env.EMAIL_APP_PASSWORD) {
        console.warn(
          "⚠️ Email configuration not found. Email service will be disabled."
        );
        this.#isInitialized = false;
        return;
      }

      // Validate required environment variables
      this.#validateConfiguration();

      // Create transporter with secure configuration
      this.#transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_COMPANY,
          pass: process.env.EMAIL_APP_PASSWORD,
        },
        pool: true, // Use connection pooling for better performance
        maxConnections: 5,
        maxMessages: 100,
        secure: true, // Use TLS
      });

      // Verify transporter configuration asynchronously
      await this.#verifyConnection();
      this.#isInitialized = true;

      console.log("✅ Email service initialized successfully");
    } catch (error) {
      console.warn("⚠️ Email service initialization failed:", error.message);
      console.warn(
        "⚠️ Email notifications will be disabled. Waitlist entries will still be saved."
      );
      this.#isInitialized = false;
      // Don't throw error, just disable email service
    }
  }

  // ================================================
  // Validate email configuration environment variables
  // ================================================

  #validateConfiguration() {
    const requiredVars = ["EMAIL_COMPANY", "EMAIL_APP_PASSWORD"];
    const missingVars = requiredVars.filter(
      (variable) => !process.env[variable]
    );

    if (missingVars.length > 0) {
      throw new ApiError(
        500,
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
    Validator.validateEmail(process.env.EMAIL_COMPANY, "EMAIL_COMPANY");
  }

  // ================================================
  // Verify email transporter connection
  // ================================================

  async #verifyConnection() {
    try {
      await this.#transporter.verify();
    } catch (error) {
      throw new ApiError(
        500,
        `Email transporter verification failed: ${error.message}`
      );
    }
  }

  // ================================================
  // Ensure the email service is properly initialized
  // ================================================

  #ensureInitialized() {
    if (!this.#isInitialized || !this.#transporter) {
      throw new ApiError(500, "Email service not properly initialized");
    }
  }

  // ================================================
  // Send waitlist notification email to admin
  // ================================================

  async sendWaitlistNotification(userEmail, additionalData = {}) {
    try {
      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping notification email."
        );
        return {
          success: false,
          message: "Email service not available",
          recipient: userEmail,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(userEmail, "User email");

      const mailOptions = this.#buildWaitlistMailOptions(
        userEmail,
        additionalData
      );
      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Waitlist notification sent successfully: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: userEmail,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send waitlist notification:", error.message);
      return {
        success: false,
        message: error.message,
        recipient: userEmail,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ================================================
  // Send confirmation email to the user who joined waitlist
  // ================================================

  async sendWaitlistConfirmation(userEmail, userName = null) {
    try {
      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping confirmation email."
        );
        return {
          success: false,
          message: "Email service not available",
          recipient: userEmail,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(userEmail, "User email");

      const mailOptions = this.#buildConfirmationMailOptions(
        userEmail,
        userName
      );
      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Confirmation email sent successfully: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: userEmail,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send confirmation email:", error.message);
      return {
        success: false,
        message: error.message,
        recipient: userEmail,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ================================================
  // Test email configuration and connectivity
  // ================================================

  async testEmailConfiguration() {
    try {
      this.#ensureInitialized();
      await this.#verifyConnection();

      const result = {
        success: true,
        message: "Email configuration is valid",
        timestamp: new Date().toISOString(),
      };

      console.log("✅ Email configuration test completed successfully");
      return result;
    } catch (error) {
      console.error("❌ Email configuration test failed:", error.message);
      throw new ApiError(
        500,
        `Email configuration test failed: ${error.message}`
      );
    }
  }

  // =================================================================
  // PRIVATE HELPER METHODS
  // =================================================================

  // Validate email address format using reusable validator
  #validateEmailAddress(email, fieldName = "Email") {
    Validator.validateEmail(email, fieldName);
  }

  // Send email using the transporter
  async #sendEmail(mailOptions) {
    try {
      const result = await this.#transporter.sendMail(mailOptions);
      return result;
    } catch (error) {
      throw new ApiError(500, `Email delivery failed: ${error.message}`);
    }
  }

  // Build mail options for waitlist notification
  #buildWaitlistMailOptions(userEmail, additionalData) {
    const templateUtils = {
      escapeHtml,
      capitalizeFirst,
      sanitizeUserData,
      buildUserDataRows,
    };

    return {
      from: {
        name: "Lead Management System",
        address: process.env.EMAIL_COMPANY,
      },
      to: process.env.EMAIL_COMPANY,
      subject: "🎉 New Waitlist Signup - Lead Management App",
      html: generateWaitlistNotificationTemplate(
        userEmail,
        additionalData,
        templateUtils
      ),
      priority: "high",
    };
  }

  // Build mail options for user confirmation
  #buildConfirmationMailOptions(userEmail, userName) {
    const templateUtils = {
      escapeHtml,
      capitalizeFirst,
      sanitizeUserData,
      buildUserDataRows,
    };

    return {
      from: {
        name: "Lead Management Team",
        address: process.env.EMAIL_COMPANY,
      },
      to: userEmail,
      subject: "Welcome to our Waitlist! 🚀",
      html: generateWaitlistConfirmationTemplate(
        userName || userEmail,
        templateUtils
      ),
      priority: "normal",
    };
  }
}

// Create and export a singleton instance
const emailService = new EmailService();
export { emailService };
