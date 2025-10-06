import crypto from "crypto";
import fetch from "node-fetch";
import { ApiError } from "../utils/ApiError.js";

// PayFort configuration
const PAYFORT_CONFIG = {
  merchantIdentifier: process.env.PAYFORT_MERCHANT_IDENTIFIER,
  accessCode: process.env.PAYFORT_ACCESS_CODE,
  shaRequestPhrase: process.env.PAYFORT_SHA_REQUEST_PHRASE,
  shaResponsePhrase: process.env.PAYFORT_SHA_RESPONSE_PHRASE,
  gatewayUrl:
    process.env.NODE_ENV === "production"
      ? "https://paymentservices.payfort.com/FortAPI/paymentPage"
      : "https://sbpaymentservices.payfort.com/FortAPI/paymentPage",
  apiUrl:
    process.env.NODE_ENV === "production"
      ? "https://paymentservices.payfort.com/FortAPI/paymentApi"
      : "https://sbpaymentservices.payfort.com/FortAPI/paymentApi",
  currency: process.env.PAYFORT_CURRENCY || "USD",
  language: process.env.PAYFORT_LANGUAGE || "en",
};

// Pricing configuration (in minor units, e.g., cents)
const PLAN_PRICES = {
  starter: 2900, // $29.00
  growth: 7900, // $79.00
  pro: 19900, // $199.00
};

/**
 * Generate SHA signature for PayFort requests
 * @param {Object} params - Request parameters
 * @param {string} phraseType - 'request' or 'response'
 * @returns {string} SHA-256 signature
 */
const generateSignature = (params, phraseType = "request") => {
  const phrase =
    phraseType === "request"
      ? PAYFORT_CONFIG.shaRequestPhrase
      : PAYFORT_CONFIG.shaResponsePhrase;

  // Sort parameters alphabetically
  const sortedKeys = Object.keys(params).sort();

  // Build signature string
  let signatureString = phrase;
  sortedKeys.forEach((key) => {
    signatureString += `${key}=${params[key]}`;
  });
  signatureString += phrase;

  // Generate SHA-256 hash
  return crypto.createHash("sha256").update(signatureString).digest("hex");
};

/**
 * Check if PayFort is configured
 * @returns {boolean}
 */
export const isPayfortConfigured = () => {
  return !!(
    PAYFORT_CONFIG.merchantIdentifier &&
    PAYFORT_CONFIG.accessCode &&
    PAYFORT_CONFIG.shaRequestPhrase &&
    PAYFORT_CONFIG.shaResponsePhrase
  );
};

/**
 * Create a PayFort payment request
 * @param {Object} options
 * @param {string} options.plan - Plan key (starter, growth, pro)
 * @param {string} options.companyId - Company ID
 * @param {string} options.companyEmail - Company email
 * @param {string} options.companyName - Company name
 * @returns {Promise<{paymentUrl: string, merchantReference: string}>}
 */
export const createPayfortPaymentRequest = async ({
  plan,
  companyId,
  companyEmail,
  companyName,
}) => {
  try {
    if (!PLAN_PRICES[plan]) {
      throw new ApiError(400, `Invalid plan: ${plan}`);
    }

    // Validate configuration
    if (!isPayfortConfigured()) {
      throw new ApiError(
        501,
        "PayFort is not configured. Please use Stripe or configure PayFort credentials in environment variables."
      );
    }

    // Generate unique merchant reference
    const merchantReference = `${companyId}_${Date.now()}`;

    // Prepare request parameters
    const params = {
      command: "PURCHASE",
      access_code: PAYFORT_CONFIG.accessCode,
      merchant_identifier: PAYFORT_CONFIG.merchantIdentifier,
      merchant_reference: merchantReference,
      amount: PLAN_PRICES[plan],
      currency: PAYFORT_CONFIG.currency,
      language: PAYFORT_CONFIG.language,
      customer_email: companyEmail,
      customer_name: companyName,
      order_description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Subscription`,
      return_url: `${process.env.CLIENT_URL}/super-user?payment=success`,
    };

    // Generate signature
    params.signature = generateSignature(params, "request");

    // Return payment URL and parameters for frontend form submission
    return {
      paymentUrl: PAYFORT_CONFIG.gatewayUrl,
      merchantReference,
      params,
      metadata: {
        companyId,
        plan,
        provider: "payfort",
      },
    };
  } catch (error) {
    console.error("PayFort payment request creation error:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to create PayFort payment request"
    );
  }
};

/**
 * Verify PayFort webhook/response signature
 * @param {Object} response - PayFort response data
 * @returns {boolean} Whether signature is valid
 */
export const verifyPayfortSignature = (response) => {
  try {
    const receivedSignature = response.signature;
    delete response.signature; // Remove signature from params before verification

    const calculatedSignature = generateSignature(response, "response");

    return receivedSignature === calculatedSignature;
  } catch (error) {
    console.error("PayFort signature verification error:", error);
    return false;
  }
};

/**
 * Handle PayFort payment response
 * @param {Object} response - PayFort payment response
 * @returns {Object} Processed payment data
 */
export const handlePayfortPaymentResponse = async (response) => {
  try {
    // Verify signature
    if (!verifyPayfortSignature({ ...response })) {
      throw new ApiError(401, "Invalid PayFort signature");
    }

    const {
      merchant_reference,
      status,
      response_code,
      response_message,
      amount,
      currency,
      fort_id,
      payment_option,
    } = response;

    // Check if payment was successful
    // PayFort success codes: 14000 (Success), 20064 (3DS check)
    const isSuccess = ["14000", "20064"].includes(response_code);

    if (!isSuccess) {
      throw new ApiError(
        400,
        `Payment failed: ${response_message || "Unknown error"}`
      );
    }

    // Extract company ID from merchant reference
    const companyId = merchant_reference.split("_")[0];

    // Determine plan from stored metadata (you'll need to store this temporarily)
    // For now, we'll need to look this up from your database

    return {
      success: true,
      merchantReference: merchant_reference,
      companyId,
      fortId: fort_id,
      status,
      amount,
      currency,
      paymentOption: payment_option,
      responseCode: response_code,
      responseMessage: response_message,
    };
  } catch (error) {
    console.error("Error handling PayFort payment response:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to process PayFort payment response"
    );
  }
};

/**
 * Query PayFort transaction status
 * @param {string} merchantReference - Merchant reference ID
 * @returns {Promise<Object>} Transaction status
 */
export const queryPayfortTransaction = async (merchantReference) => {
  try {
    const params = {
      query_command: "CHECK_STATUS",
      access_code: PAYFORT_CONFIG.accessCode,
      merchant_identifier: PAYFORT_CONFIG.merchantIdentifier,
      merchant_reference: merchantReference,
      language: PAYFORT_CONFIG.language,
    };

    params.signature = generateSignature(params, "request");

    const response = await fetch(PAYFORT_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!verifyPayfortSignature({ ...data })) {
      throw new ApiError(401, "Invalid PayFort response signature");
    }

    return data;
  } catch (error) {
    console.error("Error querying PayFort transaction:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to query transaction status"
    );
  }
};

/**
 * Process PayFort refund
 * @param {Object} options
 * @param {string} options.merchantReference - Original merchant reference
 * @param {number} options.amount - Amount to refund
 * @param {string} options.fortId - PayFort transaction ID
 * @returns {Promise<Object>} Refund response
 */
export const processPayfortRefund = async ({
  merchantReference,
  amount,
  fortId,
}) => {
  try {
    const refundReference = `${merchantReference}_REFUND_${Date.now()}`;

    const params = {
      command: "REFUND",
      access_code: PAYFORT_CONFIG.accessCode,
      merchant_identifier: PAYFORT_CONFIG.merchantIdentifier,
      merchant_reference: refundReference,
      amount: amount,
      currency: PAYFORT_CONFIG.currency,
      language: PAYFORT_CONFIG.language,
      fort_id: fortId,
    };

    params.signature = generateSignature(params, "request");

    const response = await fetch(PAYFORT_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!verifyPayfortSignature({ ...data })) {
      throw new ApiError(401, "Invalid PayFort refund response signature");
    }

    return data;
  } catch (error) {
    console.error("Error processing PayFort refund:", error);
    throw new ApiError(500, error?.message || "Failed to process refund");
  }
};

/**
 * Store pending payment metadata temporarily
 * This should be stored in Redis or database
 * @param {string} merchantReference
 * @param {Object} metadata
 */
export const storePendingPaymentMetadata = (merchantReference, metadata) => {
  // TODO: Implement with Redis or database
  // For now, this is a placeholder
  console.log("Store pending payment metadata:", merchantReference, metadata);
};

/**
 * Retrieve pending payment metadata
 * @param {string} merchantReference
 * @returns {Object|null}
 */
export const getPendingPaymentMetadata = (merchantReference) => {
  // TODO: Implement with Redis or database
  // For now, this is a placeholder
  console.log("Get pending payment metadata:", merchantReference);
  return null;
};
