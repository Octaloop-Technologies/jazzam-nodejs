import { Router } from 'express';
import gmailService from '../services/email/gmail.service.js';
import outlookService from '../services/email/outlook.service.js';
import yahooService from '../services/email/yahoo.service.js';
import unifiedEmailService from '../services/email/unified.email.service.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Company } from '../models/company.model.js';

const router = Router();

// OAuth callback routes (NO authentication required - Google/Microsoft redirects here)
/**
 * GET /api/v1/mailbox/connect/gmail/callback
 * Gmail OAuth callback
 */
router.get('/connect/gmail/callback', asyncHandler(async (req, res) => {
  // Log all query parameters for debugging
  console.log('📧 Gmail OAuth Callback received:', req.query);
  
  const { code, state: companyId, error, error_description } = req.query;
  
  // Check if user denied access or Google returned an error
  if (error) {
    console.error('❌ Gmail OAuth error:', error, error_description);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=${encodeURIComponent(error_description || error)}`);
  }
  
  // Check if we have the authorization code
  if (!code) {
    console.error('❌ No authorization code received. Query params:', req.query);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=No authorization code received from Google`);
  }
  
  // Check if we have the company ID
  if (!companyId) {
    console.error('❌ No company ID in state parameter');
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=Missing company ID`);
  }

  try {
    console.log('✅ Processing Gmail OAuth for company:', companyId);
    const result = await gmailService.handleCallback(code, companyId);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=connected&provider=gmail&email=${result.email}`);
  } catch (error) {
    console.error('❌ Gmail OAuth callback error:', error);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=${encodeURIComponent(error.message)}`);
  }
}));

/**
 * GET /api/v1/mailbox/connect/outlook/callback
 * Outlook OAuth callback
 */
router.get('/connect/outlook/callback', asyncHandler(async (req, res) => {
  // Log all query parameters for debugging
  console.log('📧 Outlook OAuth Callback received:', req.query);
  
  const { code, state: companyId, error, error_description } = req.query;
  
  // Check if user denied access or Microsoft returned an error
  if (error) {
    console.error('❌ Outlook OAuth error:', error, error_description);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=${encodeURIComponent(error_description || error)}`);
  }
  
  // Check if we have the authorization code
  if (!code) {
    console.error('❌ No authorization code received. Query params:', req.query);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=No authorization code received from Microsoft`);
  }
  
  // Check if we have the company ID
  if (!companyId) {
    console.error('❌ No company ID in state parameter');
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=Missing company ID`);
  }

  try {
    console.log('✅ Processing Outlook OAuth for company:', companyId);
    const result = await outlookService.handleCallback(code, companyId);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=connected&provider=outlook&email=${result.email}`);
  } catch (error) {
    console.error('❌ Outlook OAuth callback error:', error);
    return res.redirect(`${process.env.CLIENT_URL}/super-user/integrations/mailbox?status=error&message=${encodeURIComponent(error.message)}`);
  }
}));

// All other routes require authentication
router.use(verifyJWT);

/**
 * GET /api/v1/mailbox/list
 * Get all mailboxes for company
 */
router.get('/list', asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  
  if (!companyId) {
    throw new ApiError(400, 'Company ID not found');
  }

  const mailboxes = await unifiedEmailService.getMailboxInfo(companyId);
  
  return res.status(200).json(
    new ApiResponse(200, { mailboxes }, 'Mailboxes retrieved')
  );
}));

/**
 * POST /api/v1/mailbox/set-default/:mailboxId
 * Set a mailbox as default
 */
router.post('/set-default/:mailboxId', asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  const { mailboxId } = req.params;
  
  if (!companyId) {
    throw new ApiError(400, 'Company ID not found');
  }

  const result = await unifiedEmailService.setDefaultMailbox(companyId, mailboxId);
  
  return res.status(200).json(
    new ApiResponse(200, result, 'Default mailbox updated')
  );
}));

/**
 * GET /api/v1/mailbox/connect/gmail
 * Initiate Gmail OAuth connection
 */
router.get('/connect/gmail', asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  
  if (!companyId) {
    throw new ApiError(400, 'Company ID not found');
  }

  // Convert ObjectId to string for OAuth state parameter
  const authUrl = gmailService.getAuthUrl(companyId.toString());
  
  console.log('🔗 Gmail OAuth URL generated for company:', companyId.toString());
  
  return res.status(200).json(
    new ApiResponse(200, { authUrl }, 'Gmail authorization URL generated')
  );
}));

/**
 * GET /api/v1/mailbox/connect/outlook
 * Initiate Outlook OAuth connection
 */
router.get('/connect/outlook', asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  
  if (!companyId) {
    throw new ApiError(400, 'Company ID not found');
  }

  // Convert ObjectId to string for OAuth state parameter
  const authUrl = outlookService.getAuthUrl(companyId.toString());
  
  console.log('🔗 Outlook OAuth URL generated for company:', companyId.toString());
  
  return res.status(200).json(
    new ApiResponse(200, { authUrl }, 'Outlook authorization URL generated')
  );
}));

/**
 * POST /api/v1/mailbox/connect/yahoo
 * Connect Yahoo mailbox with app password
 */
router.post('/connect/yahoo', asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  const { email, appPassword, displayName } = req.body;
  
  if (!companyId) {
    throw new ApiError(400, 'Company ID not found');
  }

  if (!email || !appPassword) {
    throw new ApiError(400, 'Email and app password are required');
  }

  const result = await yahooService.connect(companyId, email, appPassword, displayName);
  
  return res.status(200).json(
    new ApiResponse(200, result, 'Yahoo mailbox connected successfully')
  );
}));

/**
 * POST /api/v1/mailbox/test/yahoo
 * Test Yahoo connection before connecting
 */
router.post('/test/yahoo', asyncHandler(async (req, res) => {
  const { email, appPassword } = req.body;
  
  if (!email || !appPassword) {
    throw new ApiError(400, 'Email and app password are required');
  }

  const result = await yahooService.testConnection(email, appPassword);
  
  if (result.success) {
    return res.status(200).json(
      new ApiResponse(200, {}, 'Yahoo connection successful')
    );
  } else {
    throw new ApiError(400, 'Yahoo connection failed: ' + result.error);
  }
}));

/**
 * DELETE /api/v1/mailbox/:mailboxId
 * Disconnect and remove a mailbox
 */
router.delete('/:mailboxId', asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  const { mailboxId } = req.params;
  
  if (!companyId) {
    throw new ApiError(400, 'Company ID not found');
  }

  const company = await Company.findById(companyId);
  const mailbox = company.mailboxes.id(mailboxId);
  
  if (!mailbox) {
    throw new ApiError(404, 'Mailbox not found');
  }

  const provider = mailbox.provider;
  const email = mailbox.email;

  // Call appropriate disconnect method
  switch (provider) {
    case 'gmail':
      await gmailService.disconnect(companyId, mailboxId);
      break;
    case 'outlook':
      await outlookService.disconnect(companyId, mailboxId);
      break;
    case 'yahoo':
      await yahooService.disconnect(companyId, mailboxId);
      break;
  }
  
  return res.status(200).json(
    new ApiResponse(200, {}, `${email} disconnected successfully`)
  );
}));

/**
 * POST /api/v1/mailbox/:mailboxId/toggle
 * Toggle mailbox active status
 */
router.post('/:mailboxId/toggle', asyncHandler(async (req, res) => {
  const companyId = req.company?._id;
  const { mailboxId } = req.params;
  
  if (!companyId) {
    throw new ApiError(400, 'Company ID not found');
  }

  const company = await Company.findById(companyId);
  const mailbox = company.mailboxes.id(mailboxId);
  
  if (!mailbox) {
    throw new ApiError(404, 'Mailbox not found');
  }

  mailbox.isActive = !mailbox.isActive;
  await company.save();
  
  return res.status(200).json(
    new ApiResponse(200, { isActive: mailbox.isActive }, `Mailbox ${mailbox.isActive ? 'activated' : 'deactivated'}`)
  );
}));

export default router;