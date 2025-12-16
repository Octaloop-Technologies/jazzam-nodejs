import mongoose from "mongoose";

/**
 * Connection pool for tenant databases
 * Stores active connections to avoid reconnecting
 */

const tenantConnectionPool = new Map();

/**
 * Maximum number of tenant connections to keep open
*/
const MAX_POOL_SIZE = 50;

/**
 * Connection cleanup interval (in milliseconds)
 */
const CLEANUP_INTERVAL = 300000;

export async function getTenantConnection(tenantId){
    if(!tenantId){
        throw new Error('Tenant ID is required');
    }

    // Check if connection exists in pool
    if(tenantConnectionPool.has(tenantId)){
        const cachedConnection = tenantConnectionPool.get(tenantId);

        // update last used timestamp
        cachedConnection.lastUsed = Date.now();

        // Return connection if it's ready
        if(cachedConnection.connection.readyState ===  1){
            console.log(`Reusing connection for tenant: ${tenantId}`);
            return cachedConnection.connection;
        }

        // Remove stale connection
        tenantConnectionPool.delete(tenantId);
    }

    // Create new connection
    console.log(`Creating new connection for tenant: ${tenantId}`);

    const dbName = `jazzam_company_${tenantId}`;
    const mongoUri = process.env.MONGODB_URI.replace(/\/[^\/]*$/, `/${dbName}`);

    const connection = mongoose.createConnection(mongoUri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 5000,
        family: 4
    });

    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
        connection.once('connected', resolve);
        connection.once('error', reject);
    });

    // Store in pool
    tenantConnectionPool.set(tenantId, {
        connection,
        createdAt: Date.now(),
        lastUsed: Date.now()
    });

    // Enforce pool size limit
    if(tenantConnectionPool.size > MAX_POOL_SIZE){
        await cleanUpOldConnections();
    }

    console.log(`Connection created for tenant: ${tenantId}`);

    return connection;
}

/**
 * Get shared system database connection
 */
export function getSystemConnection(){
    // Return the main mongoose connection
    return mongoose.connection;
}

/**
 * Close connection for specific tenant
 */
export async function closeTenantConnection(tenantId){
    if(tenantConnectionPool.has(tenantId)){
        const { connection } = tenantConnectionPool.get(tenantId);
        await connection.close();
        tenantConnectionPool.delete(tenantId);
        console.log(`Closed connection for tenant: ${tenantId}`);
    }
}

/**
 * Clean up old/unused connections
 */

async function cleanUpOldConnections(){
    const now = Date.now();
    const maxIdleTime = 600000;

    const toRemove = [];

    for(const [tenantId, { lastUsed, connection }] of tenantConnectionPool.entries()){
        const idleTime = now - lastUsed;

        if(idleTime > maxIdleTime){
            toRemove.push(tenantId);
        }
    }

    // Remove oldest connection if pool is full
    if(toRemove.length === 0 && tenantConnectionPool.size >= MAX_POOL_SIZE){
        const sorted = Array.from(tenantConnectionPool.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        toRemove.push(sorted[0][0]); // Remove oldest
    }

    // Close and remove connections
    for (const tenantId of toRemove){
        await closeTenantConnection(tenantId);
    }

    if(toRemove.length > 0){
        console.log(`Cleaned ip ${toRemove.length} idle connections`);
    }
}

/**
 * Start Periodic cleanup
 */
setInterval(cleanUpOldConnections, CLEANUP_INTERVAL);

/**
 * Close all tenant connections (for graceful shutdown)
 */
export async function closeAllTenantConnections(){
    console.log(`Closing all ${tenantConnectionPool.size} tenant connections...`);

    const closePromises = Array.from(tenantConnectionPool.keys()).map(
        tenantId => closeTenantConnection(tenantId)
    )

    await Promise.all(closePromises);
    console.log('All tenant connections closed');
}

/**
 * Get connection pool stats
 */
export function getConnectionPoolStats(){
    return {
        activeConnections: tenantConnectionPool.size,
        maxPoolSize: MAX_POOL_SIZE,
        connections: Array.from(tenantConnectionPool.entries()).map(([tenantId, data]) => ({
            tenantId,
            readyState: data.connection.readyState,
            idleTime: Date.now() - data.lastUsed,
            age: Date.now() - data.createdAt
        }))
    }
}