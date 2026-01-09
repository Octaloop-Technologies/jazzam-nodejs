import { google } from 'googleapis';
import { encrypt, decrypt } from '../../utils/encryption.util.js';
import { Company } from '../../models/company.model.js';

class GmailService {
  
  /**
   * Get OAuth2 client for Gmail API
   */
  getOAuth2Client() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.SERVER_URL}/api/v1/mailbox/connect/gmail/callback`
    );
  }

  /**
   * Get authorization URL for Gmail OAuth
   */
  getAuthUrl(companyId) {
    const oauth2Client = this.getOAuth2Client();
    
    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: companyId,
      prompt: 'consent'
    });
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleCallback(code, companyId) {
    try {
      const oauth2Client = this.getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      
      oauth2Client.setCredentials(tokens);
      
      // Get user email
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();
      
      // Check if mailbox already exists
      const company = await Company.findById(companyId);
      const existingMailbox = company.mailboxes.find(m => m.email === data.email);
      
      if (existingMailbox) {
        throw new Error('This Gmail account is already connected');
      }
      
      // Add mailbox to company
      const isFirstMailbox = company.mailboxes.length === 0;
      
      company.mailboxes.push({
        provider: 'gmail',
        email: data.email,
        displayName: data.name || data.email,
        isDefault: isFirstMailbox, // First mailbox is default
        isActive: true,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        tokenExpiry: new Date(tokens.expiry_date),
        scope: tokens.scope.split(' '),
        imap: {
          host: 'imap.gmail.com',
          port: 993,
          secure: true
        },
        dailyLimit: 2000, // Gmail API limit
        connectedAt: new Date()
      });
      
      await company.save();

      console.log(`✅ Gmail connected for company ${companyId}: ${data.email}`);
      
      return {
        success: true,
        email: data.email,
        provider: 'gmail',
        isDefault: isFirstMailbox
      };
    } catch (error) {
      console.error('Gmail OAuth error:', error.message);
      throw new Error('Failed to connect Gmail: ' + error.message);
    }
  }

  /**
   * Refresh access token if expired
   */
  async refreshAccessToken(company, mailbox) {
    try {
      const oauth2Client = this.getOAuth2Client();
      
      oauth2Client.setCredentials({
        refresh_token: decrypt(mailbox.refreshToken)
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update tokens in database
      const mailboxIndex = company.mailboxes.findIndex(m => m._id.toString() === mailbox._id.toString());
      
      company.mailboxes[mailboxIndex].accessToken = encrypt(credentials.access_token);
      company.mailboxes[mailboxIndex].tokenExpiry = new Date(credentials.expiry_date);
      
      await company.save();

      return credentials.access_token;
    } catch (error) {
      console.error('Failed to refresh Gmail token:', error.message);
      throw error;
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(company, mailbox) {
    // Check if token is expired or about to expire (5 min buffer)
    const now = new Date();
    const expiryDate = new Date(mailbox.tokenExpiry);
    const bufferTime = 5 * 60 * 1000;
    
    if (now.getTime() >= (expiryDate.getTime() - bufferTime)) {
      console.log('Gmail token expired, refreshing...');
      return await this.refreshAccessToken(company, mailbox);
    }
    
    return decrypt(mailbox.accessToken);
  }

  /**
   * Send email via Gmail API
   */
  async sendEmail(company, mailbox, { to, subject, html, leadId }) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);
      
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Generate unique message ID
      const timestamp = Date.now();
      const uniqueId = `${leadId}-${timestamp}`;
      const fromEmail = mailbox.email;
      
      // Create email in RFC 2822 format
      const emailLines = [];
      emailLines.push(`From: ${mailbox.displayName || company.companyName} <${fromEmail}>`);
      emailLines.push(`To: ${to}`);
      emailLines.push(`Subject: ${subject}`);
      emailLines.push(`Message-ID: <${uniqueId}@gmail.com>`);
      emailLines.push(`X-Lead-ID: ${leadId}`);
      emailLines.push(`X-Company-ID: ${company._id}`);
      emailLines.push(`X-Mailbox-ID: ${mailbox._id}`);
      emailLines.push('Content-Type: text/html; charset=utf-8');
      emailLines.push('');
      emailLines.push(html);
      
      const email = emailLines.join('\r\n');
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      console.log(`✅ Email sent via Gmail API: ${response.data.id}`);
      
      // Update usage stats
      await this.updateUsageStats(company._id, mailbox._id);
      
      return {
        success: true,
        messageId: uniqueId,
        gmailMessageId: response.data.id,
        provider: 'gmail',
        from: fromEmail
      };
    } catch (error) {
      console.error('Gmail send error:', error.message);
      throw error;
    }
  }

  /**
   * List unread messages (for reply checking)
   */
  async listUnreadMessages(company, mailbox) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);
      
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 50
      });

      return response.data.messages || [];
    } catch (error) {
      console.error('Gmail list error:', error.message);
      throw error;
    }
  }

  /**
   * Get message details
   */
  async getMessage(company, mailbox, messageId) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);
      
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      return response.data;
    } catch (error) {
      console.error('Gmail get message error:', error.message);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(company, mailbox, messageId) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);
      
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
    } catch (error) {
      console.error('Gmail mark read error:', error.message);
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
    
    // Reset counter if it's a new day
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
   * Disconnect Gmail mailbox
   */
  async disconnect(companyId, mailboxId) {
    const company = await Company.findById(companyId);

    if(!company){
      throw new Error('Company not found')
    }

    const mailbox = company.mailboxes.find(mailbox => mailbox._id === mailboxId);

    if(mailbox){
      throw new Error('Mailbox not found')
    }

    company.mailboxes.pull(mailboxId)
    
    // If it was default, set another mailbox as default
    if (company.mailboxes.length > 0) {
      const defaultExists = company.mailboxes.some(m => m.isDefault);
      if (!defaultExists) {
        company.mailboxes[0].isDefault = true;
      }
    }
    
    await company.save();
  }
}

export default new GmailService();
