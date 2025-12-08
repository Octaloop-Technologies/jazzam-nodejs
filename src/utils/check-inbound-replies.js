// check-inbound-replies.js

import { ImapFlow } from "imapflow";
import { Lead } from "../models/lead.model.js";
import dealHealthService from "../services/dealHealth.service.js";
import { EngagementHistory } from "../models/engagementHistory.model.js";

// In-memory cache for messageId to companyId mapping
// In production, you should use a persistent storage like Redis or a DB collection
const messageIdToCompanyMap = new Map();

// Store messageId mapping when email is sent (call from email.service.js)
export function storeMessageIdMapping(messageId, companyId, leadId) {
    messageIdToCompanyMap.set(messageId, {
        companyId,
        leadId,
        storedAt: new Date(),
    });

    console.log(`📧 Stored mapping: ${messageId} -> ${companyId}`);
}

async function checkReplies() {
    const client = new ImapFlow({
        // host: process.env.SMTP_HOST,
        host: "imap.hostinger.com",
        // port: process.env.SMTP_PORT,
        port: 993,
        secure: true,
        auth: {
            user: process.env.EMAIL_COMPANY,
            pass: process.env.EMAIL_APP_PASSWORD
        }
    });

    try {
        await client.connect();
        console.log("✅ Connected to IMAP server");

        // Select INBOX
        let lock = await client.getMailboxLock("INBOX");
        try {
            for await (let msg of client.fetch("1:*", {
                envelope: true,
                headers: ["in-reply-to", "references", "message-id", "X-Tracking-ID", "X-Lead-ID", "X-Message-ID"],
                bodyStructure: true
            })) {

                const inReplyTo = msg.envelope?.inReplyTo;
                console.log("inreplyTo:****", inReplyTo)
                if (!inReplyTo) continue;

                // Extract your messageId from <messageId@jazzam.ai>
                const match = inReplyTo.match(/<([^>]+)@jazzam\.ai>/);
                if (!match) continue;

                const originalMessageId = match[1]; // e.g. leadId-timestamp

                try {
                    // Parse the messageId format: leadId-timestamp
                    const parts = originalMessageId.split("-");
                    if (parts.length < 2) {
                        console.warn(`⚠️ Invalid messageId format: ${originalMessageId}`);
                        continue;
                    }

                    const leadId = parts[0];
                    const timestamp = parts.slice(1).join("-"); // Handle timestamps with dashes

                    // Lookup companyId from mapping or from database
                    let companyId = null;

                    // Try cache first
                    if (messageIdToCompanyMap.has(originalMessageId)) {
                        companyId = messageIdToCompanyMap.get(originalMessageId).companyId;
                    } else {
                        // Fallback: lookup from Lead document
                        const lead = await Lead.findById(leadId).select('companyId').lean();
                        if (lead) {
                            companyId = lead.companyId;
                        }
                    }

                    if (!companyId) {
                        console.warn(`⚠️ Could not find companyId for leadId: ${leadId}`);
                        continue;
                    }

                    // Log the reply in your DB
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
                        },
                        { new: true }
                    );

                    await dealHealthService.calculateDealHealth(companyId, leadId)

                    console.log(`✅ Reply detected and logged:`, {
                        messageId: originalMessageId,
                        leadId,
                        companyId,
                        timestamp: new Date().toISOString(),
                        engagementResult
                    });

                } catch (error) {
                    console.error(`❌ Error processing reply for messageId ${originalMessageId}:`, error.message);
                    continue;
                }
            }
        } finally {
            lock.release();
        }

    } catch (error) {
        console.error("❌ Error checking replies:", error.message);
    } finally {
        await client.logout();
        console.log("✅ Disconnected from IMAP server");
    }
}

// Export the function and helper
export default checkReplies;
