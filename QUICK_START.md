# 🚀 Quick Start Guide - Multi-Mailbox System

## Installation (Already Done ✅)
```bash
npm install googleapis axios  # ✅ Installed
```

## Environment Setup (Required)

Add to `.env`:
```env
ENCRYPTION_KEY=jazzam-encryption-key-2026-change-this-in-production-min32chars
MICROSOFT_CLIENT_ID=your-microsoft-client-id-here
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret-here
```

## New Files Created

```
src/
├── utils/
│   ├── encryption.util.js              ✅ Encrypt/decrypt tokens
│   └── mailbox-reply-checker.js        ✅ Check all mailboxes for replies
├── services/
│   └── email/
│       ├── gmail.service.js            ✅ Gmail OAuth & API
│       ├── outlook.service.js          ✅ Outlook OAuth & API
│       ├── yahoo.service.js            ✅ Yahoo SMTP/IMAP
│       └── unified.email.service.js    ✅ Smart routing
└── routes/
    └── mailbox.routes.js               ✅ Mailbox API endpoints
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/mailbox/list` | GET | List all mailboxes |
| `/api/v1/mailbox/connect/gmail` | GET | Connect Gmail |
| `/api/v1/mailbox/connect/outlook` | GET | Connect Outlook |
| `/api/v1/mailbox/connect/yahoo` | POST | Connect Yahoo |
| `/api/v1/mailbox/set-default/:id` | POST | Set default |
| `/api/v1/mailbox/:id` | DELETE | Disconnect |
| `/api/v1/mailbox/:id/toggle` | POST | Enable/disable |

## Email Types

### Lead/Follow-up Emails → Default Mailbox
```javascript
unifiedEmailService.sendFollowUpEmail(companyId, leadId, ...)
unifiedEmailService.sendWelcomeEmail(companyId, leadId, ...)
unifiedEmailService.sendLeadEmail(companyId, leadId, ...)
```

### System Emails → Info@jazzam.ai SMTP
```javascript
unifiedEmailService.sendVerificationEmail({ to, link, userName })
unifiedEmailService.sendWaitlistEmail({ to, userName })
unifiedEmailService.sendPasswordResetEmail({ to, link, userName })
```

## Daily Limits

| Provider | Limit |
|----------|-------|
| Gmail | 2,000 |
| Outlook | 10,000 |
| Yahoo | 500 |

## Cron Jobs

- **Every 5 minutes**: Check all mailboxes for replies
- **Daily 2 AM**: Deal health recalculation
- **Daily 3 AM**: Proposal file cleanup
- **Every 15 minutes**: CRM sync

## Testing

### 1. Connect Gmail
```
GET /api/v1/mailbox/connect/gmail
→ Follow OAuth flow
→ Check /api/v1/mailbox/list
```

### 2. Send Test Email
```javascript
// Will use default mailbox
await unifiedEmailService.sendFollowUpEmail(...)
```

### 3. Reply & Wait
- Reply to the email
- Wait 5 minutes for cron
- Check: `FollowUp.responseReceived = true` ✅

## Removed Code
- ❌ `src/utils/check-inbound-replies.js` (deleted)
- ❌ Old IMAP cron job in app.js (replaced)
- ❌ `storeMessageIdMapping` from old file (moved to new system)

## Changed Code
- ✅ `src/models/company.model.js` - Added `mailboxes` array
- ✅ `src/controllers/lead.controller.js` - Updated `followUpEmail`
- ✅ `src/app.js` - New cron + routes
- ✅ `.env` - New variables

## Security
- All tokens encrypted with AES-256-GCM
- OAuth 2.0 for Gmail/Outlook
- App passwords for Yahoo
- Automatic token refresh

## Microsoft Azure Setup (For Outlook)

1. https://portal.azure.com
2. App registrations → New
3. Redirect URI: `http://localhost:4000/api/v1/mailbox/connect/outlook/callback`
4. API permissions: Mail.Send, Mail.Read, User.Read, offline_access
5. Copy Client ID + Secret → `.env`

## Status: ✅ READY

Start server and test!
```bash
npm run dev
```
