# CRM Integration & Automation Guide

This guide explains how to set up and use the CRM integrations and Make.com automation features.

## Table of Contents

1. [Overview](#overview)
2. [Phase One: CRM Integration](#phase-one-crm-integration)
3. [Phase Two: Make.com Automation](#phase-two-makecom-automation)
4. [Setup Instructions](#setup-instructions)
5. [API Documentation](#api-documentation)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The integration system consists of two main phases:

### Phase One: CRM Integration

- **Supported CRMs**: Zoho, Salesforce, HubSpot, Microsoft Dynamics 365
- **Features**: OAuth2 authentication, automatic lead sync, bidirectional sync, field mapping
- **Architecture**: Secure token storage, automatic token refresh, webhook support

### Phase Two: Make.com Automation

- **Features**: Pre-built templates, custom workflows, webhook triggers
- **Use Cases**: Lead enrichment, notifications, CRM sync, smart distribution
- **Architecture**: Tenant-specific webhooks, usage tracking, retry logic

---

## Phase One: CRM Integration

### Supported CRM Providers

#### 1. Zoho CRM

**Features**:

- Lead, Contact, and Account sync
- Custom field mapping
- Real-time webhooks
- Bulk operations

**Setup**:

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Create a new "Server-based Application"
3. Add redirect URI: `https://yourdomain.com/api/v1/crm-integration/oauth/callback/zoho`
4. Copy Client ID and Client Secret
5. Add to `.env`:
   ```
   ZOHO_CLIENT_ID=your-client-id
   ZOHO_CLIENT_SECRET=your-client-secret
   ```

#### 2. Salesforce

**Features**:

- Lead, Contact, Account sync
- SOQL queries
- Platform events
- Apex triggers

**Setup**:

1. Go to Salesforce Setup → App Manager
2. Create a new "Connected App"
3. Enable OAuth Settings
4. Add callback URL: `https://yourdomain.com/api/v1/crm-integration/oauth/callback/salesforce`
5. Select scopes: `api`, `refresh_token`, `offline_access`
6. Add to `.env`:
   ```
   SALESFORCE_CLIENT_ID=your-consumer-key
   SALESFORCE_CLIENT_SECRET=your-consumer-secret
   ```

#### 3. HubSpot

**Features**:

- Contact and Company sync
- Deal pipeline integration
- Timeline events
- Email integration

**Setup**:

1. Go to [HubSpot App Developer](https://developers.hubspot.com/)
2. Create a new app
3. Add redirect URI: `https://yourdomain.com/api/v1/crm-integration/oauth/callback/hubspot`
4. Request scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.companies.read`
   - `crm.objects.companies.write`
5. Add to `.env`:
   ```
   HUBSPOT_CLIENT_ID=your-client-id
   HUBSPOT_CLIENT_SECRET=your-client-secret
   ```

#### 4. Microsoft Dynamics 365

**Features**:

- Lead and Contact management
- Opportunity tracking
- Business process flows
- Power Automate integration

**Setup**:

1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add redirect URI: `https://yourdomain.com/api/v1/crm-integration/oauth/callback/dynamics`
4. Add API permissions: `Dynamics CRM → user_impersonation`
5. Add to `.env`:
   ```
   DYNAMICS_CLIENT_ID=your-application-id
   DYNAMICS_CLIENT_SECRET=your-client-secret
   DYNAMICS_RESOURCE=https://yourorg.crm.dynamics.com
   ```

### Integration Workflow

```
┌─────────┐      ┌──────────┐      ┌─────────┐      ┌─────────┐
│  User   │─────>│ Frontend │─────>│ Backend │─────>│   CRM   │
└─────────┘      └──────────┘      └─────────┘      └─────────┘
     │                 │                 │                 │
     │   1. Click      │                 │                 │
     │   "Connect"     │                 │                 │
     │─────────────────>                 │                 │
     │                 │  2. Init OAuth  │                 │
     │                 │─────────────────>                 │
     │                 │                 │  3. Redirect    │
     │                 │                 │─────────────────>
     │                 │                 │                 │
     │                 │                 │  4. Auth Code   │
     │                 │                 │<─────────────────
     │                 │  5. Exchange    │                 │
     │                 │<─────────────────                 │
     │                 │                 │  6. Get Token   │
     │                 │                 │─────────────────>
     │  7. Success     │                 │                 │
     │<─────────────────                 │                 │
```

### API Endpoints

#### Get Configured Providers

```http
GET /api/v1/crm-integration/providers
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "zoho",
      "name": "Zoho",
      "configured": true
    },
    {
      "id": "salesforce",
      "name": "Salesforce",
      "configured": true
    }
  ]
}
```

#### Initialize OAuth Flow

```http
POST /api/v1/crm-integration/oauth/init
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "zoho"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.zoho.com/oauth/v2/auth?...",
    "state": "random-state-token",
    "provider": "zoho"
  }
}
```

#### Get Integration Status

```http
GET /api/v1/crm-integration
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "provider": "zoho",
    "status": "active",
    "accountInfo": {
      "accountName": "John Doe",
      "accountEmail": "john@example.com"
    },
    "tokens": {
      "hasAccessToken": true,
      "hasRefreshToken": true,
      "tokenExpiry": "2024-12-31T23:59:59Z"
    }
  }
}
```

#### Sync Leads to CRM

```http
POST /api/v1/crm-integration/sync-leads
Authorization: Bearer <token>
Content-Type: application/json

{
  "leadIds": ["lead1", "lead2", "lead3"]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "successful": [
      {
        "leadId": "lead1",
        "crmId": "crm-id-1",
        "provider": "zoho"
      }
    ],
    "failed": [],
    "total": 3
  }
}
```

---

## Phase Two: Make.com Automation

### Available Templates

#### 1. Sync New Leads to CRM

- **Trigger**: Lead created
- **Action**: Send lead data to CRM via webhook
- **Use Case**: Real-time CRM synchronization

#### 2. Enrich Lead Data

- **Trigger**: Lead created
- **Action**: Enrich with company data from Clearbit/Hunter
- **Use Case**: Automatic data enrichment

#### 3. Real-time Lead Notifications

- **Trigger**: High-value lead created
- **Action**: Send notification to Slack/Teams/Email
- **Use Case**: Instant sales team alerts

#### 4. Auto-qualify Leads (BANT)

- **Trigger**: Form submitted
- **Action**: Analyze and score lead
- **Use Case**: Automatic lead qualification

#### 5. Smart Lead Distribution

- **Trigger**: Lead created
- **Action**: Route to sales rep based on territory
- **Use Case**: Fair lead distribution

#### 6. Weekly Lead Report

- **Trigger**: Scheduled (weekly)
- **Action**: Generate and send report
- **Use Case**: Performance tracking

### Automation Workflow

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│   Lead   │─────>│  Trigger │─────>│ Make.com │─────>│  Action  │
│  Event   │      │  System  │      │ Scenario │      │ (CRM/etc)│
└──────────┘      └──────────┘      └──────────┘      └──────────┘
```

### Setup Make.com Automation

1. **Activate Template** (Frontend):

   ```typescript
   // User clicks "Activate" on a template
   POST /api/v1/automation
   {
     "templateId": "lead-to-crm"
   }
   ```

2. **Get Webhook URL** (Backend Response):

   ```json
   {
     "automation": { ... },
     "webhookUrl": "https://yourdomain.com/api/v1/webhook/automation/abc123",
     "webhookSecret": "secret-token-xyz",
     "setupInstructions": {
       "step1": "Create a new scenario in Make.com",
       "step2": "Add a webhook trigger and use this URL: ...",
       "step3": "Add the webhook secret as a header: X-Webhook-Secret: ...",
       "step4": "Configure your desired actions (send to CRM, Slack, etc.)",
       "step5": "Activate the automation in your dashboard"
     }
   }
   ```

3. **Configure Make.com**:
   - Go to [Make.com](https://www.make.com/)
   - Create new scenario
   - Add "Webhooks > Custom webhook" module
   - Paste the webhook URL
   - Add your actions (Zoho, Slack, Google Sheets, etc.)
   - Activate the scenario

4. **Activate in System**:
   ```http
   POST /api/v1/automation/{automationId}/activate
   ```

### API Endpoints

#### Get Templates

```http
GET /api/v1/automation/templates
Authorization: Bearer <token>
```

#### Create Automation

```http
POST /api/v1/automation
Authorization: Bearer <token>
Content-Type: application/json

{
  "templateId": "lead-to-crm",
  "name": "Custom Automation Name",
  "makeScenarioId": "optional-scenario-id"
}
```

#### Get Automations

```http
GET /api/v1/automation
Authorization: Bearer <token>
```

#### Activate Automation

```http
POST /api/v1/automation/{automationId}/activate
Authorization: Bearer <token>
```

#### Get Usage Statistics

```http
GET /api/v1/automation/stats
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": {
    "total": 5,
    "active": 3,
    "inactive": 2,
    "totalExecutions": 1250,
    "successfulExecutions": 1200,
    "failedExecutions": 50,
    "successRate": "96.00"
  }
}
```

---

## Frontend Usage

### Integration Page

Navigate to `/super-user/integrations` to access the integration dashboard.

**CRM Tab**:

- View available CRM providers
- Connect/disconnect integrations
- Test connections
- View connection status

**Automation Tab**:

- Browse automation templates
- Activate templates
- Configure automations
- View active automations

### Settings Page Integration

Add integration button to settings page:

```tsx
// In settings/page.tsx
<Link href="/super-user/integrations">
  <button className="...">Manage Integrations</button>
</Link>
```

---

## Security Considerations

### Token Storage

- Access tokens and refresh tokens are stored in MongoDB
- Sensitive data should be encrypted at rest (implement encryption middleware)
- Consider using AWS Secrets Manager or Azure Key Vault for production

### Webhook Security

- All webhooks use HMAC-SHA256 signatures
- Signatures are verified before processing
- Rate limiting applied to prevent abuse

### OAuth2 Security

- State parameter prevents CSRF attacks
- PKCE can be added for additional security
- Tokens automatically refreshed before expiry

---

## Monitoring & Usage Tracking

### Usage Events

All integration activities are logged in the `UsageEvent` collection:

```javascript
{
  companyId: ObjectId,
  eventType: "crm_sync" | "make_workflow_executed" | ...,
  category: "crm" | "automation" | ...,
  status: "success" | "failed",
  metadata: {
    duration: 1250,
    requestData: {...},
    responseData: {...}
  },
  metrics: {
    apiCallsUsed: 1,
    recordsProcessed: 10
  }
}
```

### Analytics Dashboard

View usage analytics:

```http
GET /api/v1/automation/usage/summary?startDate=2024-01-01&endDate=2024-12-31
```

---

## Troubleshooting

### Common Issues

#### 1. OAuth Callback Failed

**Problem**: Redirect URL mismatch  
**Solution**: Ensure redirect URI in CRM matches exactly with backend URL

#### 2. Token Expired

**Problem**: Access token expired  
**Solution**: Tokens are automatically refreshed. Check refresh token validity.

#### 3. Webhook Not Triggering

**Problem**: Make.com scenario not receiving data  
**Solution**:

- Verify webhook URL is correct
- Check webhook secret matches
- Ensure automation status is "active"
- Test with curl:
  ```bash
  curl -X POST https://yourdomain.com/api/v1/webhook/automation/abc123 \
    -H "X-Webhook-Secret: your-secret" \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}'
  ```

#### 4. CRM Sync Failed

**Problem**: Leads not syncing to CRM  
**Solution**:

- Check CRM integration status
- Verify field mappings
- Review error logs: `GET /api/v1/crm-integration/error-logs`
- Test connection: `POST /api/v1/crm-integration/test-connection`

---

## Next Steps

1. **Configure Environment Variables**: Add CRM credentials to `.env`
2. **Test OAuth Flow**: Connect a CRM provider
3. **Set Up Make.com**: Create your first automation scenario
4. **Monitor Usage**: Check analytics dashboard regularly
5. **Optimize**: Adjust field mappings and automation conditions

---

## Support

For additional help:

- Check error logs in the database
- Review usage events for failed operations
- Contact support with automation ID and timestamp

---

**Last Updated**: October 2025  
**Version**: 1.0.0
