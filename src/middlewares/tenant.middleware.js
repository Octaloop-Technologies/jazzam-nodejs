import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { getTenantConnection } from "../db/tenantConnection.js";
import { Company } from "../models/company.model.js";

/**
 * Middleware to inject tenant database connection
 * Must be used after verifyJWT
 */
export const injectTenantConnection = async (req, res, next) => {
  try {
    // Validate authentication
    if (!req.company) {
      console.error('❌ [Tenant Middleware] No company in request');
      throw new ApiError(401, "Authentication required");
    }
    
    let tenantId;

    // Determine tenant ID from query parameter or authenticated user
    if(req.query.companyId !== undefined && req.query.companyId !== null){
      tenantId = req.query.companyId;
      console.log(`📝 [Tenant Middleware] Using tenantId from query: ${tenantId}`);
    }else if(req.company && req.company._id){
      if (req.company.userType !== "company" && req.company.userType !== "admin") {
        console.error(`❌ [Tenant Middleware] Invalid userType: ${req.company.userType}`);
        throw new ApiError(403, "Users cannot access company-specific resources directly");
      }
      tenantId = req.company._id.toString();
      console.log(`📝 [Tenant Middleware] Using tenantId from auth: ${tenantId}`);
    }else{
      console.error('❌ [Tenant Middleware] No valid tenant ID source');
      throw new ApiError(400, "Authenticated company information is missing");
    }

    // Verify that the tenantId corresponds to a company or admin (not a regular user)
    console.log(`🔍 [Tenant Middleware] Validating company: ${tenantId}`);
    const company = await Company.findById(tenantId);
    
    if (!company) {
      console.error(`❌ [Tenant Middleware] Company not found: ${tenantId}`);
      throw new ApiError(404, "Company not found");
    }
    
    if (company.userType !== "company" && company.userType !== "admin") {
      console.error(`❌ [Tenant Middleware] Invalid company userType: ${company.userType} for ${tenantId}`);
      throw new ApiError(403, "Invalid tenant access - only companies and admins can have tenant databases");
    }

    console.log(`✅ [Tenant Middleware] Company validated: ${company.companyName} (${tenantId})`);

    // Attach company document for further validation
    req.companyDoc = company;

    // If the authenticated user is of type "user", check if they are a team member of the company
    if (req.company.userType === "user") {
      const isTeamMember = company.teamMembers.some(member => member.company.toString() === req.company._id.toString());
      if (!isTeamMember) {
        throw new ApiError(403, "User is not a team member of this company");
      }
    }
    
    // Get or create connection for this tenant with retry logic
    console.log(`🔌 [Tenant Middleware] Attempting to get tenant connection for: ${tenantId}`);
    let tenantConnection;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        console.log(`🔄 [Tenant Middleware] Attempt ${4 - retries}/3 for tenant: ${tenantId}`);
        tenantConnection = await getTenantConnection(tenantId);
        
        // Verify connection is actually usable
        if (tenantConnection.readyState !== 1) {
          throw new Error(`Connection not ready (state: ${tenantConnection.readyState})`);
        }
        
        console.log(`✅ [Tenant Middleware] Connection established (readyState: ${tenantConnection.readyState})`);
        // Success! Break out of retry loop
        break;
      } catch (connectionError) {
        lastError = connectionError;
        retries--;
        console.error(`❌ [Tenant Middleware] Connection attempt failed for ${tenantId} (attempt ${4 - retries}/3):`, connectionError.message);
        console.error(`   Error stack:`, connectionError.stack);
        
        if (retries > 0) {
          const waitTime = (4 - retries) * 500;
          console.log(`⏳ [Tenant Middleware] Waiting ${waitTime}ms before retry...`);
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // If all retries failed, throw error
    if (!tenantConnection || tenantConnection.readyState !== 1) {
      const errorMsg = `Failed to connect to tenant database after 3 attempts: ${lastError?.message || 'Unknown error'}`;
      console.error(`❌ [Tenant Middleware] ${errorMsg}`);
      throw new ApiError(503, errorMsg);
    }
    
    // Attach to request
    req.tenantConnection = tenantConnection;
    req.tenantId = tenantId;
    
    console.log(`✅ [Tenant Middleware] Tenant connection injected successfully: ${tenantId}`);
    console.log(`   Database: jazzam_company_${tenantId}`);
    console.log(`   ReadyState: ${tenantConnection.readyState}`);
    
    next();
  } catch (error) {
    console.error('❌ [Tenant Middleware] Fatal error in injectTenantConnection:', error);
    console.error('   Error details:', {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode
    });
    
    // If it's already an ApiError, rethrow it
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Otherwise wrap it in an ApiError
    throw new ApiError(500, `Tenant connection failed: ${error.message}`);
  }
};

/**
 * Middleware to validate resource ownership (simplified with separate DBs)
 * No need to check companyId since it's separate database
 */
export const validateTenantAccess = (modelName, schema, paramKey = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramKey];
      
      if (!mongoose.Types.ObjectId.isValid(resourceId)) {
        throw new ApiError(400, "Invalid resource ID");
      }

      // Get model from tenant connection
      const { getTenantModel } = await import('../models/tenantModelFactory.js');
      const Model = getTenantModel(req.tenantConnection, modelName, schema);
      
      // Query without companyId (separate DB guarantees isolation)
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        throw new ApiError(404, "Resource not found");
      }

      req.validatedResource = resource;
      next();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Access validation failed: ${error.message}`);
    }
  };
};