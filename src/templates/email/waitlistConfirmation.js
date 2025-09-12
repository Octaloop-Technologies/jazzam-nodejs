import { emailStyles } from "./styles.js";

// ================================================
// Generate professional HTML template for user confirmation email
// ================================================

export function generateWaitlistConfirmationTemplate(userName, utils) {
  const displayName = utils.escapeHtml(userName);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to our Waitlist</title>
      <style>
        ${emailStyles}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🚀</div>
          <h1>Welcome to our Waitlist!</h1>
          <p class="subtitle">You're one step closer to amazing features</p>
        </div>
        
        <div class="content">
          <div class="greeting">
            <h2>Hello ${displayName}! 👋</h2>
            <p>Thank you for joining our waitlist. We're thrilled to have you as part of our early community!</p>
          </div>
          
          <div class="alert alert-success">
            <strong>✅ You're all set!</strong><br>
            Your spot on our waitlist has been confirmed. You'll be among the first to know when we launch!
          </div>
          
          <div class="info-card">
            <h3>🎯 What's Next?</h3>
            <div class="timeline">
              <div class="timeline-item">
                <div class="timeline-marker">📧</div>
                <div class="timeline-content">
                  <strong>Regular Updates</strong><br>
                  We'll keep you informed about our development progress
                </div>
              </div>
              <div class="timeline-item">
                <div class="timeline-marker">🎁</div>
                <div class="timeline-content">
                  <strong>Early Access</strong><br>
                  Be the first to experience our platform when it's ready
                </div>
              </div>
              <div class="timeline-item">
                <div class="timeline-marker">💎</div>
                <div class="timeline-content">
                  <strong>Exclusive Benefits</strong><br>
                  Special launch offers and premium features
                </div>
              </div>
            </div>
          </div>
          
          <div class="action-section">
            <h3>🤝 Stay Connected</h3>
            <p>While you wait, feel free to reach out to us with any questions or feedback. We value your input!</p>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Lead Management Team</strong></p>
          <p>Building the future of lead management, one feature at a time.</p>
          <p class="disclaimer">You can reply to this email if you have any questions.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
