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
import crypto from "crypto";
import { storeMessageIdMapping } from "../utils/check-inbound-replies.js";

class EmailService {
  #transporter = null;
  #isInitialized = false;
  #initializationPromise = null;

  constructor() {
    // Don't initialize in constructor - wait until first use
  }

  // ================================================
  // Initialize nodemailer transporter with Gmail SMTP configuration
  // ================================================

  async #initializeTransporter() {
    // Prevent multiple simultaneous initializations
    if (this.#initializationPromise) {
      return this.#initializationPromise;
    }

    // If already initialized, return immediately
    if (this.#isInitialized) {
      return;
    }

    this.#initializationPromise = (async () => {
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
          host: 'smtp.hostinger.com',
          port: 465, // or 587
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
    })();

    return this.#initializationPromise;
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
      // Ensure email service is initialized
      await this.#initializeTransporter();

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
      console.log("error 1*****", error)
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
  // Send email verification code
  // ================================================

  async sendVerificationCode(userEmail, verificationCode) {
    try {
      // Ensure email service is initialized
      await this.#initializeTransporter();

      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping verification email."
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

      const mailOptions = {
        from: process.env.EMAIL_COMPANY,
        to: userEmail,
        subject: "Email Verification - Jazzaam",
        html: this.#generateEmailVerificationTemplate(userEmail, verificationCode),
      };

      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Verification email sent successfully to ${userEmail}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: userEmail,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send verification email:", error.message);
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
      // Ensure email service is initialized
      await this.#initializeTransporter();

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
  // Send welcome email to new lead
  // ================================================

  async sendWelcomeEmail(lead, form) {
    try {
      // Ensure email service is initialized
      await this.#initializeTransporter();

      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping welcome email."
        );
        return {
          success: false,
          message: "Email service not available",
          recipient: lead.email,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(lead.email, "Lead email");

      const mailOptions = this.#buildWelcomeMailOptions(lead, form);
      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Welcome email sent successfully to ${lead?.email}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: mailOptions.messageId,
        recipient: lead?.email,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send welcome email:", error.message);
      return {
        success: false,
        message: error.message,
        recipient: lead.email,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ================================================
  // Send follow-up email to lead
  // ================================================

  async sendFollowUpEmail(companyName, email, subject, message) {
    try {
      // Ensure email service is initialized
      await this.#initializeTransporter();

      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping follow-up email."
        );
        return {
          success: false,
          message: "Email service not available",
          recipient: email,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(email, "Lead email");

      const mailOptions = this.#buildFollowUpMailOptions(companyName, email, subject, message);
      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Follow-up email sent successfully to ${email}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: email,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send follow-up email:", error.message);
      return {
        success: false,
        message: error.message,
        recipient: email,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async sendInvitationEmail(name, email, link) {
    try {
      // Ensure email service is initialized
      await this.#initializeTransporter();

      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping invitation link email."
        );
        return {
          success: false,
          message: "Email service not available",
          recipient: email,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(email);

      const mailOptions = this.#buildInvitationEmailOptions(email, link, name);
      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Invitation email sent successfully to ${email}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: email,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send invitation email:", error.message);
      return {
        success: false,
        message: error.message,
        recipient: email,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ================================================
  // Send notification email to company about new lead
  // ================================================

  async sendLeadNotificationEmail(lead, form, company) {
    try {
      // Ensure email service is initialized
      await this.#initializeTransporter();

      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping lead notification email."
        );
        return {
          success: false,
          message: "Email service not available",
          recipient: company.email,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(company.email, "Company email");

      const mailOptions = this.#buildLeadNotificationMailOptions(
        lead,
        form,
        company
      );
      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Lead notification email sent successfully to ${company.email}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: company.email,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        "❌ Failed to send lead notification email:",
        error.message
      );
      return {
        success: false,
        message: error.message,
        recipient: company.email,
        timestamp: new Date().toISOString(),
      };
    }
  }

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

  // Build mail options for welcome email
  #buildWelcomeMailOptions(lead, form) {
    const companyName = form.companyId?.companyName || "Our Company";
    const subject =
      form.settings?.autoResponse?.subject || "Thank you for your interest!";
    const message =
      form.settings?.autoResponse?.message ||
      "Thank you for reaching out. We'll get back to you soon!";

    // Generate unique message ID in format: leadId-timestamp
    const uniqueId = `${lead._id}-${Date.now()}`;
    const messageId = `${uniqueId}@jazzam.ai`;

    // Store messageId to companyId mapping for reply processing
    storeMessageIdMapping(uniqueId, form.companyId?._id || form.companyId, lead._id);

    return {
      from: {
        name: companyName,
        address: process.env.EMAIL_COMPANY,
      },
      to: lead.email,
      subject: subject,
      html: this.#generateWelcomeEmailTemplate(lead, companyName, message, messageId),
      messageId: messageId,
      priority: "normal",
      headers: {
        'X-Tracking-ID': uniqueId,
        'X-Email-Type': 'welcome',
        'X-Lead-ID': (lead._id || lead.id || 'unknown').toString(),
        'X-Company-ID': (form.companyId?._id || form.companyId || 'unknown').toString(),
        'X-Message-ID': uniqueId,
      }
    };
  }

  // Build mail options for follow-up email
  #buildFollowUpMailOptions(companyName, email, subject, message) {
    const emailMessage =
      message ||
      "Hi there! We wanted to follow up on your recent inquiry. Do you have any questions?";

    return {
      from: {
        name: companyName || "Our Company",
        address: process.env.EMAIL_COMPANY,
      },
      to: email,
      subject: subject || "Following up on your inquiry",
      html: this.#generateFollowUpEmailTemplate(email, emailMessage),
      priority: "normal",
    };
  }


  // Build mail options for follow-up email
  #buildInvitationEmailOptions(receiverEmail, link, name) {
    const companyName = "Jazzam";
    const subject = "Invitation Link for join our company";
    const message = "I'm excited to invite you to join our company. Here's your personal invitation link:";

    return {
      from: {
        name: companyName,
        address: process.env.EMAIL_COMPANY,
      },
      to: receiverEmail,
      subject: subject,
      html: this.#generateInvitationLinkTemplate(link, companyName, message, name),
      priority: "normal",
    };
  }


  // Build mail options for lead notification email
  #buildLeadNotificationMailOptions(lead, form, company) {
    return {
      from: {
        name: "Lead Management System",
        address: process.env.EMAIL_COMPANY,
      },
      to: company.email,
      subject: `🎉 New Lead: ${lead.fullName || lead.email}`,
      html: this.#generateLeadNotificationTemplate(lead, form, company),
      priority: "high",
    };
  }

  // Build mail options for confirmation email
  #buildConfirmationMailOptions(userEmail, userName) {
    return {
      from: {
        name: "Lead Generation Platform",
        address: process.env.EMAIL_COMPANY,
      },
      to: userEmail,
      subject: "Welcome to our waitlist!",
      html: this.#generateConfirmationEmailTemplate(userName),
    };
  }

  // Generate welcome email template
  #generateWelcomeEmailTemplate(lead, companyName, message, trackingToken) {
    const leadName = lead.fullName || lead.firstName || "there";

    // Create tracking pixel url with the same token
    const trackingPixelUrl = `${process.env.SERVER_URL}/api/email/track/open/${trackingToken}`;

    console.log("trackingPixelUrl:", trackingPixelUrl);

    // Add tracking pixel to HTML
    const trackingPixel = `
    <img 
      src="${trackingPixelUrl}?rand=${Math.random()}"
      width=1
      height=1
      style="display:none;width=1px;height:1px;opacity:0;"
      alt=""
    />
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome from ${companyName}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
          .content { padding: 20px; background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Welcome to ${companyName}!</h1>
        </div>
        <div class="content">
          <p>Hi ${leadName},</p>
          <p>${message}</p>
          <p>We're excited to connect with you and will be in touch soon.</p>
          <p>Best regards,<br>The ${companyName} Team</p>
        </div>
        ${trackingPixel}
      </body>
      </html>
    `;
    //     <div class="footer">
    //   <p>This email was sent to ${lead.email}</p>
    // </div>
  }

  #generateInvitationLinkTemplate(link, companyName, message, name) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome from </title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
          .content { padding: 20px; background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="header">
        </div>
        <div class="content">
          <p>Hi ${name} ,</p>
          <p>${message}</p>
          <p>${link}</p>
          <p>Note:- Please login to your account to access the invitation link.</p>
          <p>Best regards,<br>The ${companyName} Team</p>
        </div>
      </body>
      </html>
    `;
  }

  // Generate follow-up email template
  #generateFollowUpEmailTemplate(email, message) {
    const leadName = email || "there";

    return `
     <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to our waitlist!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header-ar { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Follow Up</h1>
          </div>
          <div class="content">
            <p>Hi ${leadName},</p>
            
           <div>${message}</div>
            
            <p>Best regards,<br>The Lead Generation Team</p>
          </div>
          <div class="footer">
            <p>You're receiving this email because there is lead generated against your profile.</p>
          </div>
          
        </div>
      </body>
      </html>
    `;
  }

  // Generate lead notification template
  #generateLeadNotificationTemplate(lead, form, company) {
    const leadName = lead.fullName || lead.firstName || "Unknown";
    const formName = form.name || "Contact Form";
    const companyName = company.companyName || "Your Company";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Lead Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
          .content { padding: 20px; background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; }
          .lead-info { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎉 New Lead Received!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${companyName}</strong>,</p>
          <p>You have received a new lead from your form: <strong>${formName}</strong></p>
          
          <div class="lead-info">
            <h3>Lead Information:</h3>
            <p><strong>Name:</strong> ${leadName}</p>
            <p><strong>Email:</strong> ${lead.email}</p>
            ${lead.phone ? `<p><strong>Phone:</strong> ${lead.phone}</p>` : ""}
            ${lead.company ? `<p><strong>Company:</strong> ${lead.company}</p>` : ""}
            ${lead.jobTitle ? `<p><strong>Job Title:</strong> ${lead.jobTitle}</p>` : ""}
            <p><strong>Submitted:</strong> ${new Date(lead.createdAt).toLocaleString()}</p>
          </div>
          
          <p>Please follow up with this lead as soon as possible to maximize your conversion chances.</p>
        </div>
        <div class="footer">
          <p>This notification was sent to <strong>${companyName}</strong> (${company.email})</p>
        </div>
      </body>
      </html>
    `;
  }

  // Generate confirmation email template
  #generateConfirmationEmailTemplate(userName) {
    const displayName = userName || "there";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to our waitlist!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header-ar { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to our waitlist!</h1>
          </div>
          <div class="content">
            <p>Hi ${displayName},</p>
            
            <p>Thank you for joining our waitlist! We're excited to have you on board.</p>
            
            <p>You'll be among the first to know when our lead generation platform launches. We're building something amazing that will help companies generate high-quality leads from multiple social media platforms.</p>
            
            <p><strong>What to expect:</strong></p>
            <ul>
              <li>Early access to our platform</li>
              <li>Exclusive launch offers</li>
              <li>Regular updates on our progress</li>
              <li>Priority support when we launch</li>
            </ul>
            
            <p>We'll keep you updated on our progress and let you know as soon as we're ready to launch!</p>
            
            <p>Best regards,<br>The Lead Generation Team</p>
          </div>
          <div class="footer">
            <p>You're receiving this email because you joined our waitlist.</p>
          </div>
          <hr style="margin: 30px 0; border: 1px solid #eee;">
          <div class="header-ar">
            <h1> أهلاً وسهلاً بك في قائمة الانتظار!</h1>
          </div>
          <div class="content" dir="rtl" style="text-align: right; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            <p>مرحبًا ${displayName}،</p>
                <p>شكرًا لانضمامك إلى قائمة الانتظار الخاصة بنا! يسعدنا جدًا وجودك معنا.</p>
                
                <p>ستكون من أوائل الأشخاص الذين يعرفون عن إطلاق منصتنا لتوليد العملاء المحتملين. نحن نعمل على بناء أداة مذهلة ستساعد الشركات على الحصول على عملاء بجودة عالية من مختلف منصات التواصل الاجتماعي.</p>
                
                <p><strong>وش تتوقع بعد التسجيل:</strong></p>
                <ul style="list-style-position: inside; padding-right: 0;">
                  <li>وصول مبكر لتجربة المنصة</li>
                  <li>عروض حصرية عند الإطلاق</li>
                  <li>تحديثات مستمرة عن تقدم المشروع</li>
                  <li>أولوية في الدعم الفني وقت الإطلاق</li>
                </ul>
                
                <p>راح نوافيك أول بأول بالتطورات، ونتواصل معك فور ما تكون المنصة جاهزة للإطلاق.</p>
                
                <p>تحياتنا،<br>فريق جزّام</p>
          </div>
          <div class="footer" dir="rtl" style="text-align: center; direction: rtl; font-size: 12px; color: #777;">
            <p>أنت تتلقى هذا البريد الإلكتروني لأنك انضممت إلى قائمة الانتظار لدينا.</p>
          </div>
          
        </div>
      </body>
      </html>
    `;
  }

  // Generate verification email
  #generateEmailVerificationTemplate(email,verificationCode){
    return `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
              .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { padding: 30px; text-align: center; }
              .code { font-size: 36px; font-weight: bold; color: #4CAF50; letter-spacing: 2px; margin: 20px 0; font-family: monospace; }
              .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; }
              .note { background-color: #f0f0f0; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; text-align: left; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Verify Your Email</h2>
              </div>
              <div class="content">
                <p>Hello ${email},</p>
                <p>Thank you for signing up! To complete your registration, please use the verification code below:</p>
                <div class="code">${verificationCode}</div>
                <p>This code will expire in 15 minutes.</p>
                <div class="note">
                  <strong>Never share this code with anyone.</strong> Jazzaam support will never ask for your verification code.
                </div>
                <p>If you didn't request this code, please ignore this email.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} Jazzaam. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `
  }

  // ================================================
  // Send password reset email
  // ================================================

  async sendPasswordResetEmail(email, resetToken) {
    try {
      // Ensure email service is initialized
      await this.#initializeTransporter();

      if (!this.#isInitialized) {
        console.warn(
          "⚠️ Email service not initialized. Skipping password reset email."
        );
        return {
          success: false,
          message: "Email service not available",
          recipient: email,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(email, "User email");

      const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: {
          name: "Jazzaam Support",
          address: process.env.EMAIL_COMPANY,
        },
        to: email,
        subject: "Password Reset Request - Jazzaam",
        html: this.#generatePasswordResetTemplate(email, resetUrl),
        priority: "high",
      };

      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Password reset email sent successfully to ${email}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: email,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send password reset email:", error.message);
      return {
        success: false,
        message: error.message,
        recipient: email,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Generate password reset email template
  #generatePasswordResetTemplate(email, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 30px; }
            .button { display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .button:hover { background-color: #45a049; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; }
            .note { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
            .link { color: #4CAF50; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Password Reset Request</h2>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>We received a request to reset the password for your Jazzaam account associated with <strong>${email}</strong>.</p>
              <p>Click the button below to reset your password:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p class="link">${resetUrl}</p>
              <div class="note">
                <strong>⚠️ Security Notice:</strong>
                <ul style="margin: 10px 0;">
                  <li>This link will expire in 1 hour</li>
                  <li>Never share this link with anyone</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                </ul>
              </div>
              <p>If you have any questions or concerns, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Jazzaam. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

}

// Create and export a singleton instance
const emailService = new EmailService();
export default emailService;
