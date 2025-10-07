import { asyncHandler } from "../utils/asyncHandler.js";
import { Company } from "../models/company.model.js";
import { uploadToOSS, deleteFromOSS } from "../utils/oss.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Validator } from "../utils/validator.js";
import {
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getClearAccessTokenCookieOptions,
  getClearRefreshTokenCookieOptions,
} from "../config/security.config.js";
import {
  sendHtmlRedirect,
  generateSuccessRedirectUrl,
} from "../utils/redirectUtils.js";

// ==============================================================
// Helper Functions for OAuth Authentication
// ==============================================================

const createAuthCookieOptions = () => ({
  accessToken: getAccessTokenCookieOptions(),
  refreshToken: getRefreshTokenCookieOptions(),
});

const handleSuccessfulOAuth = async (
  res,
  company,
  provider,
  additionalParams = {}
) => {
  try {
    // Generate authentication tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      company._id
    );

    // Create cookie options
    const cookieOptions = createAuthCookieOptions();

    // Decide post-login redirect based on subscription status
    // User has selected a plan if subscriptionStartDate is set
    // This indicates they've gone through plan selection, not just defaults
    const hasSelectedPlan = !!company.subscriptionStartDate;

    const needsPlanSelection = !hasSelectedPlan;

    const redirectPath = needsPlanSelection
      ? "/super-user/subscription"
      : "/super-user";

    // Generate redirect URL with provider info
    const redirectUrl = generateSuccessRedirectUrl(process.env.CLIENT_URL, {
      path: redirectPath,
    });

    // Send HTML redirect with cookies
    sendHtmlRedirect(
      res,
      redirectUrl,
      { accessToken, refreshToken },
      cookieOptions,
      {
        title: `Welcome${company.companyName ? `, ${company.companyName}` : ""}!`,
        message: `Successfully authenticated with ${provider}. Redirecting to dashboard...`,
      }
    );
  } catch (error) {
    console.error(`OAuth success handler error for ${provider}:`, error);
    throw new ApiError(500, `Failed to complete ${provider} authentication`);
  }
};

// ==============================================================
// Company Authentication Functions
// ==============================================================

const generateAccessAndRefreshToken = async (companyId) => {
  try {
    const company = await Company.findById(companyId);
    const accessToken = company.generateAccessToken();
    const refreshToken = company.generateRefreshToken();

    company.refreshToken = refreshToken;
    await company.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

const registerCompany = asyncHandler(async (req, res) => {
  const { companyName, email, password, website, industry, contactPerson } =
    req.body;

  // Validate required fields using validator
  const validationRules = {
    companyName: {
      type: "required",
      options: { minLength: 2, maxLength: 100 },
    },
    email: { type: "email", required: true },
    password: { type: "required", options: { minLength: 6, maxLength: 128 } },
  };

  Validator.validateFields(req.body, validationRules);

  // Check if Company or email already exists
  const existingCompany = await Company.findOne({
    $or: [{ companyName }, { email }],
  });

  if (existingCompany) {
    throw new ApiError(409, "Company with same name or email already exists");
  }

  // Handle logo upload if provided
  let logo = null;
  const logoLocalPath = req.file?.path;
  if (logoLocalPath) {
    logo = await uploadToOSS(logoLocalPath);
  }

  // Create company in DB
  const company = await Company.create({
    companyName,
    email,
    password,
    website,
    industry,
    contactPerson,
    logo: logo
      ? {
          url: logo.url,
          public_id: logo.public_id,
        }
      : null,
  });

  // Get Company Data after Creating company and removed password and refreshToken in response
  const createdCompany = await Company.findById(company._id).select(
    "-password -refreshToken"
  );

  if (!createdCompany) {
    throw new ApiError(
      500,
      "Something went wrong while registering the company"
    );
  }

  // Generate tokens for immediate login after registration
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    company._id
  );

  // New companies always need plan selection (they're on trial by default)
  const needsPlanSelection = true;

  // Set cookies and return response
  return res
    .status(201)
    .cookie("accessToken", accessToken, getAccessTokenCookieOptions())
    .cookie("refreshToken", refreshToken, getRefreshTokenCookieOptions())
    .json(
      new ApiResponse(
        201,
        {
          company: createdCompany,
          accessToken,
          refreshToken,
          needsPlanSelection,
        },
        "Company Registered Successfully"
      )
    );
});

const loginCompany = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate login input
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // Validate email format
  Validator.validateEmail(email, "Email");

  // Validate password
  Validator.validateRequired(password, "Password");

  // Check if Company exists
  const company = await Company.findOne({ email });

  if (!company) {
    throw new ApiError(404, "Company does not exist");
  }

  // Check if company is active
  if (!company.isActive) {
    throw new ApiError(403, "Company account is deactivated");
  }

  // Check if password is correct
  const isPasswordValid = await company.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Password is incorrect");
  }

  // Update last login
  company.lastLoginAt = new Date();
  await company.save();

  // Generate access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    company._id
  );

  const loggedInCompany = await Company.findById(company._id).select(
    "-password -refreshToken"
  );

  // Check if needs plan selection
  // User has selected a plan if subscriptionStartDate is set
  const hasSelectedPlan = !!company.subscriptionStartDate;

  const needsPlanSelection = !hasSelectedPlan;

  // Set access and refresh token in cookie
  return res
    .status(200)
    .cookie("accessToken", accessToken, getAccessTokenCookieOptions())
    .cookie("refreshToken", refreshToken, getRefreshTokenCookieOptions())
    .json(
      new ApiResponse(
        200,
        {
          company: loggedInCompany,
          accessToken,
          refreshToken,
          needsPlanSelection,
        },
        "Company Logged In Successfully"
      )
    );
});

const logoutCompany = asyncHandler(async (req, res) => {
  if (!req.company) {
    throw new ApiError(401, "Unauthorized request");
  }

  await Company.findByIdAndUpdate(
    req.company._id,
    {
      $unset: { refreshToken: 1 },
    },
    {
      new: true,
    }
  );

  // Get cookie options for clearing cookies
  const accessTokenOptions = getClearAccessTokenCookieOptions();
  const refreshTokenOptions = getClearRefreshTokenCookieOptions();

  // Clear cookies
  return res
    .status(200)
    .clearCookie("accessToken", accessTokenOptions)
    .clearCookie("refreshToken", refreshTokenOptions)
    .json(new ApiResponse(200, null, "Company Logged Out Successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request", "");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    // Check if refresh token is valid
    const company = await Company.findById(decodedToken?._id);

    if (!company) {
      throw new ApiError(401, "Invalid Refresh Token", "");
    }

    if (incomingRefreshToken !== company?.refreshToken) {
      throw new ApiError(401, "Refresh Token is Expired or used");
    }

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(company._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, getAccessTokenCookieOptions())
      .cookie("refreshToken", newRefreshToken, getRefreshTokenCookieOptions())
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access Token Refreshed Successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const company = await Company.findById(req.company?._id);

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  const isPasswordCorrect = await company.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid old Password");
  }

  company.password = newPassword;
  await company.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password Changed successfully"));
});

// ==============================================================
// OAuth Login Functions
// ==============================================================

const googleLoginCallback = asyncHandler(async (req, res) => {
  const company = req.user;

  if (!company) {
    throw new ApiError(401, "Google authentication failed");
  }

  // Handle successful Google authentication
  await handleSuccessfulOAuth(res, company, "Google");
});

const zohoLoginCallback = asyncHandler(async (req, res) => {
  const company = req.company;

  if (!company) {
    throw new ApiError(401, "Zoho authentication failed");
  }

  // Handle successful Zoho authentication
  await handleSuccessfulOAuth(res, company, "Zoho");
});

const zohoLogin = asyncHandler(async (req, res) => {
  try {
    // Redirect to Zoho OAuth
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.users.ALL&client_id=${process.env.ZOHO_CLIENT_ID}&response_type=code&access_type=offline&redirect_uri=${process.env.ZOHO_REDIRECT_URI}`;

    return res.redirect(authUrl);
  } catch (error) {
    throw new ApiError(500, "Failed to initiate Zoho login");
  }
});

const zohoCallback = asyncHandler(async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    throw new ApiError(400, `Zoho OAuth error: ${error}`);
  }

  if (!code) {
    throw new ApiError(400, "Authorization code not provided");
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://accounts.zoho.com/oauth/v2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          redirect_uri: process.env.ZOHO_REDIRECT_URI,
          code: code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new ApiError(
        400,
        `Failed to get access token from Zoho: ${tokenData.error_description || tokenData.error || tokenResponse.statusText}`
      );
    }

    if (!tokenData.access_token) {
      throw new ApiError(
        400,
        "Failed to get access token from Zoho CRM - No token in response"
      );
    }

    // Get company info from Zoho CRM using the api_domain from token response
    const apiDomain = tokenData.api_domain || "https://www.zohoapis.com";

    const userResponse = await fetch(`${apiDomain}/crm/v2/users`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
    });

    const userData = await userResponse.json();

    if (
      !userData.users ||
      !Array.isArray(userData.users) ||
      userData.users.length === 0
    ) {
      throw new ApiError(
        400,
        `Zoho CRM API Error: ${userData.message || userResponse.statusText}`
      );
    }

    if (
      !userData.users ||
      !Array.isArray(userData.users) ||
      userData.users.length === 0
    ) {
      throw new ApiError(
        400,
        "Failed to get user data from Zoho CRM - Invalid response structure"
      );
    }

    const zohoUser = userData.users[0];

    // Validate required fields
    if (!zohoUser.id || !zohoUser.email) {
      throw new ApiError(
        400,
        "Invalid user data from Zoho - Missing required fields (id or email)"
      );
    }

    // Check if company already exists with this Zoho ID
    let company = await Company.findOne({ zohoId: zohoUser.id });

    if (company) {
      req.company = company;
      return await zohoLoginCallback(req, res);
    }

    // Check if company exists with same email
    company = await Company.findOne({ email: zohoUser.email });

    if (company) {
      // Link Zoho account to existing company
      company.zohoId = zohoUser.id;
      company.provider = "zoho";
      await company.save();
      req.company = company;
      return await zohoLoginCallback(req, res);
    }

    // Create new company
    const newCompany = await Company.create({
      companyName: zohoUser.email.split("@")[0].toLowerCase(),
      email: zohoUser.email,
      zohoId: zohoUser.id,
      provider: "zoho",
      password: "zoho_oauth_company", // placeholder password
      isVerified: true,
      logo: {
        url: "https://via.placeholder.com/150",
        public_id: `zoho_${zohoUser.id}`,
      },
    });

    req.company = newCompany;
    return await zohoLoginCallback(req, res);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Zoho authentication error: ${error.message}`);
  }
});

// ==============================================================
// Company Settings Functions
// ==============================================================

const getCurrentCompany = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(200, req.company, "Current company fetched successfully")
    );
});

const updateCompanyDetails = asyncHandler(async (req, res) => {
  const { companyName, email, website, industry, contactPerson, settings } =
    req.body;

  // Validate account update fields
  const validationRules = {
    companyName: {
      type: "required",
      options: { minLength: 2, maxLength: 100 },
    },
    email: { type: "email", required: true },
  };

  Validator.validateFields(req.body, validationRules);

  const company = await Company.findByIdAndUpdate(
    req.company._id,
    {
      $set: {
        companyName,
        email,
        website,
        industry,
        contactPerson,
        ...(settings && { settings: { ...req.company.settings, ...settings } }),
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(
      new ApiResponse(200, company, "Company details updated successfully")
    );
});

const updateOnboardingStatus = asyncHandler(async (req, res) => {
  const { completed, currentStep, completedSteps, skipped } = req.body;

  const updateData = {};

  if (completed !== undefined) {
    updateData["onboarding.completed"] = completed;
    if (completed) {
      updateData["onboarding.completedAt"] = new Date();
    }
  }

  if (currentStep !== undefined) {
    updateData["onboarding.currentStep"] = currentStep;
  }

  if (completedSteps !== undefined) {
    updateData["onboarding.completedSteps"] = completedSteps;
  }

  if (skipped !== undefined) {
    updateData["onboarding.skipped"] = skipped;
  }

  const company = await Company.findByIdAndUpdate(
    req.company._id,
    { $set: updateData },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(
      new ApiResponse(200, company, "Onboarding status updated successfully")
    );
});

const updateCompanyLogo = asyncHandler(async (req, res) => {
  const logoLocalPath = req.file?.path;

  if (!logoLocalPath) {
    throw new ApiError(400, "Logo file is missing");
  }

  // Delete old logo
  if (req.company.logo && req.company.logo.public_id) {
    await deleteFromOSS(req.company.logo.public_id);
  }

  // Upload new logo
  const logo = await uploadToOSS(logoLocalPath);

  if (!logo.url) {
    throw new ApiError(500, "Something went wrong while uploading logo");
  }

  const company = await Company.findByIdAndUpdate(
    req.company._id,
    { $set: { logo: { url: logo.url, public_id: logo.public_id } } },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, company, "Logo updated successfully"));
});

const updateSubscriptionStatus = asyncHandler(async (req, res) => {
  const {
    subscriptionStatus,
    subscriptionPlan,
    subscriptionEndDate,
    subscriptionStartDate,
    trialEndDate,
    paymentMethod,
    paymentDetails,
  } = req.body;

  const update = {
    subscriptionStatus,
    subscriptionPlan,
    subscriptionEndDate: subscriptionEndDate
      ? new Date(subscriptionEndDate)
      : null,
  };

  if (trialEndDate) {
    update.trialEndDate = new Date(trialEndDate);
  }
  if (subscriptionStartDate) {
    update.subscriptionStartDate = new Date(subscriptionStartDate);
  } else if (subscriptionStatus === "active" && !update.subscriptionStartDate) {
    update.subscriptionStartDate = new Date();
  }
  if (paymentMethod) {
    update.paymentMethod = paymentMethod;
  }
  if (paymentDetails && typeof paymentDetails === "object") {
    update.paymentDetails = { ...paymentDetails };
  }

  const company = await Company.findByIdAndUpdate(
    req.company._id,
    { $set: update },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(
      new ApiResponse(200, company, "Subscription status updated successfully")
    );
});

const deleteCompany = asyncHandler(async (req, res) => {
  await Company.findByIdAndDelete(req.company._id);

  const ossDeletePromises = [];

  if (req.company.logo && req.company.logo.public_id) {
    ossDeletePromises.push(
      deleteFromOSS(req.company.logo.public_id).catch((error) =>
        console.error(`Failed to delete logo: ${error.message}`)
      )
    );
  }

  await Promise.all(ossDeletePromises);

  return res
    .status(200)
    .clearCookie("accessToken", getClearAccessTokenCookieOptions())
    .clearCookie("refreshToken", getClearRefreshTokenCookieOptions())
    .json(new ApiResponse(200, null, "Company deleted successfully"));
});

// ==============================================================
// Settings Management
// ==============================================================

const updateSettings = asyncHandler(async (req, res) => {
  const { settings } = req.body;
  const companyId = req.company._id;

  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: { settings: { ...req.company.settings, ...settings } } },
    { new: true, runValidators: true }
  ).select("-password");

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, company, "Settings updated successfully"));
});

export {
  registerCompany,
  loginCompany,
  googleLoginCallback,
  zohoLoginCallback,
  zohoLogin,
  zohoCallback,
  logoutCompany,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentCompany,
  updateCompanyDetails,
  updateOnboardingStatus,
  updateCompanyLogo,
  updateSubscriptionStatus,
  updateSettings,
  deleteCompany,
};
