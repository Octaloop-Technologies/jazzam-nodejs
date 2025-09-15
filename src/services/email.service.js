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
      // Validate required environment variables
      this.#validateConfiguration();

      // Create transporter with secure configuration
      this.#transporter = nodemailer.createTransporter({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
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
      console.error("❌ Failed to initialize email service:", error.message);
      throw new ApiError(500, "Email service initialization failed");
    }
  }

  // ================================================
  // Validate email configuration environment variables
  // ================================================

  #validateConfiguration() {
    const requiredVars = ["EMAIL_USER", "EMAIL_APP_PASSWORD"];
    const missingVars = requiredVars.filter(
      (variable) => !process.env[variable]
    );

    if (missingVars.length > 0) {
      throw new ApiError(
        500,
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
    Validator.validateEmail(process.env.EMAIL_USER, "EMAIL_USER");
    Validator.validateEmail(
      process.env.EMAIL_APP_PASSWORD,
      "EMAIL_APP_PASSWORD"
    );
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
      this.#ensureInitialized();

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
      throw new ApiError(
        500,
        `Failed to send waitlist notification: ${error.message}`
      );
    }
  }

  // ================================================
  // Send confirmation email to the user who joined waitlist
  // ================================================

  async sendWaitlistConfirmation(userEmail, userName = null) {
    try {
      this.#ensureInitialized();

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
      throw new ApiError(
        500,
        `Failed to send confirmation email: ${error.message}`
      );
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
        address: process.env.EMAIL_USER,
      },
      to: process.env.EMAIL_USER,
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
        address: process.env.EMAIL_USER,
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
