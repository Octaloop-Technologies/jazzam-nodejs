// src/controllers/proposal.controller.js
import proposalService from "../services/proposal.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Generate a new proposal for a lead
 */
export const generateProposal = async (req, res) => {
  try {
    const { leadId } = req.params;
    const result = await proposalService.generateProposal(leadId, req.tenantConnection);

    if (!result.success) {
      throw new ApiError(500, result.error);
    }

    // Include download URL for the Word document
    const responseData = {
      ...result.proposal.toObject(),
      downloadUrl: `${req.protocol}://${req.get('host')}${result.filePath}`,
    };

    res.status(201).json(new ApiResponse(201, responseData, "Proposal generated successfully"));
  } catch (error) {
    throw new ApiError(500, error.message || "Failed to generate proposal");
  }
};

/**
 * Get all proposals for a lead
 */
export const getProposalsByLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    const proposals = await proposalService.getProposalsByLead(leadId, req.tenantConnection);

    res.status(200).json(new ApiResponse(200, proposals, "Proposals retrieved successfully"));
  } catch (error) {
    throw new ApiError(500, error.message || "Failed to retrieve proposals");
  }
};

/**
 * Update proposal status
 */
export const updateProposalStatus = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { status } = req.body;

    if (!["draft", "sent", "accepted", "rejected"].includes(status)) {
      throw new ApiError(400, "Invalid status");
    }

    const proposal = await proposalService.updateProposalStatus(proposalId, status, req.tenantConnection);

    res.status(200).json(new ApiResponse(200, proposal, "Proposal status updated successfully"));
  } catch (error) {
    throw new ApiError(500, error.message || "Failed to update proposal status");
  }
};