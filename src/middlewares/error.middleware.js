import { ApiError } from "../utils/apiError.js";

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = err;

  // If it's not an ApiError, convert it to one
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || "Something went wrong";
    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  // Log errors in development
  if (process.env.NODE_ENV !== "production") {
    console.error("❌ Error:", {
      statusCode: error.statusCode,
      message: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // Prepare error response
  const response = {
    statusCode: error.statusCode,
    message: error.message,
    success: false,
    ...(process.env.NODE_ENV !== "production" && { stack: error.stack }),
    ...(error.errors?.length > 0 && { errors: error.errors }),
  };

  // Send error response
  return res.status(error.statusCode).json(response);
};

// Handle 404 - Route not found
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`);
  next(error);
};

export { errorHandler, notFoundHandler };
