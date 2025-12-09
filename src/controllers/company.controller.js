import { asyncHandler } from "../utils/asyncHandler.js";
import { Company } from "../models/company.model.js";
import { uploadToOSS, deleteFromOSS } from "../utils/oss.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Validator } from "../utils/validator.js";
import { Lead } from "../models/lead.model.js";
import FollowUp from "../models/followUp.model.js";
import emailService from "../services/email.service.js";
import { OTP } from "../models/otp.model.js";
import { generateOtp } from "../utils/generateOtp.js";
import bcrypt from "bcrypt";

// import {
//   getAccessTokenCookieOptions,
//   getRefreshTokenCookieOptions,
//   getClearAccessTokenCookieOptions,
//   getClearRefreshTokenCookieOptions,
//   securityConfig,
// } from "../config/security.config.js";
// import {
//   sendHtmlRedirect,
//   generateSuccessRedirectUrl,
// } from "../utils/redirectUtils.js";
// import { S3 } from "aws-sdk";

// ==============================================================
// Helper Functions for OAuth Authentication
// ==============================================================

// const createAuthCookieOptions = () => ({
//   accessToken: getAccessTokenCookieOptions(),
//   refreshToken: getRefreshTokenCookieOptions(),
// });

// ==============================================================
// Set aws credentials
// ==============================================================
// const s3Client = new S3({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_CLIENT_ID,
//     secretAccessKey: process.env.AWS_SECRET_KEY
//   }
// })


const handleSuccessfulOAuth = async (
  res,
  company,
  provider,
  additionalParams = {}
) => {
  console.log("🔍 handleSuccessfulOAuth called - checking for cookie code...");
  console.log("🔍 Cookie code should be commented out");
  try {
    // Generate authentication tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      company._id
    );

    // Create cookie options
    // const cookieOptions = createAuthCookieOptions();

    // Decide post-login redirect based on subscription status
    // User has selected a plan if subscriptionStartDate is set
    // This indicates they've gone through plan selection, not just defaults
    const hasSelectedPlan = !!company.subscriptionStartDate;

    const needsPlanSelection = !hasSelectedPlan;

    const redirectPath = needsPlanSelection
      ? "/super-user/subscription"
      : "/super-user";

    // Generate redirect URL with provider info
    // const redirectUrl = generateSuccessRedirectUrl(process.env.CLIENT_URL, {
    //   path: redirectPath,
    // });

    const redirectUrl = `${process.env.CLIENT_URL}/super-user?accessToken=${accessToken}&refreshToken=${refreshToken}`;

    console.log("🔍 Redirect URL******:", redirectUrl);

    // res.cookie('accessToken', accessToken, securityConfig.session.cookie);

    // res.cookie('refreshToken', refreshToken, securityConfig.session.cookie);

    return res.redirect(redirectUrl);

    // Send HTML redirect with cookies
    // sendHtmlRedirect(
    //   res,
    //   redirectUrl,
    //   { accessToken, refreshToken },
    //   cookieOptions,
    //   {
    //     title: `Welcome${company.companyName ? `, ${company.companyName}` : ""}!`,
    //     message: `Successfully authenticated with ${provider}. Redirecting to dashboard...`,
    //   }
    // );
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

// ==============================================================
// Get Company dashboard
// ==============================================================

const getCompanyDashboard = asyncHandler(async (req, res) => {
  try {
    const companyId = req.params.id; // from auth

    const company = await Company.findById(companyId)
      .populate("joinedCompanies", "_id companyName email logo.url")
      .lean();

    if (!company) return res.status(404).json({ message: "Company not found" });

    // Dashboard stats
    const totalLeads = await Lead.countDocuments({ companyId: company._id });

    // new: counts by status
    const hotLeads = await Lead.countDocuments({ companyId: company._id, status: "hot" });
    const warmLeads = await Lead.countDocuments({ companyId: company._id, status: "warm" });
    const coldLeads = await Lead.countDocuments({ companyId: company._id, status: "cold" });

    const qualifiedLeads = await Lead.countDocuments({
      companyId: company._id,
      $or: [
        { status: "qualified" },
        { "bant.totalScore": { $gte: 60 } },
        { "bant.category": { $in: ["hot", "warm"] } },
        { status: "hot" }
      ],
    });

    const leadFollowUpsSent = await Lead.countDocuments({
      companyId: company._id,
      "emailStatus.followUpSent": true,
    });

    const followUpRecordsSubmitted = await FollowUp.countDocuments({
      companyId: company._id,
      status: "submitted",
    });

    const followUpsSent = leadFollowUpsSent + followUpRecordsSubmitted;

    const convertedLeads = await Lead.countDocuments({
      companyId: company._id,
      "conversionData.converted": true,
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ownCompany: {
            _id: company._id,
            name: company.companyName,
            email: company.email,
            logo: company?.logo?.url,
          },
          stats: {
            totalLeads,
            hotLeads,
            warmLeads,
            coldLeads,
            qualifiedLeads,
            followUpsSent,
            estimatedCloseRate: qualifiedLeads && totalLeads ? ((qualifiedLeads / totalLeads) * 100).toFixed(2) : 0,
            convertedLeads,
          },
        },
        "Company dashboard retrieved successfully"
      )
    );
  } catch (error) {
    console.log("error*********", error)
    throw new ApiError(500, "Error while calling function for get dashboard");
  }
})
// ...existing code...

const registerCompany = asyncHandler(async (req, res) => {
  const { email, password, confirmPassword, userType } = req.body;


  // Validate required fields using validator
  const validationRules = {
    email: { type: "email", required: true },
    password: { type: "required", options: { minLength: 8, maxLength: 128 } },
    confirmPassword: { type: "required" },
  };

  Validator.validateFields(req.body, validationRules);

  // Check if passwords match
  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  // Check if Company or email already exists
  const existingCompany = await Company.findOne({ email });

  if (existingCompany) {
    throw new ApiError(
      409,
      "Email already registered. Please login or use a different email."
    );
  }

  // // Handle logo upload if provided
  // let logo = null;
  // const logoLocalPath = req.file?.path;
  // if (logoLocalPath) {
  //   logo = await uploadToOSS(logoLocalPath);
  // }

  // Create company in DB
  const company = await Company.create({
    email,
    companyName: email,
    password,
    provider: "local",
    emailVerified: false,
    userType
  });

  if (!company) {
    throw new ApiError(500, "Failed to create company account");
  }

  // Generate verification code
  await company.save();

  // generate random 6 digit code
  const verificationCode = generateOtp()

  // save verification code in otp model
  const newEmailOtp = await OTP.create({
    email,
    otp: verificationCode,
  });

  await newEmailOtp.save();

  // Send verification email
  const emailResult = await emailService.sendVerificationCode(
    email,
    verificationCode,
  );

  if (!emailResult.success) {
    console.warn("⚠️ Failed to send verification email, but account was created");
  }

  // Get Company Data after Creating company and removed password and refreshToken in response
  // const createdCompany = await Company.findById(company._id).select(
  //   "-password -refreshToken"
  // );

  // New companies always need plan selection (they're on trial by default)
  // const needsPlanSelection = true;

  // Set cookies and return response
  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        {
          message: "Account created successfully. Please check your email for verification code."
        },
        "Signup successful. Verification code sent to email."
      )
    );
});

// ==============================================================
// Verify Email with Code
// ==============================================================

const verifyEmail = asyncHandler(async (req, res) => {
  const { email, verificationCode } = req.body;

  // Validate required fields
  if (!verificationCode) {
    throw new ApiError(400, "Email and verification code are required");
  }

  // check if code exists
  const findOtp = await OTP.findOne({ otp: verificationCode });

  // return error if code does not exists
  if (!findOtp) {
    throw new ApiError(400, `${verificationCode} does not exists`);
  }

  // if (findOtp.expiresIn < new Date()) {
  //   throw new ApiError(400, `${verificationCode} expired. please get new verification code`);
  // }


  // Verify email after code verification
  const existsCompany = await Company.findOne({ email });
  if (!existsCompany) {
    throw new ApiError(404, "Company not found");
  }

  if (existsCompany.emailVerified) {
    throw new ApiError(400, "Email is already verified");
  }

  // set email verified field to true after code verification
  existsCompany.emailVerified = true;

  await existsCompany.save();

  // delete otp after verification is completed
  // await OTP.deleteOne({ _id: findOtp._id });

  // Generate access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    existsCompany._id
  );

  const redirectUrl = `${process.env.CLIENT_URL}/super-user?accessToken=${accessToken}&refreshToken=${refreshToken}`;

  console.log("🔍Redirect URL******:", redirectUrl);

  return res.status(200).json({
    redirect: redirectUrl
  });

  // return res.status(200).json(
  //   new ApiResponse(
  //     200,
  //     { company: verifiedCompany, accessToken, refreshToken },
  //     "Email verified successfully. You can now login."
  //   )
  // );
});

// ==============================================================
// Resend Verification Code
// ==============================================================

const resendVerificationCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Validate email
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  Validator.validateEmail(email, "Email");

  // Find company by email
  const company = await Company.findOne({ email });

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  // Check if already verified
  if (company.emailVerified) {
    throw new ApiError(400, "Email is already verified");
  }

  // Generate new verification code
  const verificationCode = generateOtp();

  // save verification code in otp model
  const newEmailOtp = await OTP.create({
    email,
    otp: verificationCode,
  });

  await newEmailOtp.save();

  // Send verification email
  const emailResult = await emailService.sendVerificationCode(
    email,
    verificationCode,
  );

  if (!emailResult.success) {
    throw new ApiError(500, "Failed to send verification email");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { email },
      "Verification code resent to your email. Please check within 15 minutes."
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
  const isPasswordValid = await bcrypt.compare(password, company.password);

  console.log("isPasswordValid*******", isPasswordValid)

  if (!isPasswordValid) {
    throw new ApiError(401, "Password is incorrect. Please! enter valid password");
  }

  // Generate access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    company._id
  );

  const redirectUrl = `${process.env.CLIENT_URL}/super-user?accessToken=${accessToken}&refreshToken=${refreshToken}`;

  console.log("🔍Redirect URL******:", redirectUrl);

  return res.status(200).json({
    redirect: redirectUrl
  });



  // Check if needs plan selection
  // User has selected a plan if subscriptionStartDate is set
  // const hasSelectedPlan = !!company.subscriptionStartDate;

  // const needsPlanSelection = !hasSelectedPlan;

  // Set access and refresh token in cookie
  // return res
  //   .status(200)
  //   .json(
  //     new ApiResponse(
  //       200,
  //       {
  //         company: loggedInCompany,
  //         accessToken,
  //         refreshToken,
  //         needsPlanSelection,
  //       },
  //       "Company Logged In Successfully"
  //     )
  //   );
});

// ==============================================================
// Complete Company Onboarding
// ==============================================================

const completeCompanyOnboarding = asyncHandler(async (req, res) => {
  const { companyName, description, service, subServices } = req.body;

  // Validate that all required fields are provided and not empty
  if (!companyName || companyName.trim() === "") {
    throw new ApiError(400, "Company name is required and cannot be empty");
  }

  if (!description || description.trim() === "") {
    throw new ApiError(400, "Description is required and cannot be empty");
  }

  if (!service || service.trim() === "") {
    throw new ApiError(400, "Service type is required and cannot be empty");
  }

  if(!subServices || subServices.length === 0){
    throw new ApiError(400, "Sub Service type is required and cannot be empty");
  }

  // Get company from request (from verifyJWT middleware)
  const companyId = req.company._id;

  if (!companyId) {
    throw new ApiError(401, "Unauthorized request");
  }

  // Update company with onboarding data
  const updatedCompany = await Company.findByIdAndUpdate(
    companyId,
    {
      $set: {
        companyName: companyName.trim(),
        description: description.trim(),
        companyServiceType: service.trim(),
        companySubServices: subServices,
        companyOnboarding: true, 
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  if (!updatedCompany) {
    throw new ApiError(404, "Company not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      updatedCompany,
      "Company onboarding completed successfully"
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
  // const accessTokenOptions = getClearAccessTokenCookieOptions();
  // const refreshTokenOptions = getClearRefreshTokenCookieOptions();

  // clear cookies
  // res.cookie("accessToken", 'none', {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV === "production",
  //   sameSite: "lax",
  //   path: "/",
  // });

  // res.cookie("refreshToken", 'none', {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV === "production",
  //   sameSite: "lax",
  //   path: "/",
  // });

  // send response
  return res
    .status(200)
    .json(new ApiResponse(200, null, "Company Logged Out Successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.body.refreshToken;

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
      // .cookie("accessToken", accessToken, getAccessTokenCookieOptions())
      // .cookie("refreshToken", newRefreshToken, getRefreshTokenCookieOptions())
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
    const { type } = req.query;
    let authUrl;
    if (type === 'login') {
      // Redirect to Zoho OAuth
      authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.users.ALL&client_id=${process.env.ZOHO_CLIENT_ID}&response_type=code&access_type=offline&redirect_uri=${process.env.ZOHO_LOGIN_REDIRECT_URI}`;
    } else {
      authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.ALL&client_id=${process.env.ZOHO_CLIENT_ID}&response_type=code&access_type=offline&redirect_uri=${process.env.ZOHO_REDIRECT_URI}`;
    }


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
          redirect_uri: process.env.ZOHO_LOGIN_REDIRECT_URI,
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

    console.log("usersData************", userData);

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

  try {
    const logoLocalPath = req.file?.path;

    if (!logoLocalPath) {
      throw new ApiError(400, "Logo file is missing");
    }

    // Delete old logo
    // if (req.company.logo && req.company.logo.public_id) {
    //   await deleteFromOSS(req.company.logo.public_id);
    // }

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
  } catch (error) {
    console.log("error*******", error)
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to delete team member"
    );
  }
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
    // .clearCookie("accessToken", getClearAccessTokenCookieOptions())
    // .clearCookie("refreshToken", getClearRefreshTokenCookieOptions())
    .json({ success: true, message: "Company deleted successfully" });
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


// get team members assigned 
const companyTeamsMembers = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id).populate("teamMembers.company", "_id companyName email logo.url joinedCompanyStatus");
    return res.status(200).json({ success: true, message: "Team members retrieved successfully", data: company });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to get team members"
    );
  }
});

const deactivateTeamMember = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const memberCompany = await Company.findById(id);
    memberCompany.joinedCompanyStatus = false;
    await memberCompany.save();

    res.status(200).json({
      success: true,
      message: "Team member status deactivated successfully",
    });

  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to delete team member"
    );
  }
});

const activateTeamMember = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const memberCompany = await Company.findById(id);
    memberCompany.joinedCompanyStatus = true;
    await memberCompany.save();

    res.status(200).json({
      success: true,
      message: "Team member status activated successfully",
    });

  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to delete team member"
    );
  }
});


const getJoinedCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log("id******", id)
  try {
    const companyId = req.company?._id;
    const company = await Company.findOne({ _id: id }, { email: 1, companyName: 1 }).populate("joinedCompanies", "_id email companyName logo.url joinedCompanyStatus")
    if (company) {
      return res.status(200).json({ success: true, message: "Joined company data retrieved successfully", data: company });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to get team members"
    );
  }
});

const changeCompanyName = asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  try {
    const { companyName } = req.body;
    const companyId = req.company?._id;
    if (companyId) {
      const company = await Company.findById(companyId);
      company.companyName = companyName;
      await company.save();
      return res.status(201).json({ success: true, message: "Company name changed successfully" })
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to get team members"
    );
  }
});

const updateUserType = asyncHandler(async (req, res) => {
  try {
    const userId = req.params?.id;
    const { userType } = req.body;
    const user = await Company.findById(userId);
    if (!user) {
      return res.status(400).json({ success: false, message: "User not found" });
    }
    user.userType = userType;
    user.userFirstLogin = false;
    await user.save();
    return res.status(200).json({ success: true, message: "User type updated" });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      error.message || "Failed to get team members"
    );
  }
})

export {
  registerCompany,
  getCompanyDashboard,
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
  companyTeamsMembers,
  deactivateTeamMember,
  activateTeamMember,
  getJoinedCompany,
  changeCompanyName,
  updateUserType,
  verifyEmail,
  resendVerificationCode,
  completeCompanyOnboarding
};
