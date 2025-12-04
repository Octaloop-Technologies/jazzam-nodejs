import mongoose, { Schema } from "mongoose";

const OTPSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    otp: {
        type: Number,
        required: true,
        unique: true
    },
    expiresIn: {
        type: Date,
        required: true,
        default: new Date(Date.now() + 15 * 60 * 1000)
    }
}, { timestamps: true });

OTPSchema.methods.verifyCode = function (code) {
    if (this.otp === code && this.expiresIn > new Date()){
        return true;
    }
    return false;
}

export const OTP = mongoose.model("opt", OTPSchema)