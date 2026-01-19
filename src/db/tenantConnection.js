import mongoose from "mongoose";
import { validateMongoUri, createTenantUri } from "../utils/validateMongoUri.js";

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
        console.error('❌ [TenantConnection] Tenant ID is missing');
        throw new Error('Tenant ID is required');
    }

    console.log(`🔍 [TenantConnection] Getting connection for tenant: ${tenantId}`);

    // Check if connection exists in pool
    if (tenantConnectionPool.has(tenantId)) {
        const cachedConnection = tenantConnectionPool.get(tenantId);

        // Check if connection is still alive and ready
        if (cachedConnection.connection.readyState === 1) {
            try {
                // Ping the database to ensure connection is actually usable
                await cachedConnection.connection.db.admin().ping();
                console.log(`♻️ [TenantConnection] Reusing healthy connection for tenant: ${tenantId}`);
                // update last used timestamp
                cachedConnection.lastUsed = Date.now();
                return cachedConnection.connection;
            } catch (pingError) {
                console.warn(`⚠️ [TenantConnection] Stale connection detected for tenant ${tenantId}, removing from pool:`, pingError.message);
                tenantConnectionPool.delete(tenantId);
            }
        } else {
            // Remove stale connection
            console.log(`🔄 [TenantConnection] Removing stale connection for tenant: ${tenantId} (readyState: ${cachedConnection.connection.readyState})`);
            tenantConnectionPool.delete(tenantId);
        }
    }

    // Create new connection
    console.log(`🆕 [TenantConnection] Creating new connection for tenant: ${tenantId}`);

    // Validate MongoDB URI format
    if (!process.env.MONGODB_URI) {
        console.error('❌ [TenantConnection] MONGODB_URI environment variable is not set');
        throw new Error('Database configuration error: MONGODB_URI is missing');
    }

    const validation = validateMongoUri(process.env.MONGODB_URI);
    if (!validation.valid) {
        console.error('❌ [TenantConnection] Invalid MongoDB URI:', validation.errors);
        throw new Error(`Invalid MongoDB URI: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
        console.warn('⚠️ [TenantConnection] MongoDB URI warnings:', validation.warnings);
    }

    const { tenantUri, dbName, maskedUri } = createTenantUri(process.env.MONGODB_URI, tenantId);
    
    console.log(`📝 [TenantConnection] Database name: ${dbName}`);
    console.log(`🔗 [TenantConnection] Connection URI (masked): ${maskedUri}`);

    let connection;
    
    try {
        connection = mongoose.createConnection(tenantUri, {
            maxPoolSize: 10,
            minPoolSize: 2,
            socketTimeoutMS: 45000,
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            family: 4,
        });
        
        console.log(`🔌 [TenantConnection] Connection object created, waiting for connection...`);
    } catch (createError) {
        console.error(`❌ [TenantConnection] Failed to create connection object for tenant ${tenantId}:`, createError);
        throw new Error(`Failed to create database connection: ${createError.message}`);
    }

    // Wait for connection to be ready with proper error handling
    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout for tenant ${tenantId} - 'connected' event not received within 10s`));
            }, 10000);

            connection.once('connected', () => {
                console.log(`📡 [TenantConnection] 'connected' event received for tenant: ${tenantId}`);
                clearTimeout(timeout);
                resolve();
            });
            
            connection.once('error', (err) => {
                console.error(`❌ [TenantConnection] Connection error event for tenant ${tenantId}:`, err);
                clearTimeout(timeout);
                reject(err);
            });
        });
    } catch (connectError) {
        console.error(`❌ [TenantConnection] Failed to establish connection for tenant ${tenantId}:`, connectError);
        // Close the connection attempt
        try {
            await connection.close();
        } catch (closeError) {
            console.error(`⚠️ [TenantConnection] Error closing failed connection:`, closeError);
        }
        throw new Error(`Connection failed: ${connectError.message}`);
    }

    // Ensure connection is actually ready by waiting for 'open' event
    if (connection.readyState !== 1) {
        console.log(`⏳ [TenantConnection] Connection not fully open (readyState: ${connection.readyState}), waiting for 'open' event...`);
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Connection not ready for tenant ${tenantId} - 'open' event not received within 5s`));
                }, 5000);

                if (connection.readyState === 1) {
                    console.log(`✅ [TenantConnection] Connection already open`);
                    clearTimeout(timeout);
                    resolve();
                } else {
                    connection.once('open', () => {
                        console.log(`📂 [TenantConnection] 'open' event received for tenant: ${tenantId}`);
                        clearTimeout(timeout);
                        resolve();
                    });
                    connection.once('error', (err) => {
                        console.error(`❌ [TenantConnection] Error waiting for 'open' event:`, err);
                        clearTimeout(timeout);
                        reject(err);
                    });
                }
            });
        } catch (openError) {
            console.error(`❌ [TenantConnection] Connection failed to open for tenant ${tenantId}:`, openError);
            try {
                await connection.close();
            } catch (closeError) {
                console.error(`⚠️ [TenantConnection] Error closing failed connection:`, closeError);
            }
            throw new Error(`Connection open failed: ${openError.message}`);
        }
    }

    // Additional health check with ping
    try {
        console.log(`🏥 [TenantConnection] Performing health check ping...`);
        await connection.db.admin().ping();
        console.log(`✅ [TenantConnection] Health check passed for tenant: ${tenantId}`);
    } catch (pingError) {
        console.error(`❌ [TenantConnection] Health check failed for tenant ${tenantId}:`, pingError.message);
        await connection.close();
        throw new Error(`Health check failed for tenant ${tenantId}: ${pingError.message}`);
    }

    // Store in pool
    tenantConnectionPool.set(tenantId, {
        connection,
        createdAt: Date.now(),
        lastUsed: Date.now()
    });

    console.log(`💾 [TenantConnection] Connection stored in pool (pool size: ${tenantConnectionPool.size}/${MAX_POOL_SIZE})`);

    // Enforce pool size limit
    if (tenantConnectionPool.size > MAX_POOL_SIZE) {
        console.log(`⚠️ [TenantConnection] Pool size exceeded, cleaning up old connections...`);
        await cleanUpOldConnections();
    }

    console.log(`✅ [TenantConnection] Connection created successfully for tenant: ${tenantId}`);
    console.log(`   Database: ${dbName}`);
    console.log(`   ReadyState: ${connection.readyState}`);

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