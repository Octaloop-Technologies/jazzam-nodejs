import { Router } from "express";
import { getLinkedinProfile } from "../controllers/scraping.controller.js";

const router = Router();

// GET /api/v1/scraping/linkedin-profile
router.route("/linkedin-profile").post(getLinkedinProfile);

export default router;
