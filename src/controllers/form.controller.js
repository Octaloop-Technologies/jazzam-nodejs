import { asyncHandler } from "../utils/asyncHandler.js";
import { Form } from "../models/form.model.js";
import { Lead } from "../models/lead.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import scrapingService from "../services/scraping.service.js";
import emailService from "../services/email.service.js";
import bantService from "../services/bant.service.js";

// ==============================================================
// Form Management Functions
// ==============================================================

const createPlatformForm = asyncHandler(async (req, res) => {
  const { formType } = req.body;

  // Validate form type
  const validTypes = ["linkedin", "meta", "twitter", "instagram"];
  if (!validTypes.includes(formType)) {
    throw new ApiError(
      400,
      `Invalid form type. Must be one of: ${validTypes.join(", ")}`
    );
  }

  // Check if company already has a form of this type
  const existingForm = await Form.findOne({
    companyId: req.company._id,
    formType: formType,
  });

  if (existingForm) {
    throw new ApiError(
      409,
      `You already have a ${formType} form. You can only have one form per platform.`
    );
  }

  // Create form using platform template
  const formTemplate = Form.createPlatformTemplate(formType, req.company._id);
  const form = await Form.create(formTemplate);

  // Set form to active status
  form.status = "active";
  await form.save(); // Save first to generate accessToken

  // Generate embed code after accessToken is created
  form.generateEmbedCode();
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
  const { formType } = req.query;

  const query = { companyId: req.company._id };
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
  // Get existing forms for this company
  let existingForms = await Form.find({
    companyId: req.company._id,
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
          req.company._id
        );
        const form = await Form.create(formTemplate);

        // Set form to active status
        form.status = "active";
        await form.save(); // Save first to generate accessToken

        // Generate embed code after accessToken is created
        form.generateEmbedCode();
        await form.save();

        console.log(`Created ${platform} form with URL: ${form.embedUrl}`);
      }
    } catch (error) {
      console.error(`Error creating/fixing form for ${platform}:`, error);
    }
  }

  // Refetch all forms after creation/fixing
  existingForms = await Form.find({
    companyId: req.company._id,
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
  const { page = 1, limit = 10, status } = req.query;

  const query = { companyId: req.company._id };
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

  const form = await Form.findOne({
    _id: formId,
    companyId: req.company._id,
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

  const form = await Form.findOne({ accessToken }).populate("companyId");

  if (!form) {
    throw new ApiError(404, "Form not found");
  }

  if (!form.isAccessible()) {
    throw new ApiError(403, "Form is not accessible");
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

      // Create lead record from scraped data
      const leadData = {
        companyId: form.companyId,
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
      };

      const lead = await Lead.create(leadData);

      // Send welcome email to lead if enabled and lead has email
      if (form.settings.autoResponse.enabled && lead.email) {
        try {
          await emailService.sendWelcomeEmail(lead, form);
          await lead.updateEmailStatus("welcome", true);
          console.log(`✅ Welcome email sent to lead: ${lead.email}`);
        } catch (error) {
          console.error("Failed to send welcome email to lead:", error);
        }
      } else if (form.settings.autoResponse.enabled && !lead.email) {
        console.log(
          "⚠️ Welcome email not sent - lead email not available from scraped data"
        );
      }

      // Send lead notification email to company
      try {
        await emailService.sendLeadNotificationEmail(
          lead,
          form,
          form.companyId
        );
        console.log(
          `✅ Lead notification email sent to company: ${form.companyId.email}`
        );
      } catch (error) {
        console.error(
          "Failed to send lead notification email to company:",
          error
        );
      }

      // Apply BANT qualification (async, non-blocking)
      qualifyLeadInBackground(lead);
    } catch (scrapingError) {
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
  } catch (error) {
    console.error(`[BANT] Error qualifying lead ${lead._id}:`, error.message);
  }
};

const addFormField = asyncHandler(async (req, res) => {
  const { formId } = req.params;
  const field = req.body;

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
