import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Waitlist } from "../models/waitlist.model.js";
import { Validator } from "../utils/validator.js";
import emailService from "../services/email.service.js";

// Join waitlist
const joinWaitlist = asyncHandler(async (req, res) => {
  const { email, name, source = "website", metadata = {} } = req.body;

  // Validate required fields
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // Validate email format
  Validator.validateEmail(email, "Email");

  // Sanitize email
  const sanitizedEmail = Validator.sanitizeEmail(email);

  // Check if email already exists in waitlist
  const existingEntry = await Waitlist.findByEmail(sanitizedEmail);
  if (existingEntry) {
    throw new ApiError(409, "Email already exists in waitlist");
  }

  try {
    // Create waitlist entry
    const waitlistEntry = await Waitlist.create({
      email: sanitizedEmail,
      name: name ? Validator.sanitizeString(name) : null,
      source: source.toLowerCase(),
      metadata: new Map(Object.entries(metadata)),
    });

    // Send notification email to company
    try {
      await emailService.sendWaitlistNotification(sanitizedEmail, {
        name: name || "Not provided",
        source: source,
        signupTime: new Date().toISOString(),
        userAgent: req.get("User-Agent") || "Unknown",
        ipAddress: req.ip || req.connection.remoteAddress || "Unknown",
        ...metadata,
      });
    } catch (emailError) {
      console.error("Failed to send notification email:", emailError);
      // Don't fail the request if email fails
    }

    // Send confirmation email to user
    try {
      await emailService.sendWaitlistConfirmation(
        sanitizedEmail,
        name || sanitizedEmail
      );
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the request if email fails
    }

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          id: waitlistEntry._id,
          email: waitlistEntry.email,
          status: waitlistEntry.status,
          createdAt: waitlistEntry.createdAt,
        },
        "Successfully joined waitlist"
      )
    );
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ApiError(400, `Validation error: ${messages.join(", ")}`);
    }
    throw new ApiError(500, "Error joining waitlist");
  }
});

// Get waitlist statistics (admin only)
const getWaitlistStats = asyncHandler(async (req, res) => {
  try {
    const stats = await Waitlist.getStats();
    const result = stats[0] || {
      totalSignups: 0,
      pendingSignups: 0,
      confirmedSignups: 0,
      convertedSignups: 0,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "Waitlist statistics fetched successfully")
      );
  } catch (error) {
    throw new ApiError(500, "Error fetching waitlist statistics");
  }
});

// Get all waitlist entries (admin only)
const getWaitlistEntries = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    source,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build match conditions
  const matchConditions = { isActive: true };
  if (status) matchConditions.status = status;
  if (source) matchConditions.source = source;

  // Build sort object
  const sortObj = {};
  sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

  try {
    const entries = await Waitlist.find(matchConditions)
      .sort(sortObj)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select("-__v");

    const total = await Waitlist.countDocuments(matchConditions);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          entries,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalEntries: total,
            hasNext: page * limit < total,
            hasPrev: page > 1,
          },
        },
        "Waitlist entries fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, "Error fetching waitlist entries");
  }
});

// Update waitlist entry status (admin only)
const updateWaitlistStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    throw new ApiError(400, "Status is required");
  }

  if (!["pending", "confirmed", "converted"].includes(status)) {
    throw new ApiError(
      400,
      "Invalid status. Must be pending, confirmed, or converted"
    );
  }

  try {
    const entry = await Waitlist.findById(id);
    if (!entry) {
      throw new ApiError(404, "Waitlist entry not found");
    }

    await entry.updateStatus(status);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          entry,
          "Waitlist entry status updated successfully"
        )
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Error updating waitlist entry status");
  }
});

// Delete waitlist entry (admin only)
const deleteWaitlistEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const entry = await Waitlist.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!entry) {
      throw new ApiError(404, "Waitlist entry not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, entry, "Waitlist entry deleted successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Error deleting waitlist entry");
  }
});

export {
  joinWaitlist,
  getWaitlistStats,
  getWaitlistEntries,
  updateWaitlistStatus,
  deleteWaitlistEntry,
};
