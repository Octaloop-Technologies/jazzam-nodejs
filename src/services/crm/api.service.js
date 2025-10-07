import fetch from "node-fetch";

/**
 * CRM API Service
 * Handles API calls to various CRM providers
 */

// ============================================
// API Base URLs
// ============================================

const CRM_API_URLS = {
  zoho: {
    base: (apiDomain) => `${apiDomain}/crm/v3`,
    leads: "/Leads",
    contacts: "/Contacts",
    accounts: "/Accounts",
    users: "/users?type=CurrentUser",
  },
  salesforce: {
    base: (instanceUrl) => `${instanceUrl}/services/data/v58.0`,
    leads: "/sobjects/Lead",
    contacts: "/sobjects/Contact",
    accounts: "/sobjects/Account",
    query: "/query",
  },
  hubspot: {
    base: "https://api.hubapi.com",
    contacts: "/crm/v3/objects/contacts",
    companies: "/crm/v3/objects/companies",
    deals: "/crm/v3/objects/deals",
    owners: "/crm/v3/owners",
  },
  dynamics: {
    base: (resource) => `${resource}/api/data/v9.2`,
    leads: "/leads",
    contacts: "/contacts",
    accounts: "/accounts",
  },
};

// ============================================
// Generic API Request Handler
// ============================================

/**
 * Make authenticated API request to CRM
 */
const makeApiRequest = async (url, options = {}, accessToken) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorData}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
};

// ============================================
// Zoho CRM API
// ============================================

export const zohoApi = {
  /**
   * Get current user info
   */
  getCurrentUser: async (accessToken, apiDomain) => {
    const url = `${CRM_API_URLS.zoho.base(apiDomain)}${CRM_API_URLS.zoho.users}`;
    const data = await makeApiRequest(url, {}, accessToken);

    return {
      id: data.users[0]?.id,
      name: data.users[0]?.full_name,
      email: data.users[0]?.email,
    };
  },

  /**
   * Create lead in Zoho CRM
   */
  createLead: async (accessToken, apiDomain, leadData) => {
    const url = `${CRM_API_URLS.zoho.base(apiDomain)}${CRM_API_URLS.zoho.leads}`;

    const zohoLead = {
      data: [
        {
          Last_Name: leadData.name || leadData.lastName || "Unknown",
          First_Name: leadData.firstName || "",
          Email: leadData.email,
          Phone: leadData.phone,
          Company: leadData.company,
          Title: leadData.jobTitle,
          Lead_Source: leadData.source || "Web Form",
          Description: leadData.description || leadData.message,
          ...leadData.customFields,
        },
      ],
    };

    const data = await makeApiRequest(
      url,
      {
        method: "POST",
        body: JSON.stringify(zohoLead),
      },
      accessToken
    );

    return {
      id: data.data[0]?.details?.id,
      status: data.data[0]?.status,
      message: data.data[0]?.message,
    };
  },

  /**
   * Get leads from Zoho CRM
   */
  getLeads: async (accessToken, apiDomain, options = {}) => {
    const params = new URLSearchParams({
      page: options.page || 1,
      per_page: options.perPage || 200,
      sort_by: options.sortBy || "Modified_Time",
      sort_order: options.sortOrder || "desc",
    });

    const url = `${CRM_API_URLS.zoho.base(apiDomain)}${CRM_API_URLS.zoho.leads}?${params}`;
    return await makeApiRequest(url, {}, accessToken);
  },

  /**
   * Update lead in Zoho CRM
   */
  updateLead: async (accessToken, apiDomain, leadId, leadData) => {
    const url = `${CRM_API_URLS.zoho.base(apiDomain)}${CRM_API_URLS.zoho.leads}/${leadId}`;

    const zohoLead = {
      data: [leadData],
    };

    return await makeApiRequest(
      url,
      {
        method: "PUT",
        body: JSON.stringify(zohoLead),
      },
      accessToken
    );
  },
};

// ============================================
// Salesforce CRM API
// ============================================

export const salesforceApi = {
  /**
   * Get current user info
   */
  getCurrentUser: async (accessToken, instanceUrl) => {
    const url = `${instanceUrl}/services/oauth2/userinfo`;
    const data = await makeApiRequest(url, {}, accessToken);

    return {
      id: data.user_id,
      name: data.name,
      email: data.email,
    };
  },

  /**
   * Create lead in Salesforce
   */
  createLead: async (accessToken, instanceUrl, leadData) => {
    const url = `${CRM_API_URLS.salesforce.base(instanceUrl)}${CRM_API_URLS.salesforce.leads}`;

    const sfLead = {
      LastName: leadData.name || leadData.lastName || "Unknown",
      FirstName: leadData.firstName || "",
      Email: leadData.email,
      Phone: leadData.phone,
      Company: leadData.company || "Unknown",
      Title: leadData.jobTitle,
      LeadSource: leadData.source || "Web",
      Description: leadData.description || leadData.message,
      ...leadData.customFields,
    };

    return await makeApiRequest(
      url,
      {
        method: "POST",
        body: JSON.stringify(sfLead),
      },
      accessToken
    );
  },

  /**
   * Get leads from Salesforce using SOQL
   */
  getLeads: async (accessToken, instanceUrl, options = {}) => {
    const limit = options.limit || 200;
    const offset = options.offset || 0;

    const soql = `SELECT Id, FirstName, LastName, Email, Phone, Company, Title, LeadSource, CreatedDate FROM Lead ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`;

    const params = new URLSearchParams({ q: soql });
    const url = `${CRM_API_URLS.salesforce.base(instanceUrl)}${CRM_API_URLS.salesforce.query}?${params}`;

    return await makeApiRequest(url, {}, accessToken);
  },

  /**
   * Update lead in Salesforce
   */
  updateLead: async (accessToken, instanceUrl, leadId, leadData) => {
    const url = `${CRM_API_URLS.salesforce.base(instanceUrl)}${CRM_API_URLS.salesforce.leads}/${leadId}`;

    return await makeApiRequest(
      url,
      {
        method: "PATCH",
        body: JSON.stringify(leadData),
      },
      accessToken
    );
  },
};

// ============================================
// HubSpot CRM API
// ============================================

export const hubspotApi = {
  /**
   * Get current user info (account info)
   */
  getCurrentUser: async (accessToken) => {
    const url = `${CRM_API_URLS.hubspot.base}/oauth/v1/access-tokens/${accessToken}`;
    const data = await makeApiRequest(url, {}, accessToken);

    return {
      id: data.hub_id,
      hubId: data.hub_id,
      userId: data.user_id,
    };
  },

  /**
   * Create contact in HubSpot
   */
  createContact: async (accessToken, leadData) => {
    const url = `${CRM_API_URLS.hubspot.base}${CRM_API_URLS.hubspot.contacts}`;

    const hsContact = {
      properties: {
        email: leadData.email,
        firstname: leadData.firstName || leadData.name?.split(" ")[0] || "",
        lastname:
          leadData.lastName ||
          leadData.name?.split(" ").slice(1).join(" ") ||
          "Unknown",
        phone: leadData.phone,
        company: leadData.company,
        jobtitle: leadData.jobTitle,
        hs_lead_status: "NEW",
        lifecyclestage: "lead",
        ...leadData.customFields,
      },
    };

    return await makeApiRequest(
      url,
      {
        method: "POST",
        body: JSON.stringify(hsContact),
      },
      accessToken
    );
  },

  /**
   * Get contacts from HubSpot
   */
  getContacts: async (accessToken, options = {}) => {
    const limit = options.limit || 100;
    const after = options.after || "";

    const params = new URLSearchParams({
      limit,
      ...(after && { after }),
    });

    const url = `${CRM_API_URLS.hubspot.base}${CRM_API_URLS.hubspot.contacts}?${params}`;
    return await makeApiRequest(url, {}, accessToken);
  },

  /**
   * Update contact in HubSpot
   */
  updateContact: async (accessToken, contactId, leadData) => {
    const url = `${CRM_API_URLS.hubspot.base}${CRM_API_URLS.hubspot.contacts}/${contactId}`;

    const hsContact = {
      properties: leadData,
    };

    return await makeApiRequest(
      url,
      {
        method: "PATCH",
        body: JSON.stringify(hsContact),
      },
      accessToken
    );
  },
};

// ============================================
// Dynamics 365 CRM API
// ============================================

export const dynamicsApi = {
  /**
   * Get current user info (WhoAmI)
   */
  getCurrentUser: async (accessToken, resource) => {
    const url = `${CRM_API_URLS.dynamics.base(resource)}/WhoAmI`;
    const data = await makeApiRequest(url, {}, accessToken);

    return {
      id: data.UserId,
      businessUnitId: data.BusinessUnitId,
      organizationId: data.OrganizationId,
    };
  },

  /**
   * Create lead in Dynamics 365
   */
  createLead: async (accessToken, resource, leadData) => {
    const url = `${CRM_API_URLS.dynamics.base(resource)}${CRM_API_URLS.dynamics.leads}`;

    const dynamicsLead = {
      lastname: leadData.name || leadData.lastName || "Unknown",
      firstname: leadData.firstName || "",
      emailaddress1: leadData.email,
      telephone1: leadData.phone,
      companyname: leadData.company,
      jobtitle: leadData.jobTitle,
      subject: leadData.subject || "Web Lead",
      description: leadData.description || leadData.message,
      ...leadData.customFields,
    };

    return await makeApiRequest(
      url,
      {
        method: "POST",
        body: JSON.stringify(dynamicsLead),
      },
      accessToken
    );
  },

  /**
   * Get leads from Dynamics 365
   */
  getLeads: async (accessToken, resource, options = {}) => {
    const top = options.top || 50;
    const skip = options.skip || 0;

    const params = new URLSearchParams({
      $top: top,
      $skip: skip,
      $orderby: "createdon desc",
    });

    const url = `${CRM_API_URLS.dynamics.base(resource)}${CRM_API_URLS.dynamics.leads}?${params}`;
    return await makeApiRequest(url, {}, accessToken);
  },

  /**
   * Update lead in Dynamics 365
   */
  updateLead: async (accessToken, resource, leadId, leadData) => {
    const url = `${CRM_API_URLS.dynamics.base(resource)}${CRM_API_URLS.dynamics.leads}(${leadId})`;

    return await makeApiRequest(
      url,
      {
        method: "PATCH",
        body: JSON.stringify(leadData),
      },
      accessToken
    );
  },
};

// ============================================
// Unified CRM API Interface
// ============================================

/**
 * Get CRM API handler for provider
 */
export const getCrmApi = (provider) => {
  const apis = {
    zoho: zohoApi,
    salesforce: salesforceApi,
    hubspot: hubspotApi,
    dynamics: dynamicsApi,
  };

  return apis[provider] || null;
};

/**
 * Test CRM connection by fetching user info
 */
export const testCrmConnection = async (provider, accessToken, credentials) => {
  try {
    const api = getCrmApi(provider);

    if (!api) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    let userInfo;

    switch (provider) {
      case "zoho":
        userInfo = await api.getCurrentUser(accessToken, credentials.apiDomain);
        break;
      case "salesforce":
        userInfo = await api.getCurrentUser(
          accessToken,
          credentials.instanceUrl
        );
        break;
      case "hubspot":
        userInfo = await api.getCurrentUser(accessToken);
        break;
      case "dynamics":
        userInfo = await api.getCurrentUser(accessToken, credentials.resource);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    return {
      success: true,
      userInfo,
    };
  } catch (error) {
    console.error(`${provider} connection test failed:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
};
