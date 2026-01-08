import { ImapFlow } from "imapflow";
import { Company } from "../models/company.model.js";
import { getTenantConnection } from "../db/tenantConnection.js";
import { getTenantModels } from "../models/index.js";
import dealHealthService from "../services/dealHealth.service.js";
import gmailService from "../services/email/gmail.service.js";
import outlookService from "../services/email/outlook.service.js";
import { decrypt } from "./encryption.util.js";

/**
 * Check Gmail mailbox for replies
 */
async function checkGmailMailbox(company, mailbox) {
  try {
    console.log(`📬 Checking Gmail: ${mailbox.email}`);
    
    const messages = await gmailService.listUnreadMessages(company, mailbox);
    
    for (const message of messages) {
      try {
        const fullMessage = await gmailService.getMessage(company, mailbox, message.id);
        await processGmailMessage(company, mailbox, fullMessage);
        await gmailService.markAsRead(company, mailbox, message.id);
      } catch (error) {
        console.error(`Error processing Gmail message ${message.id}:`, error.message);
      }
    }
    
    console.log(`✅ Processed ${messages.length} Gmail messages from ${mailbox.email}`);
  } catch (error) {
    console.error(`❌ Gmail check failed for ${mailbox.email}:`, error.message);
  }
}

/**
 * Check Outlook mailbox for replies
 */
async function checkOutlookMailbox(company, mailbox) {
  try {
    console.log(`📬 Checking Outlook: ${mailbox.email}`);
    
    const messages = await outlookService.listUnreadMessages(company, mailbox);
    
    for (const message of messages) {
      try {
        await processOutlookMessage(company, mailbox, message);
        await outlookService.markAsRead(company, mailbox, message.id);
      } catch (error) {
        console.error(`Error processing Outlook message ${message.id}:`, error.message);
      }
    }
    
    console.log(`✅ Processed ${messages.length} Outlook messages from ${mailbox.email}`);
  } catch (error) {
    console.error(`❌ Outlook check failed for ${mailbox.email}:`, error.message);
  }
}

/**
 * Check Yahoo mailbox via IMAP
 */
async function checkYahooMailbox(company, mailbox) {
  const client = new ImapFlow({
    host: mailbox.imap.host,
    port: mailbox.imap.port,
    secure: mailbox.imap.secure,
    auth: {
      user: mailbox.email,
      pass: decrypt(mailbox.accessToken), // App password
    },
    logger: false,
  });

  try {
    await client.connect();
    console.log(`✅ Connected to Yahoo IMAP: ${mailbox.email}`);

    let lock = await client.getMailboxLock("INBOX");
    try {
      for await (let msg of client.fetch("UNSEEN", {
        envelope: true,
        headers: ["in-reply-to", "X-Lead-ID", "X-Company-ID", "X-Mailbox-ID"],
      })) {
        try {
          await processImapMessage(company, mailbox, msg);
          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
        } catch (error) {
          console.error(`Error processing Yahoo message:`, error.message);
        }
      }
    } finally {
      lock.release();
    }
    
    console.log(`✅ Checked Yahoo mailbox: ${mailbox.email}`);
  } catch (error) {
    console.error(`❌ Yahoo IMAP check failed for ${mailbox.email}:`, error.message);
  } finally {
    await client.logout();
  }
}

/**
 * Process Gmail message
 */
async function processGmailMessage(company, mailbox, message) {
  const headers = message.payload.headers;
  const inReplyToHeader = headers.find(h => h.name.toLowerCase() === 'in-reply-to');
  const leadIdHeader = headers.find(h => h.name.toLowerCase() === 'x-lead-id');
  
  if (!inReplyToHeader) return;

  const inReplyTo = inReplyToHeader.value;
  const match = inReplyTo.match(/<([^>]+)@/);
  if (!match) return;

  const originalMessageId = match[1];
  const parts = originalMessageId.split("-");
  if (parts.length < 2) return;

  const leadId = leadIdHeader?.value || parts[0];
  const companyId = company._id.toString();

  await updateLeadResponse(companyId, leadId);
}

/**
 * Process Outlook message
 */
async function processOutlookMessage(company, mailbox, message) {
  const internetHeaders = message.internetMessageHeaders || [];
  const inReplyToHeader = internetHeaders.find(h => h.name.toLowerCase() === 'in-reply-to');
  const leadIdHeader = internetHeaders.find(h => h.name.toLowerCase() === 'x-lead-id');
  
  if (!inReplyToHeader) return;

  const inReplyTo = inReplyToHeader.value;
  const match = inReplyTo.match(/<([^>]+)@/);
  if (!match) return;

  const originalMessageId = match[1];
  const parts = originalMessageId.split("-");
  if (parts.length < 2) return;

  const leadId = leadIdHeader?.value || parts[0];
  const companyId = company._id.toString();

  await updateLeadResponse(companyId, leadId);
}

/**
 * Process IMAP message (Yahoo)
 */
async function processImapMessage(company, mailbox, msg) {
  const inReplyTo = msg.envelope?.inReplyTo;
  if (!inReplyTo) return;

  const match = inReplyTo.match(/<([^>]+)@/);
  if (!match) return;

  const originalMessageId = match[1];
  const parts = originalMessageId.split("-");
  if (parts.length < 2) return;

  const leadId = parts[0];
  const companyId = company._id.toString();

  await updateLeadResponse(companyId, leadId);
}

/**
 * Update lead and follow-up with response received
 */
async function updateLeadResponse(companyId, leadId) {
  try {
    const tenantConnection = await getTenantConnection(companyId);
    const { EngagementHistory, FollowUp } = getTenantModels(tenantConnection);

    // Update engagement history
    await EngagementHistory.findOneAndUpdate(
      {
        leadId,
        engagementType: "email_sent",
        direction: "outbound",
      },
      {
        $set: {
          engagementType: "responded",
          "emailMetrics.respondedAt": new Date(),
          direction: "inbound"
        }
      }
    );

    // Update follow-up
    const followUpUpdate = await FollowUp.findOneAndUpdate(
      { leadId },
      {
        $set: {
          responseReceived: true
        }
      }
    );

    if (followUpUpdate) {
      console.log(`✅ Marked follow-up as responded for lead: ${leadId}`);
    }

    // Recalculate deal health
    await dealHealthService.calculateDealHealth(companyId, leadId);

  } catch (error) {
    console.error(`Error updating lead response for ${leadId}:`, error.message);
  }
}

/**
 * Main function - Check all mailboxes for all companies
 */
async function checkAllMailboxes() {
  console.log("📬 Starting multi-mailbox reply check:", new Date().toISOString());

  try {
    // Get all companies with active mailboxes
    const companies = await Company.find({
      'mailboxes.0': { $exists: true } // Has at least one mailbox
    }).select('_id companyName mailboxes').lean();

    console.log(`📧 Found ${companies.length} companies with mailboxes`);

    // Check each company's mailboxes
    for (const company of companies) {
      try {
        // Get full company document for methods
        const fullCompany = await Company.findById(company._id);
        
        for (const mailbox of company.mailboxes) {
          // Skip inactive mailboxes
          if (!mailbox.isActive) {
            console.log(`⏭️ Skipping inactive mailbox: ${mailbox.email}`);
            continue;
          }

          // Route to appropriate checker based on provider
          switch (mailbox.provider) {
            case 'gmail':
              await checkGmailMailbox(fullCompany, mailbox);
              break;
            case 'outlook':
              await checkOutlookMailbox(fullCompany, mailbox);
              break;
            case 'yahoo':
              await checkYahooMailbox(fullCompany, mailbox);
              break;
            default:
              console.log(`Unknown provider ${mailbox.provider} for ${mailbox.email}`);
          }
        }
      } catch (error) {
        console.error(`Failed to check mailboxes for company ${company._id}:`, error.message);
      }
    }

    console.log("✅ Completed multi-mailbox reply check");

  } catch (error) {
    console.error("❌ Multi-mailbox check failed:", error.message);
  }
}

export default checkAllMailboxes;
