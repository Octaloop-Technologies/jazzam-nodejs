/**
 * Middleware to capture raw body for webhook signature verification
 * This is specifically needed for Stripe webhooks
 */
export const captureRawBody = (req, res, next) => {
  // Only capture raw body for webhook endpoints
  if (req.originalUrl.includes("/webhook")) {
    let data = "";
    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      req.rawBody = data;
      next();
    });
  } else {
    next();
  }
};
