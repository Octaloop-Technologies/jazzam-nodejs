import { asyncHandler } from "../utils/asyncHandler.js";
import { getTenantModels } from "../models/index.js";
import { CrmIntegration } from "../models/crmIntegration.model.js";
import { Company } from "../models/company.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import scrapingService from "../services/scraping.service.js";
import emailService from "../services/email.service.js";
import bantService from "../services/bant.service.js";
import { syncLeadToCrm } from "../services/crm/sync.service.js";
import mongoose from "mongoose";
import dealHealthService from "../services/dealHealth.service.js";
import { formSchema } from "../models/form.model.js";
// import dealHealthService from "../services/dealHealth.service.js";

// ==============================================================
// Form Management Functions
// ==============================================================

const createPlatformForm = asyncHandler(async (req, res) => {
  const { formType } = req.body;

  // Get tenant-specific models
  const { Form } = getTenantModels(req.tenantConnection);

  // Validate form type
  const validTypes = ["linkedin", "meta", "twitter", "instagram"];
  if (!validTypes.includes(formType)) {
    throw new ApiError(
      400,
      `Invalid form type. Must be one of: ${validTypes.join(", ")}`
    );
  }

  // Check if company already has a form of this type (NO companyId filter needed!)
  const existingForm = await Form.findOne({ formType: formType });

  if (existingForm) {
    throw new ApiError(
      409,
      `You already have a ${formType} form. You can only have one form per platform.`
    );
  }

  // Create form using platform template - call static method through schema
  const baseModel = mongoose.model("Form", formSchema);
  const formTemplate = baseModel.createPlatformTemplate(formType, req.company._id);
  const form = await Form.create(formTemplate);

  // Set form to active status
  form.status = "active";
  await form.save(); // Save first to generate accessToken

  // Generate embed code after accessToken is created
  form.generateEmbedCode();

  // IMPORTANT: Add tenantId to embedUrl for public submissions
  const tenantId = req.tenantId || req.company._id.toString();
  if (form.embedUrl && !form.embedUrl.includes('tenantId=')) {
    form.embedUrl = `${form.embedUrl}${form.embedUrl.includes('?') ? '&' : '?'}tenantId=${tenantId}`;
  }

  await form.save();

  // Increment company's form count
  await req.company.incrementFormCount();

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        form,
        `${formType.charAt(0).toUpperCase() + formType.slice(1)} form created successfully`
      )
    );
});

const getPlatformForms = asyncHandler(async (req, res) => {
  const { formType, tenantId } = req.query;

  // Get tenant-specific models - use provided tenantId or current tenant
  let tenantConnection = req.tenantConnection;
  if (tenantId) {
    const { getTenantConnection } = await import("../db/tenantConnection.js");
    tenantConnection = await getTenantConnection(tenantId);
  }
  const { Form } = getTenantModels(tenantConnection);

  const query = {}; // NO companyId filter needed!
  if (formType) query.formType = formType;

  const forms = await Form.find(query).sort({ createdAt: -1 });

  // Group forms by type
  const groupedForms = {
    linkedin: forms.filter((f) => f.formType === "linkedin"),
    meta: forms.filter((f) => f.formType === "meta"),
    twitter: forms.filter((f) => f.formType === "twitter"),
    instagram: forms.filter((f) => f.formType === "instagram"),
    custom: forms.filter((f) => f.formType === "custom"),
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { forms, groupedForms },
        "Platform forms fetched successfully"
      )
    );
});

const getAvailablePlatforms = asyncHandler(async (req, res) => {
  // Get tenant-specific models
  const { Form } = getTenantModels(req.tenantConnection);

  // Get existing forms for this company
  const companyId = req.company._id;

  console.log("company ID****", companyId)

  let existingForms = await Form.find({
    formType: { $in: ["linkedin", "meta", "twitter", "instagram"] },
  }).select("formType accessToken embedUrl status");

  // Force recreate all forms to ensure they have proper URLs
  const platformTypes = ["linkedin", "meta", "twitter", "instagram"];

  for (const platform of platformTypes) {
    try {
      // Check if form exists
      let existingForm = existingForms.find((f) => f.formType === platform);

      if (
        !existingForm ||
        !existingForm.embedUrl ||
        existingForm.embedUrl.includes("undefined")
      ) {
        // Delete existing form if it has issues
        if (existingForm) {
          await Form.findByIdAndDelete(existingForm._id);
        }

        // Create new form
        const formTemplate = Form.createPlatformTemplate(
          platform,
          companyId
        );
        const form = await Form.create(formTemplate);

        // Set form to active status
        form.status = "active";
        await form.save(); // Save first to generate accessToken

        // Generate embed code after accessToken is created
        form.generateEmbedCode();

        // Add tenantId to embedUrl
        if (form.embedUrl && !form.embedUrl.includes('tenantId=')) {
          form.embedUrl = `${form.embedUrl}${form.embedUrl.includes('?') ? '&' : '?'}tenantId=${companyId}`;
        }

        await form.save();

        console.log(`Created ${platform} form with URL: ${form.embedUrl}`);
      }
    } catch (error) {
      console.error(`Error creating/fixing form for ${platform}:`, error);
    }
  }

  // Refetch all forms after creation/fixing
  existingForms = await Form.find({
    formType: { $in: ["linkedin", "meta", "twitter", "instagram"] },
  }).select("formType accessToken embedUrl");

  const platformsData = [
    {
      platform: "linkedin",
      name: "LinkedIn Lead Generator",
      description:
        "Collect LinkedIn profile URLs and automatically scrape lead data",
      icon: "linkedin",
      formUrl:
        existingForms.find((f) => f.formType === "linkedin")?.embedUrl || null,
      accessToken:
        existingForms.find((f) => f.formType === "linkedin")?.accessToken ||
        null,
      fields: [
        {
          name: "linkedinUrl",
          label: "LinkedIn Profile URL",
          type: "url",
          placeholder: "https://www.linkedin.com/in/your-profile",
          required: true,
        },
      ],
    },
    {
      platform: "meta",
      name: "Meta/Facebook Lead Generator",
      description:
        "Collect Facebook usernames and automatically scrape lead data",
      icon: "facebook",
      formUrl:
        existingForms.find((f) => f.formType === "meta")?.embedUrl || null,
      accessToken:
        existingForms.find((f) => f.formType === "meta")?.accessToken || null,
      fields: [
        {
          name: "facebookUsername",
          label: "Facebook Username",
          type: "text",
          placeholder: "Enter your Facebook username (without @)",
          required: true,
        },
      ],
    },
    {
      platform: "twitter",
      name: "Twitter Lead Generator",
      description:
        "Collect Twitter usernames and automatically scrape lead data",
      icon: "twitter",
      formUrl:
        existingForms.find((f) => f.formType === "twitter")?.embedUrl || null,
      accessToken:
        existingForms.find((f) => f.formType === "twitter")?.accessToken ||
        null,
      fields: [
        {
          name: "twitterUsername",
          label: "Twitter Username",
          type: "text",
          placeholder: "Enter your Twitter username (without @)",
          required: true,
        },
      ],
    },
    {
      platform: "instagram",
      name: "Instagram Lead Generator",
      description:
        "Collect Instagram usernames and automatically scrape lead data",
      icon: "instagram",
      formUrl:
        existingForms.find((f) => f.formType === "instagram")?.embedUrl || null,
      accessToken:
        existingForms.find((f) => f.formType === "instagram")?.accessToken ||
        null,
      fields: [
        {
          name: "instagramUsername",
          label: "Instagram Username",
          type: "text",
          placeholder: "Enter your Instagram username (without @)",
          required: true,
        },
      ],
    },
  ];

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { platforms: platformsData },
        "Platform form endpoints fetched successfully"
      )
    );
});

const getForms = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, tenantId, companyId } = req.query;

  // Get tenant-specific models - use provided tenantId or current tenant
  let tenantConnection = req.tenantConnection;
  if (tenantId) {
    const { getTenantConnection } = await import("../db/tenantConnection.js");
    tenantConnection = await getTenantConnection(tenantId);
  }
  const { Form } = getTenantModels(tenantConnection);

  const targetCompanyId = companyId || req.company._id;

  const query = { companyId: targetCompanyId };
  if (status) query.status = status;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
  };

  const forms = await Form.paginate(query, options);

  return res
    .status(200)
    .json(new ApiResponse(200, forms, "Forms fetched successfully"));
});

const getFormById = asyncHandler(async (req, res) => {
  const { formId } = req.params;
  const { tenantId, companyId } = req.query;

  // Get tenant-specific models - use provided tenantId or current tenant
  let tenantConnection = req.tenantConnection;
  if (tenantId) {
    const { getTenantConnection } = await import("../db/tenantConnection.js");
    tenantConnection = await getTenantConnection(tenantId);
  }
  const { Form } = getTenantModels(tenantConnection);

  const targetCompanyId = companyId || req.company._id;

  const form = await Form.findOne({
    _id: formId,
    companyId: targetCompanyId,
  });

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, form, "Form fetched successfully"));
});

const updateForm = asyncHandler(async (req, res) => {
  const { formId } = req.params;
  const { name, description, config, settings, status } = req.body;

  // Get tenant-specific models
  const { Form } = getTenantModels(req.tenantConnection);

  const form = await Form.findOneAndUpdate(
    { _id: formId, companyId: req.company._id },
    {
      $set: {
        ...(name && { name }),
        ...(description && { description }),
        ...(config && { config }),
        ...(settings && { settings }),
        ...(status && { status }),
      },
    },
    { new: true }
  );

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, form, "Form updated successfully"));
});

const deleteForm = asyncHandler(async (req, res) => {
  const { formId } = req.params;

  // Get tenant-specific models
  const { Form } = getTenantModels(req.tenantConnection);

  const form = await Form.findOneAndDelete({
    _id: formId,
    companyId: req.company._id,
  });

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Form deleted successfully"));
});

const getFormByAccessToken = asyncHandler(async (req, res) => {
  const { accessToken } = req.params;
  const { tenantId } = req.query;

  if (!tenantId) {
    throw new ApiError(400, "Tenant ID is required");
  }

  // Get tenant connection dynamically
  const { getTenantConnection } = await import("../db/tenantConnection.js");
  const tenantConnection = await getTenantConnection(tenantId);
  const { Form } = getTenantModels(tenantConnection);

  const form = await Form.findOne({ accessToken });

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  if (!form.isAccessible()) {
    throw new ApiError(403, "Form is not accessible");
  }

  // Increment view count
  await form.incrementViews();

  return res
    .status(200)
    .json(new ApiResponse(200, form, "Form fetched successfully"));
});

// ==============================================================
// Form Submission Functions
// ==============================================================
const submitFormData = asyncHandler(async (req, res) => {
  const { accessToken } = req.params;
  const formData = req.body;

  // IMPORTANT: This is a public endpoint (no auth required)
  // The tenantId should be included in the form URL (added during form creation)
  const tenantId = req.query.tenantId || req.body.tenantId;

  if (!tenantId) {
    throw new ApiError(
      400,
      "Tenant ID is required. Please use the correct form submission URL with tenantId parameter."
    );
  }

  // Get tenant connection dynamically for this submission
  const { getTenantConnection } = await import("../db/tenantConnection.js");
  const tenantConnection = await getTenantConnection(tenantId);
  const { Form, Lead, Notification } = getTenantModels(tenantConnection);

  const form = await Form.findOne({ accessToken });

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  if (!form.isAccessible()) {
    throw new ApiError(403, "Form is not accessible");
  }

  // Fetch company from system DB
  const company = await Company.findById(form.companyId).populate("teamMembers.company", "_id companyName email logo.url joinedCompanyStatus assignedLeadsType");
  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  // Validate form data based on form configuration
  const validationErrors = validateFormData(formData, form.config.fields);
  if (validationErrors.length > 0) {
    throw new ApiError(400, "Form validation failed", validationErrors);
  }

  // Increment submission count
  await form.incrementSubmissions();

  // Only attempt scraping if it's enabled and form type is not 'custom'
  if (form.platformConfig?.scrapingEnabled && form.formType !== "custom") {
    try {
      // Extract platform URL from form data
      const platformUrl = formData[form.config.fields[0].name];

      const scrapedData = await scrapingService.scrapeProfile(
        form.formType,
        platformUrl
      );

      // Check if scraping returned valid data
      if (!scrapedData) {
        console.error("Scraping returned no data for:", platformUrl);
        throw new Error("Failed to scrape profile data");
      }

      // Prevent duplicates: if a lead with the same platformUrl exists, skip creation
      const existingLead = await Lead.findOne({ platformUrl: platformUrl });

      if (existingLead) {
        console.log(
          `ℹ️ Duplicate lead skipped for tenant ${tenantId} and URL ${platformUrl}`
        );
        return res
          .status(200)
          .json(
            new ApiResponse(
              200,
              { duplicate: true },
              "Lead already exists; skipped"
            )
          );
      }

      // STEP 1: Ensure company has an API key (generate if needed)
      if (!company.apiKey) {
        const apiKey = await company.generateApiKey();
        await company.save();
        console.log(`✅ Generated API key for company: ${company._id}`);
      }

      // Create lead record from scraped data (NO companyId - separate DB!)
      const leadData = {
        formId: form._id,
        platform: form.formType,
        platformUrl: platformUrl,
        profileUrl: platformUrl,
        profilePic:
          scrapedData.profilePic || scrapedData.profilePicHighQuality || null,
        firstName: scrapedData.firstName || null,
        lastName: scrapedData.lastName || null,
        fullName: scrapedData.fullName || null,
        email: scrapedData.email || null,
        phone: scrapedData.mobileNumber || null,
        company: scrapedData.companyName || null,
        companyIndustry: scrapedData.companyIndustry || null,
        companyWebsite: scrapedData.companyWebsite || null,
        companySize: scrapedData.companySize || null,
        jobTitle: scrapedData.jobTitle || null,
        department: scrapedData.department || null,
        location:
          scrapedData.addressWithCountry ||
          scrapedData.addressCountryOnly ||
          null,
        country: scrapedData.addressCountryOnly || null,
        city: scrapedData.addressWithoutCountry || null,
        platformData: scrapedData, // Store complete scraped data
        source: form.formType,
        sourceUrl: form.embedUrl || null,
        status: "new",
        apiKey: company.apiKey,
      };

      const lead = await Lead.create(leadData);

      // Always create deal health and next best action for new leads
      try {
        await dealHealthService.calculateDealHealth(tenantConnection, lead._id);
        console.log(`✅ Deal health calculated for lead: ${lead._id}`);
      } catch (error) {
        console.error("Failed to calculate deal health for lead:", error);
      }

      // Send welcome email to lead if enabled and lead has email
      if (form.settings.autoResponse.enabled && lead.email) {
        try {
          const welcomeEmail = await emailService.sendWelcomeEmail(lead, form);
          await lead.updateEmailStatus("welcome", true);
          // console.log(`✅ Welcome email sent to lead: ${lead.email}`);
          // Log engagement only if email was sent successfully
          if (welcomeEmail.success === true) {
            await dealHealthService.logEngagement(tenantConnection, lead._id, {
              engagementType: "email_sent",
              emailMetrics: {
                subject: "lead welcome email sent",
                sentAt: new Date(),
                messageId: welcomeEmail?.messageId
              },
              contactType: "email",
              direction: "outbound"
            })
          }
        } catch (error) {
          console.error("Failed to send welcome email to lead:", error);
        }
      } else if (form.settings.autoResponse.enabled && !lead.email) {
        console.log(
          "⚠️ Welcome email not sent - lead email not available from scraped data"
        );
      }

      // Send lead notification email to company when enabled in settings
      if (company.settings?.leadNotifications) {
        try {
          await emailService.sendLeadNotificationEmail(
            lead,
            form,
            company
          );
          console.log(
            `✅ Lead notification email sent to company: ${company.email}`
          );

          // Create and emit real-time notification
          const newNotification = await Notification.create({
            companyId: company._id,
            title: "Newly Generated Lead",
            message: `New lead created using ${form.formType} platform for ${lead.email}`
          });

          // Emit notification to all connected clients of this company
          req.io.emit(`notifications`, { action: "newNotification", notification: newNotification });
          console.log(`🔔 Real-time notification sent for company`);

        } catch (error) {
          console.error(
            "Failed to send lead notification email to company:",
            error
          );
        }
      } else {
        console.log(
          `ℹ️ Lead notification email disabled for company: ${company._id}`
        );
      }

      let bantResult = null;

      // Apply BANT qualification if enabled in company settings (async, non-blocking)
      if (company.settings?.autoBANTQualification) {
        bantResult = await qualifyLeadInBackground(lead);
      } else {
        console.log(
          `[BANT] Auto-qualification disabled for company: ${company._id}`
        );
      }

      const newLeadData = await Lead.findById(lead._id);

      // Emit real-time event for new lead
      if (req.io) {
        req.io.to(`company_${company._id}`).emit("lead:new", {
          type: "lead:new",
          data: newLeadData,
          timestamp: new Date().toISOString(),
        });
        // console.log(`📡 Real-time: New lead created - ${lead.fullName}`);
      }

      try {
        const webResponse = await fetch('https://hook.eu2.make.com/ora3wwlyjeodkn7o9qwf6qsowc2watv9', {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            // Company & Team Info
            company: {
              _id: company._id,
              name: company.companyName,
              apiKey: company.apiKey,  // ← API Key in webhook
            },
            // Team Members (for auto-assignment)
            teamMembers: company?.teamMembers,
            // Lead Data
            lead: {
              _id: lead._id,
              fullName: lead.fullName,
              email: lead.email,
              company: lead.company,
              jobTitle: lead.jobTitle,
              phone: lead.phone,
              platform: lead.platform,
              platformUrl: lead.platformUrl,
              leadScore: bantResult?.leadScore || lead?.leadScore || null,
              bantCategory: bantResult?.category || lead?.bantCategory || null,
            },
            apiKey: company.apiKey,  // ← Automation team can use this
            source: "mongo",
            timestamp: new Date().toISOString(),
          })
        });

        // Check if the request was successful
        if (webResponse.ok) {
          const responseText = await webResponse.text();
          console.log("Webhook response:", responseText);
        } else {
          console.error(`Webhook failed with status: ${webResponse.status} - ${webResponse.statusText}`);
        }
      } catch (webhookError) {
        console.error("Webhook error:", webhookError.message);
      }

      // Sync lead to CRM if integration is active (async, non-blocking)
      syncLeadToCrmInBackground(tenantConnection, lead, company._id);
    } catch (scrapingError) {
      console.log("errororor*******", scrapingError)
      console.error("Scraping Error Details:", scrapingError);
    }
  } else {
    console.log("Scraping skipped - either disabled or custom form type");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { formData }, "Form submitted successfully"));
});

// Qualify lead using BANT method in background (non-blocking)
const qualifyLeadInBackground = async (lead) => {
  try {
    console.log(
      `[BANT] Starting background qualification for lead ${lead._id}`
    );

    // Call BANT service to qualify the lead
    const qualificationResult = await bantService.qualifyLead(lead);

    if (!qualificationResult.success) {
      console.error(
        `[BANT] Qualification failed for lead ${lead._id}:`,
        qualificationResult.error
      );
      return;
    }

    // Update lead with BANT data using shared service method
    const bantData = qualificationResult.data;
    await bantService.updateLeadWithBANT(lead, bantData);

    console.log(
      `[BANT] Successfully qualified lead ${lead._id} - Score: ${bantData.score}, Category: ${bantData.category}`
    );
    return { leadId: lead._id, leadScore: bantData.score, category: bantData.category };
  } catch (error) {
    console.error(`[BANT] Error qualifying lead ${lead._id}:`, error.message);
  }
};

// Sync lead to CRM in background (non-blocking)
const syncLeadToCrmInBackground = async (tenantConnection, lead, companyId) => {
  try {
    console.log(`[CRM] Starting background sync for lead ${lead._id} to CRM`);

    // Find active CRM integration for the company
    const crmIntegrations = await CrmIntegration.find({
      companyId: companyId,
      status: "active",
    });

    if (!crmIntegrations) {
      console.log(
        `[CRM] No active CRM integration found for company: ${companyId}`
      );
      return;
    }

    for (const crmIntegration of crmIntegrations) {
      try {
        const syncResult = await syncLeadToCrm(tenantConnection, lead._id, crmIntegration);

        if (syncResult.success) {
          console.log(
            `[CRM] Successfully synced lead ${lead._id} to ${crmIntegration.provider} CRM - CRM ID: ${syncResult.crmId}`
          );
        } else {
          console.error(
            `[CRM] Failed to sync lead ${lead._id} to ${crmIntegration.provider} CRM:`,
            syncResult.error
          );
        }
      } catch (err) {
        console.error(`[CRM] Error syncing to ${crmIntegration.provider}:`, err);
      }
    }

  } catch (error) {
    console.error(
      `[CRM] Error syncing lead ${lead._id} to CRM:`,
      error.message
    );
  }
};

const addFormField = asyncHandler(async (req, res) => {
  const { formId } = req.params;
  const field = req.body;

  // Get tenant-specific models
  const { Form } = getTenantModels(req.tenantConnection);

  const form = await Form.findOne({
    _id: formId,
    companyId: req.company._id,
  });

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  await form.addField(field);

  return res
    .status(200)
    .json(new ApiResponse(200, form, "Field added successfully"));
});

const removeFormField = asyncHandler(async (req, res) => {
  const { formId, fieldId } = req.params;

  // Get tenant-specific models
  const { Form } = getTenantModels(req.tenantConnection);

  const form = await Form.findOne({
    _id: formId,
    companyId: req.company._id,
  });

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  await form.removeField(fieldId);

  return res
    .status(200)
    .json(new ApiResponse(200, form, "Field removed successfully"));
});

// ==============================================================
// Helper Functions
// ==============================================================

const validateFormData = (formData, fields) => {
  const errors = [];

  fields.forEach((field) => {
    const value = formData[field.name];

    if (field.required && (!value || value.trim() === "")) {
      errors.push(`${field.label || field.name} is required`);
    }

    if (value && field.type === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push(`${field.label || field.name} must be a valid email`);
      }
    }

    if (value && field.type === "phone") {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(value.replace(/\s/g, ""))) {
        errors.push(
          `${field.label || field.name} must be a valid phone number`
        );
      }
    }
  });

  return errors;
};

export {
  createPlatformForm,
  getPlatformForms,
  getAvailablePlatforms,
  getForms,
  getFormById,
  updateForm,
  deleteForm,
  getFormByAccessToken,
  submitFormData,
  addFormField,
  removeFormField,
};
