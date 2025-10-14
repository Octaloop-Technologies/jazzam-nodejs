import mongoose, { Mongoose, Schema } from "mongoose";

const BillingHistorySchema = new Schema({
    userId: {
        type:mongoose.Types.ObjectId,
        default: null
    },
    susbscritionPlan: {
        type: String,
        enum: ["free", "starter", "growth", "pro"],
        default: "free",
    },
    status: {
        type: String,
        enum: ["paid", "pending"]
    },
    month: {
        type: String,
        default: new Date()
    },
    amount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

export const BillingHistory = mongoose.model("BillingHistory", BillingHistorySchema)