import { emailStyles } from "./styles.js";

// ================================================
// Generate professional HTML template for waitlist notification email
// Sent to admin when a new user joins the waitlist
// ================================================

export function generateWaitlistNotificationTemplate(
  userEmail,
  additionalData = {},
  utils
) {
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "full",
    timeStyle: "long",
  });

  // Sanitize and prepare user data
  const sanitizedData = utils.sanitizeUserData(additionalData);
  const userDataRows = utils.buildUserDataRows(sanitizedData);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Waitlist Signup</title>
      <style>
        ${emailStyles}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🎯</div>
          <h1>New Waitlist Signup!</h1>
          <p class="subtitle">Your lead management system has a new prospect</p>
        </div>
        
        <div class="content">
          <div class="alert alert-success">
            <strong>✅ New Lead Alert</strong><br>
            Someone has joined your waitlist and is ready to be contacted.
          </div>
          
          <div class="info-card">
            <h3>Contact Information</h3>
            <div class="data-row primary">
              <span class="label">📧 Email:</span> 
              <span class="value email">${utils.escapeHtml(userEmail)}</span>
            </div>
            <div class="data-row">
              <span class="label">🕒 Signup Time:</span> 
              <span class="value">${timestamp}</span>
            </div>
            ${userDataRows}
          </div>
          
          <div class="action-section">
            <h3>📋 Next Steps</h3>
            <ul class="action-list">
              <li>Respond within 24 hours for optimal conversion</li>
              <li>Personalize your outreach based on the provided information</li>
              <li>Document this lead in your CRM system</li>
              <li>Schedule a follow-up if needed</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Lead Management System</strong></p>
          <p>Automated notification • ${timestamp}</p>
          <p class="disclaimer">This email was automatically generated. Do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
