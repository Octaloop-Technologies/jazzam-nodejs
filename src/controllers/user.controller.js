import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
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
  user,
  provider,
  additionalParams = {}
) => {
  try {
    // Generate authentication tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id
    );

    // Create cookie options
    const cookieOptions = createAuthCookieOptions();

    // Generate redirect URL with provider info
    const redirectUrl = generateSuccessRedirectUrl(process.env.CLIENT_URL, {
      path: "/super-user",
      params: {
        login: "success",
        provider: provider,
        ...additionalParams,
      },
    });

    // Send HTML redirect with cookies
    sendHtmlRedirect(
      res,
      redirectUrl,
      { accessToken, refreshToken },
      cookieOptions,
      {
        title: `Welcome${user.fullName ? `, ${user.fullName}` : ""}!`,
        message: `Successfully authenticated with ${provider}. Redirecting to dashboard...`,
      }
    );
  } catch (error) {
    console.error(`OAuth success handler error for ${provider}:`, error);
    throw new ApiError(500, `Failed to complete ${provider} authentication`);
  }
};

// ==============================================================
// User Authentication Functions
// ==============================================================

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false }); // just save into db without validation
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

const registeruser = asyncHandler(async (req, res) => {
  const { name, email, fullName, password } = req.body;

  // Validate required fields using validator
  const validationRules = {
    name: { type: "required", options: { minLength: 3, maxLength: 30 } },
    email: { type: "email", required: true },
    fullName: { type: "required", options: { minLength: 2, maxLength: 50 } },
    password: { type: "required", options: { minLength: 6, maxLength: 128 } },
  };

  Validator.validateFields(req.body, validationRules);

  // Check if User or email already exists
  const existingUser = await User.findOne({
    $or: [{ name }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User with same name or email already exists");
  }

  // check avatar and cover image
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0].path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files?.coverImage) &&
    req.files?.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files?.coverImage[0]?.path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadToOSS(avatarLocalPath);
  const coverImage = await uploadToOSS(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  // create user in DB
  const user = await User.create({
    name: name.toLowerCase(),
    email,
    fullName,
    password,
    avatar: {
      url: avatar.url,
      public_id: avatar.public_id,
    },
    coverImage: coverImage
      ? {
          url: coverImage.url,
          public_id: coverImage.public_id,
        }
      : null,
  });

  // Get User Data after Creating user and removed password and refreshToken in response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User Registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, name, password } = req.body;

  // Validate login input - either email or name is required
  if (!email && !name) {
    throw new ApiError(400, "Either username or email is required");
  }

  // Validate email format if provided
  if (email) {
    Validator.validateEmail(email, "Email");
  }

  // Validate password
  Validator.validateRequired(password, "Password");

  // Check if User or email already exists
  const user = await User.findOne({
    $or: [{ email }, { name }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // check if password is correct
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Password is incorrect");
  }

  // generate access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // set access and refresh token in cookie using centralized config
  return res
    .status(200)
    .cookie("accessToken", accessToken, getAccessTokenCookieOptions())
    .cookie("refreshToken", refreshToken, getRefreshTokenCookieOptions())
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken }, // send user data with access and refresh token (sending refresh token as optional)
        "User Logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  // Clear refresh token from database
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: { refreshToken: 1 },
    },
    {
      new: true,
    }
  );

  // Get cookie options for clearing cookies - use special clear options
  const accessTokenOptions = getClearAccessTokenCookieOptions();
  const refreshTokenOptions = getClearRefreshTokenCookieOptions();

  // Debug logging for cookie clearing
  if (process.env.NODE_ENV === "development") {
    console.log("Clearing cookies with options:", {
      accessToken: accessTokenOptions,
      refreshToken: refreshTokenOptions,
    });
  }

  // Clear cookies with proper options to ensure they're deleted from the client
  return res
    .status(200)
    .clearCookie("accessToken", accessTokenOptions)
    .clearCookie("refreshToken", refreshTokenOptions)
    .json(new ApiResponse(200, null, "User Logged Out Successfully"));
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
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid Refresh Token", "");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh Token is Expired or used");
    }

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);

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

  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid old Password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password Changed successfully"));
});

// ==============================================================
// OAuth Login Functions
// ==============================================================

const googleLoginCallback = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Google authentication failed");
  }

  // Handle successful Google authentication
  await handleSuccessfulOAuth(res, user, "Google");
});

const zohoCrmLoginUser = asyncHandler(async (req, res) => {
  const { code } = req.query;

  if (!code) {
    // Redirect to Zoho CRM OAuth
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.users.ALL&client_id=${process.env.ZOHO_CLIENT_ID}&response_type=code&access_type=offline&redirect_uri=${process.env.ZOHO_REDIRECT_URI}`;
    return res.redirect(authUrl);
  }

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

  if (!tokenResponse.ok) {
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

  // Get user info from Zoho CRM using the api_domain from token response
  const apiDomain = tokenData.api_domain || "https://www.zohoapis.com";

  const userResponse = await fetch(
    `${apiDomain}/crm/v2/users?type=CurrentUser`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${tokenData.access_token}`,
      },
    }
  );

  const userData = await userResponse.json();

  if (!userResponse.ok) {
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

  const zohoCrmUser = userData.users[0];

  // Validate required user data
  if (!zohoCrmUser.id || !zohoCrmUser.email) {
    throw new ApiError(
      400,
      "Invalid user data from Zoho - Missing required fields (id or email)"
    );
  }

  // Check if user already exists
  let user = await User.findOne({ zohoCrmId: zohoCrmUser.id });

  if (!user) {
    // Check if user exists with same email
    user = await User.findOne({ email: zohoCrmUser.email });

    if (user) {
      // Link Zoho CRM account to existing user
      user.zohoCrmId = zohoCrmUser.id;
      user.provider = "zohocrm";
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        name: zohoCrmUser.email.split("@")[0].toLowerCase(),
        email: zohoCrmUser.email,
        fullName: zohoCrmUser.full_name || zohoCrmUser.name,
        zohoCrmId: zohoCrmUser.id,
        provider: "zohocrm",
        password: "zohocrm_oauth_user", // placeholder password
        isVerified: true,
        avatar: {
          url: "https://via.placeholder.com/150",
          public_id: `zohocrm_${zohoCrmUser.id}`,
        },
      });
    }
  }

  // Handle successful Zoho CRM authentication
  await handleSuccessfulOAuth(res, user, "Zoho CRM");
});

// ==============================================================
// User settings Functions
// ==============================================================
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { email, fullName } = req.body;

  // Validate account update fields
  const validationRules = {
    email: { type: "email", required: true },
    fullName: { type: "required", options: { minLength: 2, maxLength: 50 } },
  };

  Validator.validateFields(req.body, validationRules);

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { email, fullName } },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // delete old avatar
  if (req.user.avatar && req.user.avatar.public_id) {
    await deleteFromOSS(req.user.avatar.public_id);
  }

  // upload new avatar
  const avatar = await uploadToOSS(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(500, "Something went wrong while uploading avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { avatar: { url: avatar.url, public_id: avatar.public_id } } },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  // delete old cover image
  if (req.user.coverImage && req.user.coverImage.public_id) {
    await deleteFromOSS(req.user.coverImage.public_id);
  }

  // upload new cover image
  const coverImage = await uploadToOSS(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(500, "Something went wrong while uploading cover image");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        coverImage: { url: coverImage.url, public_id: coverImage.public_id },
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const deleteAccount = asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.user._id);

  const ossDeletePromises = [];

  if (req.user.avatar && req.user.avatar.public_id) {
    ossDeletePromises.push(
      deleteFromOSS(req.user.avatar.public_id).catch((error) =>
        console.error(`Failed to delete avatar: ${error.message}`)
      )
    );
  }

  if (req.user.coverImage && req.user.coverImage.public_id) {
    ossDeletePromises.push(
      deleteFromOSS(req.user.coverImage.public_id).catch((error) =>
        console.error(`Failed to delete cover image: ${error.message}`)
      )
    );
  }

  await deleteFromOSS(req.user.public_id);

  return res
    .status(200)
    .clearCookie("accessToken", getClearAccessTokenCookieOptions())
    .clearCookie("refreshToken", getClearRefreshTokenCookieOptions())
    .json(new ApiResponse(200, null, "Account deleted successfully"));
});

export {
  registeruser,
  loginUser,
  googleLoginCallback,
  zohoCrmLoginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  deleteAccount,
};
