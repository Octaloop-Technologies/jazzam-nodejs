import { ApiError } from "../utils/ApiError.js";
import { getTenantConnection } from "../db/tenantConnection.js";
import { Company } from "../models/company.model.js";

/**
 * Middleware to inject tenant database connection
 * Must be used after verifyJWT
 */
export const injectTenantConnection = async (req, res, next) => {
  try {
    if (!req.company) {
      throw new ApiError(401, "Authentication required");
    }
    let tenantId;

    if(req.query.companyId !== undefined && req.query.companyId !== null){
      tenantId = req.query.companyId;
    }else if(req.company && req.company._id){
      if (req.company.userType !== "company" && req.company.userType !== "admin") {
        throw new ApiError(403, "Users cannot access company-specific resources directly");
      }
      tenantId = req.company._id.toString();
    }else{
      throw new ApiError(400, "Authenticated company information is missing");
    }

    // Verify that the tenantId corresponds to a company or admin (not a regular user)
    const company = await Company.findById(tenantId);
    if (!company || (company.userType !== "company" && company.userType !== "admin")) {
      throw new ApiError(403, "Invalid tenant access - only companies and admins can have tenant databases");
    }

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
    let tenantConnection;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        tenantConnection = await getTenantConnection(tenantId);
        
        // Verify connection is actually usable
        if (tenantConnection.readyState !== 1) {
          throw new Error(`Connection not ready (state: ${tenantConnection.readyState})`);
        }
        
        // Success! Break out of retry loop
        break;
      } catch (connectionError) {
        lastError = connectionError;
        retries--;
        console.error(`❌ Failed to get tenant connection for ${tenantId} (${3 - retries}/3):`, connectionError.message);
        
        if (retries > 0) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, (4 - retries) * 500));
        }
      }
    }

    // If all retries failed, throw error
    if (!tenantConnection || tenantConnection.readyState !== 1) {
      throw new ApiError(503, `Failed to connect to tenant database after 3 attempts: ${lastError?.message || 'Unknown error'}`);
    }
    
    // Attach to request
    req.tenantConnection = tenantConnection;
    req.tenantId = tenantId;
    
    console.log(`✅ Tenant connection injected: ${tenantId} (readyState: ${tenantConnection.readyState})`);
    
    next();
  } catch (error) {
    console.error('❌ Failed to inject tenant connection:', error);
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