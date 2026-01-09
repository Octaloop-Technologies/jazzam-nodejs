import nodemailer from 'nodemailer';
import { encrypt, decrypt } from '../../utils/encryption.util.js';
import { Company } from '../../models/company.model.js';

class YahooService {
  #transporters = new Map();

  /**
   * Connect Yahoo account via app password
   * Yahoo requires app-specific passwords for SMTP/IMAP access
   */
  async connect(companyId, email, appPassword, displayName) {
    try {
      // Test SMTP connection
      const transporter = nodemailer.createTransporter({
        host: 'smtp.mail.yahoo.com',
        port: 465,
        secure: true,
        auth: {
          user: email,
          pass: appPassword
        }
      });

      // Verify connection
      await transporter.verify();

      const company = await Company.findById(companyId);

      // Check if mailbox already exists
      const existingMailbox = company.mailboxes.find(m => m.email === email);
      if (existingMailbox) {
        throw new Error('This Yahoo account is already connected');
      }

      // Add mailbox to company
      const isFirstMailbox = company.mailboxes.length === 0;

      company.mailboxes.push({
        provider: 'yahoo',
        email: email,
        displayName: displayName || email,
        isDefault: isFirstMailbox,
        isActive: true,
        accessToken: encrypt(appPassword), // Store app password as access token
        refreshToken: null, // Yahoo doesn't have refresh tokens
        tokenExpiry: null, // App passwords don't expire
        scope: [],
        imap: {
          host: 'imap.mail.yahoo.com',
          port: 993,
          secure: true
        },
        dailyLimit: 500, // Yahoo SMTP limit
        connectedAt: new Date()
      });

      await company.save();

      console.log(`✅ Yahoo connected for company ${companyId}: ${email}`);

      return {
        success: true,
        email: email,
        provider: 'yahoo',
        isDefault: isFirstMailbox
      };
    } catch (error) {
      console.error('Yahoo connection error:', error.message);
      throw new Error('Failed to connect Yahoo: ' + error.message);
    }
  }

  /**
   * Get SMTP transporter for Yahoo mailbox
   */
  async getTransporter(company, mailbox) {
    const cacheKey = `${company._id}_${mailbox._id}`;

    if (this.#transporters.has(cacheKey)) {
      return this.#transporters.get(cacheKey);
    }

    const transporter = nodemailer.createTransporter({
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true,
      auth: {
        user: mailbox.email,
        pass: decrypt(mailbox.accessToken) // App password
      }
    });

    await transporter.verify();
    this.#transporters.set(cacheKey, transporter);

    return transporter;
  }

  /**
   * Send email via Yahoo SMTP
   */
  async sendEmail(company, mailbox, { to, subject, html, leadId }) {
    try {
      const transporter = await this.getTransporter(company, mailbox);

      const timestamp = Date.now();
      const uniqueId = `${leadId}-${timestamp}`;
      const fromEmail = mailbox.email;

      const mailOptions = {
        from: {
          name: mailbox.displayName || company.companyName,
          address: fromEmail,
        },
        to: to,
        subject: subject,
        html: html,
        messageId: `<${uniqueId}@yahoo.com>`,
        headers: {
          'X-Lead-ID': leadId,
          'X-Company-ID': company._id.toString(),
          'X-Mailbox-ID': mailbox._id.toString(),
        }
      };

      const info = await transporter.sendMail(mailOptions);

      console.log(`✅ Email sent via Yahoo SMTP: ${info.messageId}`);

      await this.updateUsageStats(company._id, mailbox._id);

      return {
        success: true,
        messageId: uniqueId,
        smtpMessageId: info.messageId,
        provider: 'yahoo',
        from: fromEmail
      };
    } catch (error) {
      console.error('Yahoo send error:', error.message);
      throw error;
    }
  }

  /**
   * Update usage statistics
   */
  async updateUsageStats(companyId, mailboxId) {
    const company = await Company.findById(companyId);
    const mailbox = company.mailboxes.id(mailboxId);
    const now = new Date();
    const resetAt = mailbox.dailyUsage.resetAt;

    if (!resetAt || now > resetAt) {
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);

      mailbox.dailyUsage.count = 1;
      mailbox.dailyUsage.resetAt = tomorrow;
      mailbox.emailsSent += 1;
      mailbox.lastUsedAt = now;
    } else {
      mailbox.dailyUsage.count += 1;
      mailbox.emailsSent += 1;
      mailbox.lastUsedAt = now;
    }

    await company.save();
  }

  /**
   * Test Yahoo connection
   */
  async testConnection(email, appPassword) {
    try {
      const transporter = nodemailer.createTransporter({
        host: 'smtp.mail.yahoo.com',
        port: 465,
        secure: true,
        auth: {
          user: email,
          pass: appPassword
        }
      });

      await transporter.verify();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect Yahoo mailbox
   */
  async disconnect(companyId, mailboxId) {
    const company = await Company.findById(companyId);

    if (!company) {
      throw new Error('Company not found');
    }

    const mailbox = company.mailboxes.find(mailbox => mailbox._id === mailboxId);

    if (!mailbox) {
      throw new Error('Mailbox not found');
    }

    // Remove from transporter cache
    const cacheKey = `${companyId}_${mailboxId}`;
    this.#transporters.delete(cacheKey);

    // Remove from database using pull
    company.mailboxes.pull(mailboxId);

    // If it was default, set another mailbox as default
    if (company.mailboxes.length > 0) {
      const defaultExists = company.mailboxes.some(m => m.isDefault);
      if (!defaultExists) {
        company.mailboxes[0].isDefault = true;
      }
    }

    await company.save();
  }

  /**
   * Clear transporter cache
   */
  clearCache(companyId, mailboxId) {
    const cacheKey = `${companyId}_${mailboxId}`;
    this.#transporters.delete(cacheKey);
  }
}

export default new YahooService();
