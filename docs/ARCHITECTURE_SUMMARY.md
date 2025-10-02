# 🚀 Multi-Platform Lead Generation SAAS Backend

A comprehensive backend system for companies to generate leads from multiple social media platforms through automated scraping and form-based data collection.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Platform Support](#platform-support)
- [Authentication Methods](#authentication-methods)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Installation & Setup](#installation--setup)
- [Usage Examples](#usage-examples)
- [Deployment](#deployment)
- [Contributing](#contributing)

## 🎯 Overview

This backend system transforms a user-based LinkedIn scraping application into a **Company-based SAAS Lead Generation Platform**. Companies can register, create platform-specific forms, and automatically generate leads from social media profiles through intelligent scraping.

### Key Capabilities

- **Multi-Platform Support**: LinkedIn, Meta/Facebook, Twitter, Instagram
- **Multiple Authentication Methods**: Email/Password, Google OAuth, Zoho OAuth
- **Automated Scraping**: Uses Apify actors for profile data extraction
- **Form-Based Collection**: Pre-built templates for each platform
- **Email Automation**: Welcome emails and follow-up sequences
- **CRM Integration**: Ready for Zoho, HubSpot, Salesforce integration
- **Analytics Dashboard**: Platform-specific lead statistics
- **Multi-Tenant Architecture**: Each company sees only their data

## 🏗️ Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API    │    │   External      │
│   (Next.js)     │◄──►│   (Express.js)   │◄──►│   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Database      │
                       │   (MongoDB)     │
                       └─────────────────┘
```

### Core Models

- **Company**: Multi-tenant company management with OAuth support
- **Form**: Platform-specific form templates
- **Lead**: Scraped and processed lead data
- **CRM Integration**: External CRM connections

## ✨ Features

### 🏢 Company Management

- Company registration and authentication
- **Multiple Login Methods**: Email/Password, Google OAuth, Zoho OAuth
- Subscription management (trial, active, expired)
- Usage tracking and analytics
- Logo and branding management

### 🔐 Authentication Methods

#### 1. **Email/Password Authentication**

- Traditional email and password registration
- Password hashing with bcrypt
- Email verification support

#### 2. **Google OAuth Integration**

- One-click Google sign-in
- Automatic account creation/linking
- Profile picture import

#### 3. **Zoho OAuth Integration** ⭐ **NEW**

- Direct Zoho CRM integration
- Automatic company creation from Zoho account
- Seamless CRM connectivity
- Access to Zoho CRM user data

### 📝 Form Management

- **LinkedIn Form**: Collect LinkedIn profile URLs
- **Meta Form**: Collect Facebook usernames
- **Twitter Form**: Collect Twitter usernames
- **Instagram Form**: Collect Instagram usernames
- Custom form builder for additional fields

### 🔍 Lead Generation

- Automatic profile scraping using Apify actors
- Data extraction and normalization
- Lead scoring and qualification (BANT)
- Contact history tracking
- Email communication management

### 📧 Email Automation

- Welcome emails for new leads
- Follow-up emails (configurable delay)
- Lead notification emails to companies
- Customizable email templates

### 🔗 CRM Integration

- Support for multiple CRM providers
- OAuth-based authentication
- Field mapping configuration
- Automatic lead synchronization
- Error logging and monitoring

## 🌐 Platform Support

| Platform          | Input Type  | Scraping Service        | Data Extracted                                                   |
| ----------------- | ----------- | ----------------------- | ---------------------------------------------------------------- |
| **LinkedIn**      | Profile URL | Apify LinkedIn Scraper  | Name, Email, Company, Job Title, Location, Experience, Education |
| **Meta/Facebook** | Username    | Apify Facebook Scraper  | Name, Email, Company, Location, Bio, Followers                   |
| **Twitter**       | Username    | Apify Twitter Scraper   | Name, Email, Company, Location, Bio, Followers, Tweets           |
| **Instagram**     | Username    | Apify Instagram Scraper | Name, Email, Company, Location, Bio, Followers, Posts            |

## 🔐 Authentication Methods

### Email/Password Authentication

```http
POST /api/v1/companies/auth/register
Content-Type: application/json
{
  "companyName": "Acme Corp",
  "email": "contact@acme.com",
  "password": "securepassword123",
  "website": "https://acme.com",
  "industry": "Technology"
}

POST /api/v1/companies/auth/login
Content-Type: application/json
{
  "email": "contact@acme.com",
  "password": "securepassword123"
}
```

### Google OAuth Authentication

```http
# Initiate Google OAuth
GET /api/v1/companies/auth/google

# Google OAuth callback (handled automatically)
GET /api/v1/companies/auth/google/callback
```

### Zoho OAuth Authentication ⭐ **NEW**

```http
# Initiate Zoho OAuth
GET /api/v1/companies/auth/zoho

# Zoho OAuth callback (handled automatically)
GET /api/v1/companies/auth/zoho/callback
```

**Zoho OAuth Flow:**

1. Company clicks "Login with Zoho"
2. Redirected to Zoho OAuth consent screen
3. Company authorizes the application
4. Zoho redirects back with authorization code
5. System exchanges code for access token
6. System fetches company data from Zoho CRM
7. Company account is created/linked automatically
8. Company is logged in and redirected to dashboard

## 📚 API Documentation

### Authentication Endpoints

```http
# Email/Password Authentication
POST /api/v1/companies/auth/register
POST /api/v1/companies/auth/login
POST /api/v1/companies/auth/logout
GET  /api/v1/companies/auth/current-company
POST /api/v1/companies/auth/refresh-token

# OAuth Authentication
GET  /api/v1/companies/auth/google
GET  /api/v1/companies/auth/google/callback
GET  /api/v1/companies/auth/zoho          # NEW
GET  /api/v1/companies/auth/zoho/callback  # NEW
```

### Platform Form Endpoints

```http
# Create platform-specific form
POST /api/v1/forms/platform/create
Content-Type: application/json
{
  "formType": "linkedin" | "meta" | "twitter" | "instagram"
}

# Get available platforms
GET /api/v1/forms/platform/available

# Get platform forms
GET /api/v1/forms/platform

# Get specific form (public)
GET /api/v1/forms/:accessToken

# Submit form data (public)
POST /api/v1/forms/:accessToken/submit
Content-Type: application/json
{
  "linkedinUrl": "https://www.linkedin.com/in/username"
}
```

### Lead Management Endpoints

```http
# Create lead (from form submission)
POST /api/v1/leads/create
Content-Type: application/json
{
  "formId": "form_id",
  "formData": {
    "linkedinUrl": "https://www.linkedin.com/in/username"
  }
}

# Get company leads
GET /api/v1/leads/all?platform=linkedin&status=new

# Get lead statistics
GET /api/v1/leads/stats

# Update lead
PATCH /api/v1/leads/:id
Content-Type: application/json
{
  "status": "qualified",
  "notes": "Interested in our services"
}

# Search leads
GET /api/v1/leads/search?query=john&platform=linkedin
```

### CRM Integration Endpoints

```http
# Setup CRM integration
POST /api/v1/crm-integration
Content-Type: application/json
{
  "provider": "zoho" | "hubspot" | "salesforce",
  "credentials": { ... },
  "tokens": { ... }
}

# Sync leads to CRM
POST /api/v1/crm-integration/sync-leads
Content-Type: application/json
{
  "leadIds": ["lead_id_1", "lead_id_2"]
}

# Get sync status
GET /api/v1/crm-integration/sync-status
```

## 🗄️ Database Schema

### Company Model

```javascript
{
  companyName: String,
  email: String,
  password: String,
  website: String,
  industry: String,

  // OAuth Integration
  googleId: String,        // Google OAuth ID
  zohoId: String,          // Zoho OAuth ID ⭐ NEW
  provider: "local" | "google" | "zoho",  // ⭐ UPDATED

  subscriptionStatus: "trial" | "active" | "expired",
  subscriptionPlan: "free" | "basic" | "premium",
  trialEndDate: Date,

  usageStats: {
    totalLeads: Number,
    leadsThisMonth: Number,
    formsCreated: Number,
    emailsSent: Number
  },

  settings: {
    timezone: String,
    currency: String,
    emailNotifications: Boolean
  }
}
```

### Form Model

```javascript
{
  name: String,
  description: String,
  companyId: ObjectId,
  formType: "linkedin" | "meta" | "twitter" | "instagram" | "custom",
  platformConfig: {
    scrapingEnabled: Boolean,
    scrapingService: "apify" | "custom",
    scrapingConfig: Object
  },
  config: {
    fields: [{
      id: String,
      name: String,
      type: String,
      label: String,
      required: Boolean,
      validation: Object
    }],
    settings: {
      theme: String,
      submitButtonText: String,
      successMessage: String
    }
  },
  settings: {
    emailNotifications: Object,
    autoResponse: Object,
    followUp: Object
  },
  accessToken: String,
  embedCode: String
}
```

### Lead Model

```javascript
{
  companyId: ObjectId,
  formId: ObjectId,
  platform: "linkedin" | "meta" | "twitter" | "instagram" | "other",
  platformUrl: String,
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  company: String,
  jobTitle: String,
  location: String,
  platformData: Object, // Raw scraped data
  status: "new" | "contacted" | "qualified" | "converted" | "lost",
  bant: {
    budget: { value: String, score: Number },
    authority: { value: String, score: Number, isDecisionMaker: Boolean },
    need: { value: String, score: Number, urgency: String },
    timeline: { value: String, score: Number, timeframe: String }
  },
  emailStatus: {
    welcomeSent: Boolean,
    followUpSent: Boolean,
    followUpScheduledAt: Date
  },
  contactHistory: [{
    type: "email" | "phone" | "meeting" | "note",
    subject: String,
    content: String,
    timestamp: Date,
    outcome: "positive" | "negative" | "neutral" | "no_response"
  }],
  leadScore: Number,
  crmId: String,
  crmSyncStatus: "pending" | "synced" | "failed"
}
```

## 🚀 Installation & Setup

### Prerequisites

- Node.js 18+
- MongoDB 6+
- Apify account with API key
- Google OAuth credentials
- **Zoho OAuth credentials** ⭐ **NEW**

### Environment Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/lead-generation

# JWT Secrets
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret

# External Services
APIFY_KEY=your_apify_api_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:8000/api/v1/users/auth/google/callback
GOOGLE_COMPANY_CALLBACK_URL=http://localhost:8000/api/v1/companies/auth/google/callback

# Zoho OAuth ⭐ NEW
ZOHO_CLIENT_ID=your_zoho_client_id
ZOHO_CLIENT_SECRET=your_zoho_client_secret
ZOHO_REDIRECT_URI=http://localhost:8000/api/v1/companies/auth/zoho/callback

# Email Service
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# File Upload (Alibaba Cloud OSS)
OSS_REGION=your_oss_region
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET_NAME=your_bucket_name

# Client URL
CLIENT_URL=http://localhost:3000
```

### Zoho OAuth Setup ⭐ **NEW**

1. **Create Zoho Developer Account**
   - Go to [Zoho Developer Console](https://api-console.zoho.com/)
   - Create a new application

2. **Configure OAuth Settings**
   - Set redirect URI: `http://localhost:8000/api/v1/companies/auth/zoho/callback`
   - Select scopes: `ZohoCRM.users.ALL`
   - Copy Client ID and Client Secret

3. **Environment Configuration**
   ```bash
   ZOHO_CLIENT_ID=your_zoho_client_id
   ZOHO_CLIENT_SECRET=your_zoho_client_secret
   ZOHO_REDIRECT_URI=http://localhost:8000/api/v1/companies/auth/zoho/callback
   ```

### Installation Steps

1. **Clone the repository**

```bash
git clone <repository-url>
cd lead-generation-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the development server**

```bash
npm run dev
```

5. **Verify installation**

```bash
curl http://localhost:8000/api/v1/health
```

## 💡 Usage Examples

### 1. Company Registration (Email/Password)

```javascript
// Register a new company
const response = await fetch("/api/v1/companies/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    companyName: "Acme Corp",
    email: "contact@acme.com",
    password: "securepassword123",
    website: "https://acme.com",
    industry: "Technology",
  }),
});
```

### 2. Google OAuth Login

```javascript
// Redirect to Google OAuth
window.location.href = "/api/v1/companies/auth/google";
```

### 3. Zoho OAuth Login ⭐ **NEW**

```javascript
// Redirect to Zoho OAuth
window.location.href = "/api/v1/companies/auth/zoho";
```

### 4. Create LinkedIn Form

```javascript
// Create a LinkedIn lead generation form
const response = await fetch("/api/v1/forms/platform/create", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer " + accessToken,
  },
  body: JSON.stringify({
    formType: "linkedin",
  }),
});
```

### 5. Form Submission (Public)

```javascript
// Submit LinkedIn profile URL
const response = await fetch("/api/v1/forms/abc123/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    linkedinUrl: "https://www.linkedin.com/in/johndoe",
  }),
});
```

### 6. Get Lead Statistics

```javascript
// Get company lead statistics
const response = await fetch("/api/v1/leads/stats", {
  headers: { Authorization: "Bearer " + accessToken },
});

const stats = await response.json();
console.log(stats.data.overview);
// {
//   totalLeads: 150,
//   newLeads: 45,
//   qualifiedLeads: 30,
//   convertedLeads: 15,
//   platformBreakdown: [...]
// }
```

### 7. CRM Integration Setup

```javascript
// Setup Zoho CRM integration
const response = await fetch("/api/v1/crm-integration", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer " + accessToken,
  },
  body: JSON.stringify({
    provider: "zoho",
    credentials: {
      clientId: "your_client_id",
      clientSecret: "your_client_secret",
    },
    tokens: {
      accessToken: "oauth_access_token",
      refreshToken: "oauth_refresh_token",
    },
  }),
});
```

## 🔄 Lead Generation Flow

```mermaid
graph TD
    A[Company Creates Form] --> B[Form Published]
    B --> C[User Submits Profile URL]
    C --> D[Validate Input]
    D --> E[Start Apify Scraping]
    E --> F[Extract Profile Data]
    F --> G[Create Lead Record]
    G --> H[Send Welcome Email]
    H --> I[Schedule Follow-up]
    I --> J[Sync to CRM]
    J --> K[Update Analytics]
```

## 🔐 Authentication Flow

```mermaid
graph TD
    A[Company Login Page] --> B{Choose Login Method}
    B -->|Email/Password| C[Traditional Login]
    B -->|Google OAuth| D[Google OAuth Flow]
    B -->|Zoho OAuth| E[Zoho OAuth Flow]

    C --> F[Validate Credentials]
    F --> G[Generate JWT Tokens]

    D --> H[Google Consent Screen]
    H --> I[Google Callback]
    I --> J[Create/Link Company]
    J --> G

    E --> K[Zoho Consent Screen]
    K --> L[Zoho Callback]
    L --> M[Fetch Zoho CRM Data]
    M --> N[Create/Link Company]
    N --> G

    G --> O[Dashboard Access]
```

## 📊 Analytics & Reporting

### Lead Statistics

- **Total Leads**: Overall lead count
- **Platform Breakdown**: Leads by source platform
- **Status Distribution**: New, contacted, qualified, converted
- **Industry Analysis**: Leads by company industry
- **Geographic Distribution**: Leads by location
- **Conversion Rates**: Platform-specific conversion metrics

### Authentication Analytics

- **Login Method Distribution**: Email/Password vs OAuth
- **OAuth Provider Usage**: Google vs Zoho
- **User Engagement**: Login frequency and session duration
- **Account Linking**: OAuth account linking success rates

### Form Performance

- **Submission Rates**: Forms with highest conversion
- **Platform Popularity**: Most used platforms
- **Response Times**: Average scraping completion time
- **Error Rates**: Failed scraping attempts

## 🚀 Deployment

### Production Environment

1. **Set up production database**

```bash
# MongoDB Atlas or self-hosted MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/lead-generation
```

2. **Configure production environment**

```bash
NODE_ENV=production
PORT=8000
```

3. **Update OAuth redirect URIs**

```bash
# Update these for production
GOOGLE_COMPANY_CALLBACK_URL=https://yourdomain.com/api/v1/companies/auth/google/callback
ZOHO_REDIRECT_URI=https://yourdomain.com/api/v1/companies/auth/zoho/callback
```

4. **Deploy to cloud platform**

```bash
# Using PM2 for process management
npm install -g pm2
pm2 start ecosystem.config.js
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8000
CMD ["npm", "start"]
```

## 🔧 Configuration

### Scraping Service Configuration

The system uses Apify actors for scraping. Configure in `scraping.service.js`:

```javascript
const ACTOR_CONFIGS = {
  linkedin: {
    actorId: "dev_fusion~linkedin-profile-scraper",
    timeout: 300000, // 5 minutes
    retries: 3,
  },
  meta: {
    actorId: "dev_fusion~facebook-profile-scraper",
    timeout: 300000,
    retries: 3,
  },
  // ... other platforms
};
```

### OAuth Configuration

Configure OAuth providers in `passport.js`:

```javascript
// Google OAuth for Companies
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_COMPANY_CALLBACK_URL,
    },
    googleCompanyStrategy
  )
);

// Zoho OAuth for Companies ⭐ NEW
// Handled in company.controller.js with direct API calls
```

### Email Templates

Customize email templates in `email.service.js`:

```javascript
const EMAIL_TEMPLATES = {
  welcome: {
    subject: "Welcome to {{companyName}}!",
    template: "welcome-email.html",
  },
  followUp: {
    subject: "Following up on your inquiry",
    template: "followup-email.html",
  },
};
```

## 🛡️ Security

### Authentication & Authorization

- JWT-based authentication with access/refresh tokens
- Company-scoped data access
- Rate limiting on authentication endpoints
- Password hashing with bcrypt
- **OAuth token validation** ⭐ **NEW**

### Data Protection

- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CORS configuration
- Environment variable security
- **OAuth state parameter validation** ⭐ **NEW**

## 🧪 Testing

### Running Tests

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# OAuth flow tests ⭐ NEW
npm run test:oauth

# E2E tests
npm run test:e2e
```

### Test Coverage

```bash
npm run test:coverage
```

## 📈 Performance Optimization

### Database Optimization

- Compound indexes for common queries
- Aggregation pipelines for statistics
- Pagination for large datasets
- Connection pooling

### Caching Strategy

- Redis for session storage
- In-memory caching for form templates
- CDN for static assets
- **OAuth token caching** ⭐ **NEW**

## 🔍 Monitoring & Logging

### Application Monitoring

- Error tracking with detailed logs
- Performance metrics
- API response times
- Database query performance
- **OAuth flow monitoring** ⭐ **NEW**

### Health Checks

```bash
GET /api/v1/health
GET /api/v1/health/database
GET /api/v1/health/external-services
GET /api/v1/health/oauth-providers  # NEW
```

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Standards

- ESLint configuration
- Prettier formatting
- Conventional commits
- Comprehensive documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation

- [API Reference](docs/api-reference.md)
- [Deployment Guide](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)
- [OAuth Setup Guide](docs/oauth-setup.md) ⭐ **NEW**

### Contact

- Email: support@leadgeneration.com
- Documentation: [docs.leadgeneration.com](https://docs.leadgeneration.com)
- Issues: [GitHub Issues](https://github.com/your-repo/issues)

---

**Built with ❤️ for modern lead generation**

## 🆕 What's New

### Zoho OAuth Integration ⭐

- **Direct Zoho CRM Login**: Companies can now login using their Zoho CRM credentials
- **Automatic Account Creation**: New companies are created automatically from Zoho data
- **Seamless CRM Integration**: Direct connection to Zoho CRM for lead synchronization
- **Enhanced Security**: OAuth-based authentication with secure token handling

### Key Benefits

1. **Simplified Onboarding**: Companies can register instantly with their existing Zoho account
2. **Reduced Friction**: No need to create separate accounts for lead generation
3. **Better Integration**: Direct access to Zoho CRM data and functionality
4. **Enhanced Security**: OAuth tokens provide secure, revocable access

### Implementation Details

- **OAuth 2.0 Flow**: Standard authorization code flow with PKCE
- **Token Management**: Automatic token refresh and secure storage
- **Error Handling**: Comprehensive error handling for OAuth failures
- **Account Linking**: Automatic linking of existing accounts with same email
