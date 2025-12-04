import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Services } from "../models/services.model.js";

const router = Router();

// ================================================
// Protected routes - Require authentication (Admin only)
// ================================================
router.use(verifyJWT);

// Get all services
// GET /api/v1/services
router.route("/").get(asyncHandler(async(req, res) => {
    try {
        const services = await Services.find();
        return res.status(200).json({ data: services, message:"All services retrived" })
    } catch (error) {
        throw new ApiError(500, "Internal server error");
    }
}));

// Get specific service and sub-services
// GET /api/v1/services/:id
router.route("/:id").get(asyncHandler(async(req, res) => {
    try {
        const { id } = req.params;
        const services = await Services.findById(id);
        return res.status(200).json({ data: services, message:"All services retrived" })
    } catch (error) {
        throw new ApiError(500, "Internal server error");
    }
}));


export default router;