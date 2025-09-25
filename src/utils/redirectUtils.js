/**
 * OAuth Redirect Utilities
 *
 * Provides reusable functions for handling OAuth authentication redirects
 * with proper cookie management and user-friendly HTML pages.
 *
 * @author Lead Management System
 * @version 1.0.0
 */

/**
 * Default configuration for redirect pages
 */
const DEFAULT_CONFIG = {
  title: "Authentication Successful",
  message: "Please wait while we redirect you to your dashboard.",
  fallbackDelay: 100, // milliseconds
};

/**
 * HTML template for redirect pages
 */
const REDIRECT_TEMPLATE = (title, message, redirectUrl, fallbackDelay) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta http-equiv="refresh" content="0;url=${redirectUrl}">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
        background: #f8fafc;
        color: #334155;
        line-height: 1.6;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 20px;
      }
      
      .redirect-container {
        text-align: center;
        max-width: 400px;
        width: 100%;
      }
      
      .logo {
        width: 48px;
        height: 48px;
        margin: 0 auto 24px;
        background: #3b82f6;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 20px;
      }
      
      .title {
        font-size: 24px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 8px;
      }
      
      .message {
        font-size: 16px;
        color: #64748b;
        margin-bottom: 32px;
      }
      
      .loading-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: 24px;
      }
      
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #e2e8f0;
        border-top: 2px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      .loading-text {
        font-size: 14px;
        color: #64748b;
        font-weight: 500;
      }
      
      .redirect-info {
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
        font-size: 14px;
        color: #64748b;
      }
      
      .redirect-url {
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
        background: #e2e8f0;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        margin-top: 8px;
        word-break: break-all;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @media (max-width: 480px) {
        .title {
          font-size: 20px;
        }
        
        .message {
          font-size: 14px;
        }
        
        .redirect-container {
          max-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="redirect-container">
      <div class="logo">L</div>
      <h1 class="title">${title}</h1>
      <p class="message">${message}</p>
      
      <div class="loading-indicator">
        <div class="spinner"></div>
        <span class="loading-text">Redirecting...</span>
      </div>
      
      <div class="redirect-info">
        <div>You will be automatically redirected to:</div>
        <div class="redirect-url">${redirectUrl}</div>
      </div>
    </div>
    
    <script>
      // Fallback redirect with error handling
      setTimeout(() => {
        try {
          window.location.href = "${redirectUrl}";
        } catch (error) {
          console.error('Redirect failed:', error);
          // Last resort: reload the page
          window.location.reload();
        }
      }, ${fallbackDelay});
    </script>
  </body>
</html>`;

/**
 * @typedef {Object} RedirectConfig
 * @property {string} title - Page title
 * @property {string} message - Display message
 * @property {number} fallbackDelay - Delay for fallback redirect in milliseconds
 */

/**
 * @typedef {Object} CookieData
 * @property {string} [accessToken] - Access token value
 * @property {string} [refreshToken] - Refresh token value
 * @property {string} [anyOtherCookie] - Any other cookie name-value pairs
 */

/**
 * @typedef {Object} CookieOptions
 * @property {Object} [accessToken] - Options for access token cookie
 * @property {Object} [refreshToken] - Options for refresh token cookie
 * @property {Object} [anyOtherCookie] - Options for any other cookie
 */

/**
 * Generates a beautiful HTML redirect page with proper cookie management
 *
 * @param {import('express').Response} res - Express response object
 * @param {string} redirectUrl - URL to redirect to
 * @param {CookieData} cookies - Object containing cookie name-value pairs
 * @param {CookieOptions} cookieOptions - Object containing cookie options for each cookie
 * @param {RedirectConfig|string} config - Configuration object or custom title string
 * @param {string} [message] - Custom message (only used if config is a string)
 * @returns {void}
 *
 * @example
 * // Basic usage with professional styling
 * sendHtmlRedirect(res, '/dashboard', { accessToken, refreshToken }, cookieOptions);
 *
 * @example
 * // Custom title and message
 * sendHtmlRedirect(res, '/dashboard', { accessToken }, cookieOptions, 'Welcome!', 'Setting up your account...');
 *
 * @example
 * // Advanced configuration
 * sendHtmlRedirect(res, '/dashboard', { accessToken }, cookieOptions, {
 *   title: 'Welcome Back!',
 *   message: 'Setting up your personalized dashboard...',
 *   fallbackDelay: 200
 * });
 */
const sendHtmlRedirect = (
  res,
  redirectUrl,
  cookies = {},
  cookieOptions = {},
  config = DEFAULT_CONFIG,
  message = null
) => {
  // Normalize configuration
  const finalConfig =
    typeof config === "string"
      ? {
          ...DEFAULT_CONFIG,
          title: config,
          message: message || DEFAULT_CONFIG.message,
        }
      : { ...DEFAULT_CONFIG, ...config };

  // Validate inputs
  if (!res || !redirectUrl) {
    throw new Error("Response object and redirect URL are required");
  }

  // Set cookies with proper error handling
  let response = res.status(200);

  try {
    Object.entries(cookies).forEach(([cookieName, cookieValue]) => {
      if (cookieValue !== undefined && cookieValue !== null) {
        const options = cookieOptions[cookieName] || {};
        response = response.cookie(cookieName, cookieValue, options);
      }
    });
  } catch (error) {
    console.error("Error setting cookies:", error);
    // Continue with redirect even if cookie setting fails
  }

  // Generate and send HTML redirect page
  const htmlContent = REDIRECT_TEMPLATE(
    finalConfig.title,
    finalConfig.message,
    redirectUrl,
    finalConfig.fallbackDelay
  );

  response.send(htmlContent);
};

/**
 * Generates a properly formatted redirect URL for success cases
 *
 * @param {string} baseUrl - Base client URL
 * @param {SuccessRedirectOptions|string} options - Success options or custom path
 * @param {Object} [params] - Query parameters (only used if options is a string)
 * @returns {string} Formatted redirect URL
 *
 * @example
 * // Simple usage
 * generateSuccessRedirectUrl('https://app.example.com', '/dashboard');
 *
 * @example
 * // With parameters
 * generateSuccessRedirectUrl('https://app.example.com', '/dashboard', { login: 'success', provider: 'google' });
 *
 * @example
 * // Advanced usage
 * generateSuccessRedirectUrl('https://app.example.com', {
 *   path: '/dashboard',
 *   params: { login: 'success', provider: 'zoho' },
 *   addTimestamp: true
 * });
 */
const generateSuccessRedirectUrl = (
  baseUrl,
  options = "/super-user",
  params = {}
) => {
  // Normalize options
  const config =
    typeof options === "string"
      ? { path: options, params: params || {} }
      : { path: "/super-user", params: {}, addTimestamp: false, ...options };

  const url = new URL(config.path, baseUrl);

  // Add parameters
  Object.entries(config.params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  // Add timestamp if requested
  if (config.addTimestamp) {
    url.searchParams.set("t", Date.now().toString());
  }

  return url.toString();
};

export { sendHtmlRedirect, generateSuccessRedirectUrl };
