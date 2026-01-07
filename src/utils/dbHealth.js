import mongoose from "mongoose";
import { getConnectionPoolStats } from "../db/tenantConnection.js";

/**
 * Check health of all database connections
 */
export const checkDatabaseHealth = async () => {
  const health = {
    mainDatabase: {
      status: "unknown",
      readyState: mongoose.connection.readyState,
      readyStateText: getReadyStateText(mongoose.connection.readyState),
      host: mongoose.connection.host,
      name: mongoose.connection.name,
    },
    tenantConnections: null,
    timestamp: new Date().toISOString(),
  };

  // Check main database
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      health.mainDatabase.status = "healthy";
    } else {
      health.mainDatabase.status = "not_connected";
    }
  } catch (error) {
    health.mainDatabase.status = "unhealthy";
    health.mainDatabase.error = error.message;
  }

  // Get tenant connection pool stats
  try {
    health.tenantConnections = getConnectionPoolStats();
  } catch (error) {
    health.tenantConnections = { error: error.message };
  }

  return health;
};

/**
 * Convert mongoose readyState number to text
 */
function getReadyStateText(state) {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
    99: "uninitialized",
  };
  return states[state] || "unknown";
}

/**
 * Wait for main database to be ready
 */
export const waitForDatabaseReady = async (timeoutMs = 10000) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.db.admin().ping();
        return true;
      } catch (error) {
        // Connection exists but not responding
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Database not ready after ${timeoutMs}ms`);
};
