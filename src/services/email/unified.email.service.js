import nodemailer from 'nodemailer';
import { Company } from '../../models/company.model.js';
import gmailService from './gmail.service.js';
import outlookService from './outlook.service.js';
import yahooService from './yahoo.service.js';
import { storeMessageIdMapping } from '../../utils/check-inbound-replies.js';
class UnifiedEmailService {
  #systemTransporter = null;

  /**
   * Initialize system SMTP transporter (for verification, waitlist, system emails)
   */
  async #initializeSystemTransporter() {
    if (this.#systemTransporter) return this.#systemTransporter;

    if (!process.env.EMAIL_COMPANY || !process.env.EMAIL_APP_PASSWORD) {
      throw new Error('System email configuration not found');
    }

    this.#systemTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_PORT == 465,
      auth: {
        user: process.env.EMAIL_COMPANY,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    })

    await this.#systemTransporter.verify();
    console.log('✅ System SMTP transporter initialized');

    return this.#systemTransporter;
  }

  /**
   * Get default mailbox for company
   */
  async getDefaultMailbox(companyId) {
    const company = await Company.findById(companyId).select('companyName mailboxes');

    if (!company) {
      throw new Error('Company not found');
    }

    // Find default mailbox
    const defaultMailbox = company.mailboxes.find(m => m.isDefault && m.isActive);

    return { company, mailbox: defaultMailbox };
  }

  /**
   * Send lead/follow-up email via default mailbox
   */
  async sendLeadEmail(companyId, leadId, { to, subject, html, message }) {
    try {
      const { company, mailbox } = await this.getDefaultMailbox(companyId);

      // If no mailbox configured, throw error (don't fallback for lead emails)
      if (!mailbox) {
        throw new Error('No default mailbox configured. Please connect a mailbox first.');
      }

      // Check daily limit
      if (mailbox.dailyUsage.count >= mailbox.dailyLimit) {
        throw new Error(`Daily email limit (${mailbox.dailyLimit}) exceeded for ${mailbox.email}`);
      }

      console.log(`📧 Sending lead email via ${mailbox.provider} (${mailbox.email})`);

      // Generate unique message ID for tracking
      const uniqueId = `${leadId}-${Date.now()}`;
      const messageId = `${uniqueId}@jazzam.ai`;

      // Store messageId to companyId mapping for reply processing
      storeMessageIdMapping(uniqueId, companyId, leadId);

      // Add tracking headers
      const trackingHeaders = {
        'X-Tracking-ID': uniqueId,
        'X-Email-Type': 'lead',
        'X-Lead-ID': leadId.toString(),
        'X-Company-ID': companyId.toString(),
        'X-Message-ID': uniqueId,
      };

      let result;

      // Route to appropriate provider
      switch (mailbox.provider) {
        case 'gmail':
          result = await gmailService.sendEmail(company, mailbox, { to, subject, html, leadId });
          break;

        case 'outlook':
          result = await outlookService.sendEmail(company, mailbox, { to, subject, html, leadId });
          break;

        case 'yahoo':
          result = await yahooService.sendEmail(company, mailbox, { to, subject, html, leadId });
          break;

        default:
          throw new Error(`Unknown mailbox provider: ${mailbox.provider}`);
      }

      return result;

    } catch (error) {
      console.error('❌ Lead email send failed:', error.message);
      throw error;
    }
  }

  /**
   * Send system email (verification, waitlist, etc.) via system SMTP
   */
  async sendSystemEmail({ to, subject, html, from }) {
    try {
      const transporter = await this.#initializeSystemTransporter();

      const mailOptions = {
        from: from || {
          name: 'Jazzam',
          address: process.env.EMAIL_COMPANY,
        },
        to: to,
        subject: subject,
        html: html,
        priority: 'normal',
      };

      const info = await transporter.sendMail(mailOptions);

      console.log(`✅ System email sent: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        provider: 'system-smtp',
        from: process.env.EMAIL_COMPANY
      };
    } catch (error) {
      console.error('❌ System email send failed:', error.message);
      throw error;
    }
  }

  /**
   * Send follow-up email (wrapper for backward compatibility)
   */
  async sendFollowUpEmail(companyId, leadId, companyName, email, subject, message) {
    const html = this.#generateFollowUpEmailTemplate(email, message, companyName);

    return await this.sendLeadEmail(companyId, leadId, {
      to: email,
      subject: subject || 'Following up on your inquiry',
      html: html,
      message: message
    });
  }

  /**
   * Send welcome email to lead via default mailbox
   */
  async sendWelcomeEmail(companyId, leadId, { to, subject, html }) {
    return await this.sendLeadEmail(companyId, leadId, {
      to,
      subject: subject || 'Welcome!',
      html
    });
  }

  /**
   * Send welcome email with tracking (for backward compatibility with lead controller)
   */
  async sendWelcomeEmailWithTracking(lead, form) {
    const companyId = form.companyId?._id || form.companyId;
    const companyName = form.companyId?.companyName || 'Our Company';
    const subject = form.settings?.autoResponse?.subject || 'Thank you for your interest!';
    const message = form.settings?.autoResponse?.message || "Thank you for reaching out. We'll get back to you soon!";

    const html = this.#generateWelcomeEmailTemplate(lead, companyName, message, lead._id);

    return await this.sendLeadEmail(companyId, lead._id, {
      to: lead.email,
      subject: subject,
      html: html
    });
  }

  /**
   * Send email verification (SYSTEM EMAIL)
   */
  async sendVerificationEmail(email, verificationCode) {
    const html = this.#generateVerificationEmailTemplate(email, verificationCode);

    return await this.sendSystemEmail({
      to: email,
      subject: 'Verify your email address - Jazzam',
      html
    });
  }

  /**
   * Send waitlist confirmation (SYSTEM EMAIL)
   */
  async sendWaitlistEmail({ to, userName }) {
    const html = this.#generateWaitlistEmailTemplate(userName);

    return await this.sendSystemEmail({
      to,
      subject: 'Welcome to the waitlist!',
      html
    });
  }

  /**
   * Send password reset email (SYSTEM EMAIL)
   */
  async sendPasswordResetEmail({ to, resetLink, userName }) {
    const html = this.#generatePasswordResetTemplate(resetLink, userName);

    return await this.sendSystemEmail({
      to,
      subject: 'Reset your password',
      html
    });
  }

  /**
   * Get mailbox info for company
   */
  async getMailboxInfo(companyId) {
    const company = await Company.findById(companyId).select('mailboxes');

    if (!company) return null;

    return company.mailboxes.map(m => ({
      id: m._id,
      provider: m.provider,
      email: m.email,
      displayName: m.displayName,
      isDefault: m.isDefault,
      isActive: m.isActive,
      dailyLimit: m.dailyLimit,
      dailyUsage: m.dailyUsage.count,
      resetAt: m.dailyUsage.resetAt,
      totalSent: m.emailsSent,
      lastUsedAt: m.lastUsedAt,
      connectedAt: m.connectedAt
    }));
  }

  /**
   * Set default mailbox
   */
  async setDefaultMailbox(companyId, mailboxId) {
    const company = await Company.findById(companyId);

    if (!company) {
      throw new Error('Company not found');
    }

    // Remove default from all mailboxes
    company.mailboxes.forEach(m => {
      m.isDefault = false;
    });

    // Set new default
    const mailbox = company.mailboxes.id(mailboxId);
    if (!mailbox) {
      throw new Error('Mailbox not found');
    }

    mailbox.isDefault = true;
    await company.save();

    return {
      success: true,
      email: mailbox.email,
      provider: mailbox.provider
    };
  }

  /**
   * Check if can send email (rate limiting)
   */
  async canSendEmail(companyId) {
    try {
      const { mailbox } = await this.getDefaultMailbox(companyId);

      if (!mailbox) return false;

      return mailbox.dailyUsage.count < mailbox.dailyLimit;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate welcome email template with tracking pixel
   */
  #generateWelcomeEmailTemplate(lead, companyName, message, trackingToken) {
    const leadName = lead.fullName || lead.firstName || "there";

    // Create tracking pixel url
    const trackingPixelUrl = `${process.env.SERVER_URL}/api/email/track/open/${trackingToken}`;

    // Add tracking pixel to HTML
    const trackingPixel = `
    <img 
      src="${trackingPixelUrl}?rand=${Math.random()}"
      width="1"
      height="1"
      style="display:none;width:1px;height:1px;opacity:0;"
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
  }

  /**
   * Generate follow-up email template
   */
  #generateFollowUpEmailTemplate(email, message, companyName = 'Our Company') {
    const leadName = email || "there";

    return `
     <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Follow Up</title>
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
            
            <p>Best regards,<br>The ${companyName} Team</p>
          </div>
          <div class="footer">
            <p>You're receiving this email because you showed interest in our services.</p>
          </div>
          
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate verification email template with code (bilingual: English + Arabic)
   */
  #generateVerificationEmailTemplate(email, verificationCode) {
    return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
              .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .header-ar { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
              .content { padding: 30px; text-align: center; }
              .code { font-size: 36px; font-weight: bold; color: #4CAF50; letter-spacing: 2px; margin: 20px 0; font-family: monospace; }
              .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; }
              .note { background-color: #f0f0f0; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; text-align: left; }
              .note-ar { background-color: #f0f0f0; padding: 15px; border-right: 4px solid #4CAF50; margin: 20px 0; text-align: right; }
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
                  <strong>Never share this code with anyone.</strong> Jazzam support will never ask for your verification code.
                </div>
                <p>If you didn't request this code, please ignore this email.</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} Jazzam. All rights reserved.</p>
              </div>
              
              <hr style="margin: 30px 0; border: 1px solid #eee;">
              
              <div class="header-ar">
                <h2>تأكيد البريد الإلكتروني</h2>
              </div>
              <div class="content" dir="rtl" style="text-align: center; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <p>مرحبًا ${email}،</p>
                <p>شكرًا لتسجيلك! لإكمال عملية التسجيل، يرجى استخدام رمز التحقق أدناه:</p>
                <div class="code">${verificationCode}</div>
                <p>هذا الرمز صالح لمدة 15 دقيقة.</p>
                <div class="note-ar">
                  <strong>لا تشارك هذا الرمز مع أي شخص أبدًا.</strong> فريق جزّام لن يطلب منك رمز التحقق أبدًا.
                </div>
                <p>إذا لم تطلب هذا الرمز، يرجى تجاهل هذا البريد الإلكتروني.</p>
              </div>
              <div class="footer" dir="rtl" style="text-align: center; direction: rtl;">
                <p>&copy; ${new Date().getFullYear()} جزّام. جميع الحقوق محفوظة.</p>
              </div>
            </div>
          </body>
        </html>
      `;
  }

  /**
   * Generate waitlist email template (bilingual: English + Arabic)
   */
  #generateWaitlistEmailTemplate(userName) {
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
            
            <p>Best regards,<br>The Jazzam Team</p>
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

  /**
   * Generate password reset email template
   */
  #generatePasswordResetTemplate(resetLink, userName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Reset your password</h2>
          <p>Hi ${userName || 'there'},</p>
          <p>We received a request to reset your password. Click the button below to reset it:</p>
          <a href="${resetLink}" class="button">Reset Password</a>
          <p>Or copy and paste this link in your browser:</p>
          <p>${resetLink}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>The Jazzam Team</p>
        </div>
      </body>
      </html>
    `;
  }
}

export default new UnifiedEmailService();
