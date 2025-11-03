import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema({
  senderCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  receiverCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "expired"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: "7d", // Auto-delete after 7 days
  },
});

export const Invitation =  mongoose.model("Invitation", invitationSchema);
