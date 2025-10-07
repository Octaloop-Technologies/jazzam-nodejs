import crypto from "crypto";
import fetch from "node-fetch";

/**
 * CRM OAuth2 Service
 * Handles OAuth2 authentication flows for multiple CRM providers
 */

// ============================================
// OAuth2 Configuration for each CRM provider
// ============================================

const CRM_CONFIGS = {
  zoho: {
    authUrl: "https://accounts.zoho.com/oauth/v2/auth",
    tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
    revokeUrl: "https://accounts.zoho.com/oauth/v2/token/revoke",
    scope: "ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ",
    responseType: "code",
    accessType: "offline",
  },
  salesforce: {
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    revokeUrl: "https://login.salesforce.com/services/oauth2/revoke",
    scope: "api refresh_token offline_access",
    responseType: "code",
  },
  hubspot: {
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scope:
      "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write",
    responseType: "code",
  },
  dynamics: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "https://dynamics.microsoft.com/.default offline_access",
    responseType: "code",
  },
};

// ============================================
// State Management for OAuth2 flows
// ============================================

// In production, use Redis or a database for state management
const oauthStates = new Map();

/**
 * Generate a secure random state for OAuth2
 */
const generateState = (companyId, provider) => {
  const state = crypto.randomBytes(32).toString("hex");
  const stateData = {
    companyId,
    provider,
    timestamp: Date.now(),
  };

  oauthStates.set(state, stateData);

  // Auto-expire state after 30 minutes
  setTimeout(
    () => {
      oauthStates.delete(state);
    },
    30 * 60 * 1000
  );

  return state;
};

/**
 * Verify and retrieve OAuth2 state
 */
const verifyState = (state) => {
  const stateData = oauthStates.get(state);

  if (!stateData) {
    throw new Error("Invalid or expired OAuth state");
  }

  // Check if state is older than 30 minutes
  if (Date.now() - stateData.timestamp > 30 * 60 * 1000) {
    oauthStates.delete(state);
    throw new Error("OAuth state expired");
  }

  oauthStates.delete(state);
  return stateData;
};

// ============================================
// OAuth2 URL Generation
// ============================================

/**
 * Generate OAuth2 authorization URL
 */
export const generateAuthUrl = (provider, companyId) => {
  const config = CRM_CONFIGS[provider];

  if (!config) {
    throw new Error(`Unsupported CRM provider: ${provider}`);
  }

  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const redirectUri =
    process.env[`${provider.toUpperCase()}_REDIRECT_URI`] ||
    `${process.env.SERVER_URL}/api/v1/crm-integration/oauth/callback/${provider}`;

  if (!clientId) {
    throw new Error(`${provider.toUpperCase()}_CLIENT_ID not configured`);
  }

  const state = generateState(companyId, provider);

  // DEBUG: Log the redirect URI being used
  console.log(`🔍 OAuth Redirect URI for ${provider}:`, redirectUri);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: config.responseType,
    scope: config.scope,
    state,
  });

  // Add provider-specific parameters
  if (provider === "zoho") {
    params.append("access_type", config.accessType);
  }

  return {
    authUrl: `${config.authUrl}?${params.toString()}`,
    state,
  };
};

// ============================================
// Token Exchange
// ============================================

/**
 * Exchange authorization code for access token
 */
export const exchangeCodeForToken = async (provider, code, state) => {
  const config = CRM_CONFIGS[provider];

  if (!config) {
    throw new Error(`Unsupported CRM provider: ${provider}`);
  }

  // Verify state and get state data
  const stateData = verifyState(state);

  if (stateData.provider !== provider) {
    throw new Error("Provider mismatch in OAuth state");
  }

  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  const redirectUri =
    process.env[`${provider.toUpperCase()}_REDIRECT_URI`] ||
    `${process.env.SERVER_URL}/api/v1/crm-integration/oauth/callback/${provider}`;

  if (!clientId || !clientSecret) {
    throw new Error(`${provider.toUpperCase()} credentials not configured`);
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Token exchange failed: ${errorData}`);
    }

    const data = await response.json();

    // Normalize response across providers and include state data
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
      // Include state data so controller can access companyId
      stateData,
      // Provider-specific fields
      ...(provider === "zoho" && {
        apiDomain: data.api_domain,
      }),
      ...(provider === "salesforce" && {
        instanceUrl: data.instance_url,
        id: data.id,
      }),
      ...(provider === "hubspot" && {
        tokenType: data.token_type,
      }),
    };
  } catch (error) {
    console.error(`${provider} token exchange error:`, error);
    throw new Error(`Failed to exchange code for token: ${error.message}`);
  }
};

// ============================================
// Token Refresh
// ============================================

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (provider, refreshToken) => {
  const config = CRM_CONFIGS[provider];

  if (!config) {
    throw new Error(`Unsupported CRM provider: ${provider}`);
  }

  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    throw new Error(`${provider.toUpperCase()} credentials not configured`);
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Token refresh failed: ${errorData}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Some providers don't return new refresh token
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  } catch (error) {
    console.error(`${provider} token refresh error:`, error);
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
};

// ============================================
// Token Revocation
// ============================================

/**
 * Revoke access token
 */
export const revokeToken = async (provider, token) => {
  const config = CRM_CONFIGS[provider];

  if (!config || !config.revokeUrl) {
    throw new Error(`Token revocation not supported for ${provider}`);
  }

  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];

  try {
    const params = new URLSearchParams({
      token,
      ...(provider === "zoho" && {
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const response = await fetch(config.revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.warn(`Token revocation warning: ${errorData}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`${provider} token revocation error:`, error);
    // Don't throw error, just log it
    return { success: false, error: error.message };
  }
};

// ============================================
// Utility Functions
// ============================================

/**
 * Check if provider is configured
 */
export const isProviderConfigured = (provider) => {
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];

  return !!(clientId && clientSecret);
};

/**
 * Get list of configured providers
 */
export const getConfiguredProviders = () => {
  return Object.keys(CRM_CONFIGS).filter((provider) =>
    isProviderConfigured(provider)
  );
};

/**
 * Calculate token expiry date
 */
export const calculateTokenExpiry = (expiresIn) => {
  if (!expiresIn) return null;

  // Subtract 5 minutes as buffer
  const bufferSeconds = 5 * 60;
  const expirySeconds = parseInt(expiresIn) - bufferSeconds;

  return new Date(Date.now() + expirySeconds * 1000);
};
