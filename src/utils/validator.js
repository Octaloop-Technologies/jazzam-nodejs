import { ApiError } from "./ApiError.js";

class Validator {
  // =============================================================================
  // EMAIL VALIDATION
  // =============================================================================

  /**
   * Validates email address format
   * @param {string} email - Email address to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {boolean} required - Whether the field is required
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateEmail(email, fieldName = "Email", required = true) {
    if (!email || typeof email !== "string") {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new ApiError(400, `${fieldName} format is invalid`);
    }

    return true;
  }

  // =============================================================================
  // STRING VALIDATION
  // =============================================================================

  /**
   * Validates required string fields
   * @param {string} value - Value to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {object} options - Validation options
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateRequired(value, fieldName, options = {}) {
    const { minLength = 0, maxLength = Infinity, allowEmpty = false } = options;

    if (!value || (typeof value === "string" && !allowEmpty && !value.trim())) {
      throw new ApiError(400, `${fieldName} is required`);
    }

    if (typeof value === "string") {
      const trimmedValue = value.trim();

      if (trimmedValue.length < minLength) {
        throw new ApiError(
          400,
          `${fieldName} must be at least ${minLength} characters long`
        );
      }

      if (trimmedValue.length > maxLength) {
        throw new ApiError(
          400,
          `${fieldName} must not exceed ${maxLength} characters`
        );
      }
    }

    return true;
  }

  /**
   * Validates string length
   * @param {string} value - Value to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {number} minLength - Minimum length
   * @param {number} maxLength - Maximum length
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateStringLength(
    value,
    fieldName,
    minLength = 0,
    maxLength = Infinity
  ) {
    if (value && typeof value === "string") {
      const trimmedValue = value.trim();

      if (trimmedValue.length < minLength) {
        throw new ApiError(
          400,
          `${fieldName} must be at least ${minLength} characters long`
        );
      }

      if (trimmedValue.length > maxLength) {
        throw new ApiError(
          400,
          `${fieldName} must not exceed ${maxLength} characters`
        );
      }
    }

    return true;
  }

  // =============================================================================
  // PHONE VALIDATION
  // =============================================================================

  /**
   * Validates phone number format
   * @param {string} phone - Phone number to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {boolean} required - Whether the field is required
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validatePhone(phone, fieldName = "Phone", required = true) {
    if (!phone || typeof phone !== "string") {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    // Remove all non-digit characters for validation
    const cleanPhone = phone.replace(/\D/g, "");

    // Check if it's between 10-15 digits (international format)
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      throw new ApiError(400, `${fieldName} must be between 10-15 digits`);
    }

    return true;
  }

  // =============================================================================
  // URL VALIDATION
  // =============================================================================

  /**
   * Validates URL format
   * @param {string} url - URL to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {boolean} required - Whether the field is required
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateUrl(url, fieldName = "URL", required = true) {
    if (!url || typeof url !== "string") {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    try {
      new URL(url.trim());
      return true;
    } catch (error) {
      throw new ApiError(400, `${fieldName} format is invalid`);
    }
  }

  /**
   * Validates LinkedIn profile URL
   * @param {string} linkedinUrl - LinkedIn URL to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {boolean} required - Whether the field is required
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateLinkedInUrl(
    linkedinUrl,
    fieldName = "LinkedIn profile",
    required = false
  ) {
    if (!linkedinUrl || typeof linkedinUrl !== "string") {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    const linkedinRegex =
      /^https?:\/\/(www\.)?linkedin\.com\/(in|pub|profile)\/[a-zA-Z0-9-]+\/?$/;
    if (!linkedinRegex.test(linkedinUrl.trim())) {
      throw new ApiError(
        400,
        `${fieldName} must be a valid LinkedIn profile URL`
      );
    }

    return true;
  }

  // =============================================================================
  // ARRAY VALIDATION
  // =============================================================================

  /**
   * Validates array fields
   * @param {Array} value - Array to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {object} options - Validation options
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateArray(value, fieldName, options = {}) {
    const {
      required = true,
      minLength = 0,
      maxLength = Infinity,
      allowEmpty = false,
    } = options;

    if (!value || !Array.isArray(value)) {
      if (required) {
        throw new ApiError(400, `${fieldName} must be an array`);
      }
      return !required;
    }

    if (!allowEmpty && value.length === 0) {
      throw new ApiError(400, `${fieldName} cannot be empty`);
    }

    if (value.length < minLength) {
      throw new ApiError(
        400,
        `${fieldName} must contain at least ${minLength} item(s)`
      );
    }

    if (value.length > maxLength) {
      throw new ApiError(
        400,
        `${fieldName} must not contain more than ${maxLength} item(s)`
      );
    }

    return true;
  }

  // =============================================================================
  // ENUM VALIDATION
  // =============================================================================

  /**
   * Validates enum values
   * @param {string} value - Value to validate
   * @param {Array} allowedValues - Array of allowed values
   * @param {string} fieldName - Name of the field for error messages
   * @param {boolean} required - Whether the field is required
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateEnum(value, allowedValues, fieldName, required = true) {
    if (!value) {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    if (!allowedValues.includes(value)) {
      throw new ApiError(
        400,
        `${fieldName} must be one of: ${allowedValues.join(", ")}`
      );
    }

    return true;
  }

  // =============================================================================
  // NUMBER VALIDATION
  // =============================================================================

  /**
   * Validates number fields
   * @param {number} value - Number to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {object} options - Validation options
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateNumber(value, fieldName, options = {}) {
    const {
      required = true,
      min = -Infinity,
      max = Infinity,
      integer = false,
    } = options;

    if (value === null || value === undefined || value === "") {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    if (typeof value !== "number" || isNaN(value)) {
      throw new ApiError(400, `${fieldName} must be a valid number`);
    }

    if (integer && !Number.isInteger(value)) {
      throw new ApiError(400, `${fieldName} must be an integer`);
    }

    if (value < min) {
      throw new ApiError(400, `${fieldName} must be at least ${min}`);
    }

    if (value > max) {
      throw new ApiError(400, `${fieldName} must not exceed ${max}`);
    }

    return true;
  }

  // =============================================================================
  // DATE VALIDATION
  // =============================================================================

  /**
   * Validates date fields
   * @param {Date|string} value - Date to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {object} options - Validation options
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateDate(value, fieldName, options = {}) {
    const { required = true, future = false, past = false } = options;

    if (!value) {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    const date = new Date(value);

    if (isNaN(date.getTime())) {
      throw new ApiError(400, `${fieldName} must be a valid date`);
    }

    const now = new Date();

    if (future && date <= now) {
      throw new ApiError(400, `${fieldName} must be a future date`);
    }

    if (past && date >= now) {
      throw new ApiError(400, `${fieldName} must be a past date`);
    }

    return true;
  }

  // =============================================================================
  // OBJECT VALIDATION
  // =============================================================================

  /**
   * Validates object ID (MongoDB ObjectId)
   * @param {string} value - ObjectId to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {boolean} required - Whether the field is required
   * @returns {boolean} - Returns true if valid
   * @throws {ApiError} - Throws ApiError if validation fails
   */
  static validateObjectId(value, fieldName, required = true) {
    if (!value) {
      if (required) {
        throw new ApiError(400, `${fieldName} is required`);
      }
      return !required;
    }

    // MongoDB ObjectId regex pattern
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;

    if (!objectIdRegex.test(value)) {
      throw new ApiError(400, `${fieldName} must be a valid ObjectId`);
    }

    return true;
  }

  // =============================================================================
  // BULK VALIDATION
  // =============================================================================

  /**
   * Validates multiple fields at once
   * @param {object} data - Data object to validate
   * @param {object} rules - Validation rules
   * @returns {boolean} - Returns true if all validations pass
   * @throws {ApiError} - Throws ApiError with combined error messages
   */
  static validateFields(data, rules) {
    const errors = [];

    for (const [fieldName, rule] of Object.entries(rules)) {
      try {
        const value = data[fieldName];

        // Apply validation based on rule type
        switch (rule.type) {
          case "email":
            this.validateEmail(value, fieldName, rule.required);
            break;
          case "required":
            this.validateRequired(value, fieldName, rule.options);
            break;
          case "phone":
            this.validatePhone(value, fieldName, rule.required);
            break;
          case "url":
            this.validateUrl(value, fieldName, rule.required);
            break;
          case "linkedin":
            this.validateLinkedInUrl(value, fieldName, rule.required);
            break;
          case "array":
            this.validateArray(value, fieldName, rule.options);
            break;
          case "enum":
            this.validateEnum(
              value,
              rule.allowedValues,
              fieldName,
              rule.required
            );
            break;
          case "number":
            this.validateNumber(value, fieldName, rule.options);
            break;
          case "date":
            this.validateDate(value, fieldName, rule.options);
            break;
          case "objectId":
            this.validateObjectId(value, fieldName, rule.required);
            break;
          default:
            console.warn(`Unknown validation type: ${rule.type}`);
        }
      } catch (error) {
        if (error instanceof ApiError) {
          errors.push(error.message);
        }
      }
    }

    if (errors.length > 0) {
      throw new ApiError(400, errors.join("; "));
    }

    return true;
  }

  // =============================================================================
  // SANITIZATION HELPERS
  // =============================================================================

  /**
   * Sanitizes and trims string input
   * @param {string} value - Value to sanitize
   * @returns {string|null} - Sanitized value or null if empty
   */
  static sanitizeString(value) {
    if (!value || typeof value !== "string") {
      return null;
    }
    return value.trim() || null;
  }

  /**
   * Sanitizes email input
   * @param {string} email - Email to sanitize
   * @returns {string|null} - Sanitized email or null if empty
   */
  static sanitizeEmail(email) {
    const sanitized = this.sanitizeString(email);
    return sanitized ? sanitized.toLowerCase() : null;
  }

  /**
   * Sanitizes phone input
   * @param {string} phone - Phone to sanitize
   * @returns {string|null} - Sanitized phone or null if empty
   */
  static sanitizePhone(phone) {
    const sanitized = this.sanitizeString(phone);
    if (!sanitized) return null;

    // Remove all non-digit characters except + at the beginning
    return sanitized.replace(/^(\+)?(.*)/, (match, plus, rest) => {
      return (plus || "") + rest.replace(/\D/g, "");
    });
  }
}

export { Validator };
