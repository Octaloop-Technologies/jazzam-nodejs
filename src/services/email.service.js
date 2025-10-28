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
        `✅ Welcome email sent successfully to ${lead.email}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: lead.email,
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

  async sendFollowUpEmail(lead, form) {
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
          recipient: lead.email,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate input parameters
      this.#validateEmailAddress(lead.email, "Lead email");

      const mailOptions = this.#buildFollowUpMailOptions(lead, form);
      const emailResult = await this.#sendEmail(mailOptions);

      console.log(
        `✅ Follow-up email sent successfully to ${lead.email}: ${emailResult.messageId}`
      );
      return {
        success: true,
        messageId: emailResult.messageId,
        recipient: lead.email,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send follow-up email:", error.message);
      return {
        success: false,
        message: error.message,
        recipient: lead.email,
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

    return {
      from: {
        name: companyName,
        address: process.env.EMAIL_COMPANY,
      },
      to: lead.email,
      subject: subject,
      html: this.#generateWelcomeEmailTemplate(lead, companyName, message),
      priority: "normal",
    };
  }

  // Build mail options for follow-up email
  #buildFollowUpMailOptions(lead, form) {
    const companyName = form?.companyId?.companyName || "Our Company";
    const subject =
      form?.settings?.followUp?.subject || "Following up on your inquiry";
    const message =
      form?.settings?.followUp?.message ||
      "Hi there! We wanted to follow up on your recent inquiry. Do you have any questions?";

    return {
      from: {
        name: companyName,
        address: process.env.EMAIL_COMPANY,
      },
      to: lead.email,
      subject: subject,
      html: this.#generateFollowUpEmailTemplate(lead, companyName, message),
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
  #generateWelcomeEmailTemplate(lead, companyName, message) {
    const leadName = lead.fullName || lead.firstName || "there";

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
        <div class="footer">
          <p>This email was sent to ${lead.email}</p>
        </div>
      </body>
      </html>
    `;
  }

  // Generate follow-up email template
  #generateFollowUpEmailTemplate(lead, companyName, message) {
    const leadName = lead.fullName || lead.firstName || "there";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Follow-up from ${companyName}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
          .content { padding: 20px; background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Following Up from ${companyName}</h1>
        </div>
        <div class="content">
          <p>Hi ${leadName},</p>
          <p>${message}</p>
          <p>If you have any questions or would like to discuss further, please don't hesitate to reach out.</p>
          <p>Best regards,<br>The ${companyName} Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${lead.email}</p>
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
}

// Create and export a singleton instance
const emailService = new EmailService();
export default emailService;
