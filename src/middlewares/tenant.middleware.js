import { ApiError } from "../utils/ApiError.js";
import { getTenantConnection } from "../db/tenantConnection.js";

/**
 * Middleware to inject tenant database connection
 * Must be used after verifyJWT
 */
export const injectTenantConnection = async (req, res, next) => {
  try {
    if (!req.company) {
      throw new ApiError(401, "Authentication required");
    }

    const tenantId = req.company._id.toString();
    
    // Get or create connection for this tenant
    const tenantConnection = await getTenantConnection(tenantId);
    
    // Attach to request
    req.tenantConnection = tenantConnection;
    req.tenantId = tenantId;
    
    console.log(`🔗 Tenant connection injected: ${tenantId}`);
    
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