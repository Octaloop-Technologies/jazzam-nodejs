import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import webhookService from "../services/webhook.service.js";

// Test webhook connectivity
const testWebhook = asyncHandler(async (req, res) => {
  try {
    const result = await webhookService.testWebhook();

    if (result.success) {
      return res
        .status(200)
        .json(new ApiResponse(200, result, "Webhook test successful"));
    } else {
      return res
        .status(500)
        .json(new ApiResponse(500, result, "Webhook test failed"));
    }
  } catch (error) {
    throw new ApiError(500, "Error testing webhook");
  }
});

// Get webhook configuration info
const getWebhookInfo = asyncHandler(async (req, res) => {
  try {
    const webhookUrl =
      process.env.MAKE_WEBHOOK_URL ||
      "https://hook.eu2.make.com/wi3fcb78kawlmocru2qlocbm5e5jhho7";

    const info = {
      webhook_url: webhookUrl,
      is_configured: !!process.env.MAKE_WEBHOOK_URL,
      timeout: webhookService.timeout,
      retry_attempts: webhookService.retryAttempts,
      retry_delay: webhookService.retryDelay,
      status: "active",
    };

    return res
      .status(200)
      .json(new ApiResponse(200, info, "Webhook configuration retrieved"));
  } catch (error) {
    throw new ApiError(500, "Error retrieving webhook info");
  }
});

export { testWebhook, getWebhookInfo };
