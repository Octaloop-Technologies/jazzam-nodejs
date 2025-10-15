import emailService from "../services/email.service.js";
import { ContactUs } from "../models/contactUs.model.js";
import { Validator } from "../utils/validator.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const contactUs = asyncHandler(async (req, res) => {
    try {
        const { name, email, companyName, message } = req.body;

        if (!email) {
            throw new ApiError(400, "Email is required");
        }
        // Validate email format
        Validator.validateEmail(email, "Email");



        const contact = await ContactUs.create({
            fullName: name,
            email: email,
            companyName,
            message
        });

        console.log("contact***********", contact)

        return res.status(201).json(
            new ApiResponse(
                201,
                'Contact Us email sent.'
            )
        )

    } catch (error) {
        console.error("Error in contactUs controller:", error);
        throw new ApiError(500, "Error while contact us");
    }

});

export {
    contactUs
}