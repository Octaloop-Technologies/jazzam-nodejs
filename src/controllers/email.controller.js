import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { emailService } from "../services/email.service.js";
import { Validator } from "../utils/validator.js";

//  For submitting waitlist email
const submitWaitlist = asyncHandler(async (req, res) => {
  const { email, name, company, phone, source } = req.body;

  // Validate email using reusable validator
  Validator.validateEmail(email, "Email");

  try {
    // Sanitize and prepare additional data
    const additionalData = {
      name: Validator.sanitizeString(name),
      company: Validator.sanitizeString(company),
      phone: Validator.sanitizePhone(phone),
      source: Validator.sanitizeString(source),
    };

    // Send notification email to admin
    await emailService.sendWaitlistNotification(email, additionalData);

    // Send confirmation email to user (optional)
    if (process.env.SEND_USER_CONFIRMATION === "true") {
      await emailService.sendWaitlistConfirmation(email, name);
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          email,
          message: "Successfully added to waitlist",
        },
        "Thank you for joining our waitlist! We'll be in touch soon."
      )
    );
  } catch (error) {
    console.error("Waitlist submission error:", error);

    // If it's already an ApiError, re-throw it
    if (error instanceof ApiError) {
      throw error;
    }

    // For any other errors, wrap them in ApiError
    throw new ApiError(
      500,
      "Failed to process waitlist submission. Please try again later."
    );
  }
});

//  For testing email configuration
const testEmailConfig = asyncHandler(async (req, res) => {
  try {
    const result = await emailService.testEmailConfiguration();

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Email configuration test completed"));
  } catch (error) {
    console.error("Email config test error:", error);
    throw new ApiError(500, error.message || "Email configuration test failed");
  }
});

//  For sending a test waitlist email
const testWaitlistEmail = asyncHandler(async (req, res) => {
  const { testEmail } = req.body;

  if (!testEmail) {
    throw new ApiError(400, "Test email address is required");
  }

  try {
    // Send test notification
    await emailService.sendWaitlistNotification(testEmail, {
      name: "Test User",
      company: "Test Company",
      source: "API Test",
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { testEmail },
          "Test waitlist email sent successfully"
        )
      );
  } catch (error) {
    console.error("Test email error:", error);
    throw new ApiError(500, error.message || "Failed to send test email");
  }
});

export { submitWaitlist, testEmailConfig, testWaitlistEmail };
