import mongoose from "mongoose";

/**
 * Cache for tenant-specific models
 * key: `${tenantId}_${modelName}`
 */

const modelCache = new Map();

/**
 * Get tenant-specific model instance
 * @param {mongoose.Connection} connection - Tenant database connection
 * @param {string} modelName - Model name (e.g., 'Lead', 'Form')
 * @param {mongoose.Schema} schema - Mongoose schema
 * @returns {mongoose.Model}
 */
export function getTenantModel(connection, modelName, schema){
    const cacheKey = `${connection.name}_${modelName}`;

    // Return cache model if exists
    if(modelCache.has(cacheKey)){
        return modelCache.get(cacheKey);
    }

    // Check if model already exists on this connection
    if(connection.models[modelName]){
        const model = connection.models[modelName];
        modelCache.set(cacheKey, model);
        return model;
    }

    // create new model
    const model = connection.model(modelName, schema);
    modelCache.set(cacheKey, model);

    console.log(`Created model ${modelName} for database: ${connection.name}`);

    return model;
}

/**
 * Clear model cache for a specific tenant (usefull after schema changes)
 */
export function clearTenantModelCache(tenantId){
    const dbName = `jazzam_company_${tenantId}`;

    for(const key of modelCache.keys()){
        if(key.startsWith(dbName)){
            modelCache.delete(key);
        }
    }

    console.log(`Cleared model cache for tenant: ${tenantId}`);
}