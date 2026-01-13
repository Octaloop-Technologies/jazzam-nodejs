import axios from 'axios';
import { encrypt, decrypt } from '../../utils/encryption.util.js';
import { Company } from '../../models/company.model.js';

class OutlookService {

  /**
   * Get authorization URL for Microsoft OAuth
   */
  getAuthUrl(companyId) {
    const scopes = [
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/User.Read',
      'offline_access'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: `${process.env.SERVER_URL}/api/v1/mailbox/connect/outlook/callback`,
      response_mode: 'query',
      scope: scopes,
      state: companyId,
      prompt: 'consent' // Force consent screen to appear
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleCallback(code, companyId) {
    try {
      const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

      const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code: code,
        redirect_uri: `${process.env.SERVER_URL}/api/v1/mailbox/connect/outlook/callback`,
        grant_type: 'authorization_code'
      });

      const response = await axios.post(tokenUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const tokens = response.data;

      // Get user email
      const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });

      const userEmail = userResponse.data.mail || userResponse.data.userPrincipalName;
      const displayName = userResponse.data.displayName;

      // Check if mailbox already exists
      const company = await Company.findById(companyId);
      const existingMailbox = company.mailboxes.find(m => m.email === userEmail);

      if (existingMailbox) {
        throw new Error('This Outlook account is already connected');
      }

      // Calculate expiry
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + tokens.expires_in);

      // Add mailbox to company
      const isFirstMailbox = company.mailboxes.length === 0;

      company.mailboxes.push({
        provider: 'outlook',
        email: userEmail,
        displayName: displayName || userEmail,
        isDefault: isFirstMailbox,
        isActive: true,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        tokenExpiry: expiryDate,
        scope: tokens.scope.split(' '),
        imap: {
          host: 'outlook.office365.com',
          port: 993,
          secure: true
        },
        dailyLimit: 10000, // Outlook limit
        connectedAt: new Date()
      });

      await company.save();

      console.log(`✅ Outlook connected for company ${companyId}: ${userEmail}`);

      return {
        success: true,
        email: userEmail,
        provider: 'outlook',
        isDefault: isFirstMailbox
      };
    } catch (error) {
      console.error('Outlook OAuth error:', error.response?.data || error.message);
      throw new Error('Failed to connect Outlook: ' + error.message);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(company, mailbox) {
    try {
      const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

      const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        refresh_token: decrypt(mailbox.refreshToken),
        grant_type: 'refresh_token'
      });

      const response = await axios.post(tokenUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const tokens = response.data;

      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + tokens.expires_in);

      // Update tokens in database
      const mailboxIndex = company.mailboxes.findIndex(m => m._id.toString() === mailbox._id.toString());

      company.mailboxes[mailboxIndex].accessToken = encrypt(tokens.access_token);
      company.mailboxes[mailboxIndex].tokenExpiry = expiryDate;

      await company.save();

      return tokens.access_token;
    } catch (error) {
      console.error('Failed to refresh Outlook token:', error.message);
      throw error;
    }
  }

  /**
   * Get valid access token
   */
  async getValidAccessToken(company, mailbox) {
    const now = new Date();
    const expiryDate = new Date(mailbox.tokenExpiry);
    const bufferTime = 5 * 60 * 1000;

    if (now.getTime() >= (expiryDate.getTime() - bufferTime)) {
      console.log('Outlook token expired, refreshing...');
      return await this.refreshAccessToken(company, mailbox);
    }

    return decrypt(mailbox.accessToken);
  }

  /**
   * Send email via Microsoft Graph API
   */
  async sendEmail(company, mailbox, { to, subject, html, leadId }) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);

      const timestamp = Date.now();
      const uniqueId = `${leadId}-${timestamp}`;
      const fromEmail = mailbox.email;

      const message = {
        message: {
          subject: subject,
          body: {
            contentType: 'HTML',
            content: html
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ],
          from: {
            emailAddress: {
              name: mailbox.displayName || company.companyName,
              address: fromEmail
            }
          },
          internetMessageHeaders: [
            { name: 'X-Lead-ID', value: leadId },
            { name: 'X-Company-ID', value: company._id.toString() },
            { name: 'X-Mailbox-ID', value: mailbox._id.toString() },
            { name: 'Message-ID', value: `<${uniqueId}@outlook.com>` }
          ]
        },
        saveToSentItems: true
      };

      await axios.post(
        'https://graph.microsoft.com/v1.0/me/sendMail',
        message,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Email sent via Outlook API`);

      await this.updateUsageStats(company._id, mailbox._id);

      return {
        success: true,
        messageId: uniqueId,
        provider: 'outlook',
        from: fromEmail
      };
    } catch (error) {
      console.error('Outlook send error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * List unread messages
   */
  async listUnreadMessages(company, mailbox) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);

      const response = await axios.get(
        'https://graph.microsoft.com/v1.0/me/messages?$filter=isRead eq false&$top=50',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      return response.data.value || [];
    } catch (error) {
      console.error('Outlook list error:', error.message);
      throw error;
    }
  }

  /**
   * Get message details
   */
  async getMessage(company, mailbox, messageId) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);

      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Outlook get message error:', error.message);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(company, mailbox, messageId) {
    try {
      const accessToken = await this.getValidAccessToken(company, mailbox);

      await axios.patch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
        { isRead: true },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error('Outlook mark read error:', error.message);
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
   * Disconnect Outlook mailbox
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

    // Remove the mailbox using pull
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
}

export default new OutlookService();
