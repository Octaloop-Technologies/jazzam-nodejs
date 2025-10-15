import mongoose, { Schema } from "mongoose"; 


const ContactUsSchema = new Schema({
    fullName: {
        type: String,
    },
    email:{
        type: String,
    },
    companyName: {
        type: String
    },
    message: {
        type: String
    }
}, { timestamps: true });

export const ContactUs = mongoose.model('ContactUs', ContactUsSchema);