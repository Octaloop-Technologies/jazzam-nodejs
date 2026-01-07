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

export async function getTenantConnection(tenantId) {
    if (!tenantId) {
        throw new Error('Tenant ID is required');
    }

    // Check if connection exists in pool
    if (tenantConnectionPool.has(tenantId)) {
        const cachedConnection = tenantConnectionPool.get(tenantId);

        // Check if connection is still alive and ready
        if (cachedConnection.connection.readyState === 1) {
            try {
                // Ping the database to ensure connection is actually usable
                await cachedConnection.connection.db.admin().ping();
                console.log(`Reusing healthy connection for tenant: ${tenantId}`);
                // update last used timestamp
                cachedConnection.lastUsed = Date.now();
                return cachedConnection.connection;
            } catch (pingError) {
                console.warn(`Stale connection detected for tenant ${tenantId}, removing from pool:`, pingError.message);
                tenantConnectionPool.delete(tenantId);
            }
        } else {
            // Remove stale connection
            console.log(`Removing stale connection for tenant: ${tenantId} (readyState: ${cachedConnection.connection.readyState})`);
            tenantConnectionPool.delete(tenantId);
        }
    }

    // Create new connection
    console.log(`Creating new connection for tenant: ${tenantId}`);

    const dbName = `jazzam_company_${tenantId}`;
    const mongoUri = process.env.MONGODB_URI.replace(
        /\/([^\/\?]+)(\?|$)/,
        `/${dbName}$2`
    );

    const connection = mongoose.createConnection(mongoUri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        family: 4,
    });

    // Wait for connection to be ready with proper error handling
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Connection timeout for tenant ${tenantId}`));
        }, 10000);

        connection.once('connected', () => {
            clearTimeout(timeout);
            resolve();
        });
        
        connection.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });

    // Ensure connection is actually ready by waiting for 'open' event
    if (connection.readyState !== 1) {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection not ready for tenant ${tenantId}`));
            }, 5000);

            if (connection.readyState === 1) {
                clearTimeout(timeout);
                resolve();
            } else {
                connection.once('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                connection.once('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            }
        });
    }

    // Additional health check with ping
    try {
        await connection.db.admin().ping();
        console.log(`✅ Connection health check passed for tenant: ${tenantId}`);
    } catch (pingError) {
        console.error(`❌ Connection health check failed for tenant ${tenantId}:`, pingError.message);
        await connection.close();
        throw new Error(`Health check failed for tenant ${tenantId}: ${pingError.message}`);
    }

    // Store in pool
    tenantConnectionPool.set(tenantId, {
        connection,
        createdAt: Date.now(),
        lastUsed: Date.now()
    });

    // Enforce pool size limit
    if (tenantConnectionPool.size > MAX_POOL_SIZE) {
        await cleanUpOldConnections();
    }

    console.log(`Connection created for tenant: ${tenantId}`);

    return connection;
}

/**
 * Get shared system database connection
 */
export function getSystemConnection() {
    // Return the main mongoose connection
    return mongoose.connection;
}

/**
 * Close connection for specific tenant
 */
export async function closeTenantConnection(tenantId) {
    if (tenantConnectionPool.has(tenantId)) {
        const { connection } = tenantConnectionPool.get(tenantId);
        await connection.close();
        tenantConnectionPool.delete(tenantId);
        console.log(`Closed connection for tenant: ${tenantId}`);
    }
}

/**
 * Clean up old/unused connections
 */

async function cleanUpOldConnections() {
    const now = Date.now();
    const maxIdleTime = 600000;

    const toRemove = [];

    for (const [tenantId, { lastUsed, connection }] of tenantConnectionPool.entries()) {
        const idleTime = now - lastUsed;

        if (idleTime > maxIdleTime) {
            toRemove.push(tenantId);
        }
    }

    // Remove oldest connection if pool is full
    if (toRemove.length === 0 && tenantConnectionPool.size >= MAX_POOL_SIZE) {
        const sorted = Array.from(tenantConnectionPool.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        toRemove.push(sorted[0][0]); // Remove oldest
    }

    // Close and remove connections
    for (const tenantId of toRemove) {
        await closeTenantConnection(tenantId);
    }

    if (toRemove.length > 0) {
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
export async function closeAllTenantConnections() {
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
export function getConnectionPoolStats() {
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