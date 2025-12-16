import { ApiError } from "../utils/ApiError";

// Permission matrix
export const PERMISSIONS = {
    OWNER: [
        'company:read', 'company:write', 'company:delete',
        'team:invite', 'team:remove', 'team:manage',
        'leads:read', 'leads:write', 'leads:delete', 'leads:export',
        'forms:read', 'forms:write', 'forms:delete',
        'settings:read', 'settings:write',
        'billing:read', 'billing:write',
        'crm:read', 'crm:write',
        'analytics:read'
    ],
    MEMBER: [
        'company:read',
        'leads:read', 'leads:write',
        'forms:read', 'forms:write',
        'settings:read',
        'analytics:read'
    ],
    VIEWER: [
        'company:read',
        'leads:read',
        'forms:read',
        'analytics:read'
    ]
};

/**
 * Check if user has specific permission
 */
export const requiredPermission = (permission) => {
    return async(req, res, next) => {
        try {
            const company = req.company;

            // Determine user role
            let userRole = 'MEMBER';

            if(!company.joinedCompanies){
                // This is an owner (no joinedCompanies field)
                userRole = 'OWNER';
            }else {
                if(company.joinedCompanyStatus === false){
                    throw new ApiError(403, "Tour account is deactivated");
                }
                // Check role in team (if you add role field later)
                userRole = company.teamRole || 'MEMBER';
            }

            // Get permissions for role
            const rolePermissions = PERMISSIONS[userRole] || [];

            if(!rolePermissions.includes(permission)){
                // Log permission denial for security audit
                console.warn(`[RBAC] Permission denied: ${permission} for ${company?.email}`);
                throw new ApiError(403, `Access denied: Missing '${permission}' permission`);
            }

            // Attach for use in controller
            req.userRole = userRole;
            req.userPermissions = rolePermissions;
            next()
        } catch (error) {
            if(error instanceof ApiError) throw error;
            throw new ApiError(403, "Permission check failed");
        }
    }
}

/**
 * Require at least one of multiple permissions
 */
export const requireAnyPermission = (...permissions) => {
    return async(req, res, next) => {
        try {
            const company = req.company;
            const userRole = !company.joinedCompanies ? 'OWNER' : 'MEMBER';
            const rolePermissions = PERMISSIONS[userRole] || [];

            const hasPermission = permissions.some(p => rolePermissions.includes(p));

            if(!hasPermission){
                throw new ApiError(
                    403,
                    `Access denied: Need one of [${permissions.join(', ')}]`
                )
            }
            
            req.userRole = userRole;
            req.userPermissions = rolePermissions;
            next()
        } catch (error) {
            if(error instanceof ApiError) throw error;
            throw new ApiError(403, "Permission check failed");
        }
    }
}



