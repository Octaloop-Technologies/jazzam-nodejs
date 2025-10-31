// controllers/invitationController.js
import { Company } from "../models/company.model.js";
import { Invitation } from "../models/invitation.model.js";
import crypto from "crypto"
import { asyncHandler } from "../utils/asyncHandler.js";
import emailService from "../services/email.service.js";
// const nodemailer = require("nodemailer");

const sendInvitation = asyncHandler(async(req, res) => {
  const { senderCompanyId, receiverEmail } = req.body;

  console.log("email******", receiverEmail)

  const sender = await Company.findById(senderCompanyId);
  if (!sender) return res.status(404).json({ message: "Sender company not found" });

  // Check if receiver company exists
  const receiver = await Company.findOne({ email: receiverEmail });
  if (!receiver) return res.status(404).json({ message: "Receiver company not found" });

  // Ensure receiver is not already joined anywhere
  if (receiver.joinedCompanies.length > 0) {
    return res.status(400).json({ message: "Receiver is already a member of another company" });
  }

  // Check if already invited
  const existingInvite = await Invitation.findOne({
    senderCompany: sender._id,
    receiverCompany: receiver._id,
    status: "pending",
  });
  if (existingInvite) {
    return res.status(400).json({ message: "Invitation already sent" });
  }

  // Create token & invitation
  const token = crypto.randomBytes(32).toString("hex");
  await Invitation.create({
    senderCompany: sender._id,
    receiverCompany: receiver._id,
    token,
  });

  const inviteLink = `${process.env.CLIENT_URL}/dashboard/invitation/token=${token}`;

  emailService.sendInvitationEmail(receiver?.companyName, receiver?.email, inviteLink);

  // Example: Replace with nodemailer
  console.log(`📧 Send invitation email to ${receiverEmail}: ${inviteLink}`);

  res.json({ message: "Invitation sent successfully", inviteLink });
});

const acceptInvitation = asyncHandler(async(req, res) => {
  const { token } = req.body;
  const invitation = await Invitation.findOne({ token, status: "pending" })
    .populate("senderCompany")
    .populate("receiverCompany");

  if (!invitation)
    return res.status(404).json({ message: "Invalid or expired invitation" });

  const sender = invitation.senderCompany;
  const receiver = invitation.receiverCompany;

  // Add receiver to sender's team
  sender.teamMembers.push({ company: receiver._id });
  await sender.save();

  // Add sender to receiver's joinedCompanies
  receiver.joinedCompanies.push(sender._id);
  receiver.joinedCompanyStatus = true
  await receiver.save();

  // Mark invitation as accepted
  invitation.status = "accepted";
  await invitation.save();

  res.json({ message: "Invitation accepted successfully" });
})


export {
    sendInvitation,
    acceptInvitation
}
