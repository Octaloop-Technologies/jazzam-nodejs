// ================================================
// Utility functions for email template processing
// ================================================

export function escapeHtml(text) {
  if (typeof text !== "string") return "";

  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// ================================================
// Capitalize the first letter of a string
// ================================================

export function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ================================================
// Sanitize user data to prevent XSS and ensure data quality
// ================================================

export function sanitizeUserData(data) {
  const sanitized = {};

  if (data.name && typeof data.name === "string") {
    sanitized.name = escapeHtml(data.name.trim());
  }

  if (data.company && typeof data.company === "string") {
    sanitized.company = escapeHtml(data.company.trim());
  }

  if (data.phone && typeof data.phone === "string") {
    sanitized.phone = escapeHtml(data.phone.trim());
  }

  if (data.source && typeof data.source === "string") {
    sanitized.source = escapeHtml(data.source.trim());
  }

  return sanitized;
}

// ================================================
// Build HTML rows for user data display
// ================================================

export function buildUserDataRows(sanitizedData) {
  const icons = {
    name: "👤",
    company: "🏢",
    phone: "📞",
    source: "🔗",
  };

  return Object.entries(sanitizedData)
    .filter(([key, value]) => value && value.length > 0)
    .map(
      ([key, value]) => `
      <div class="data-row">
        <span class="label">${icons[key]} ${capitalizeFirst(key)}:</span> 
        <span class="value">${value}</span>
      </div>
    `
    )
    .join("");
}
