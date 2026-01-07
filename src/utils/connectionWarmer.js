import { Company } from "../models/company.model.js";
import { getTenantConnection } from "../db/tenantConnection.js";

/**
 * Warm up connections for active companies
 * This should be called after server startup to pre-establish connections
 */
export const warmUpConnections = async () => {
  try {
    console.log("🔥 Starting connection warmup...");

    // Get all active companies
    const activeCompanies = await Company.find({
      userType: "company",
      isActive: true,
    })
      .select("_id email")
      .limit(20); // Limit to avoid overwhelming the connection pool

    if (!activeCompanies || activeCompanies.length === 0) {
      console.log("⚠️  No active companies found for connection warmup");
      return;
    }

    console.log(`🔥 Warming up connections for ${activeCompanies.length} active companies...`);

    // Pre-establish connections in parallel (with concurrency limit)
    const concurrency = 5;
    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < activeCompanies.length; i += concurrency) {
      const batch = activeCompanies.slice(i, i + concurrency);

      await Promise.allSettled(
        batch.map(async (company) => {
          try {
            const connection = await getTenantConnection(company._id.toString());
            if (connection.readyState === 1) {
              results.success++;
              console.log(`✅ Warmed up connection for company: ${company._id}`);
            } else {
              results.failed++;
              console.warn(`⚠️  Connection not ready for company: ${company._id}`);
            }
          } catch (error) {
            results.failed++;
            results.errors.push({
              companyId: company._id,
              error: error.message,
            });
            console.error(`❌ Failed to warm up connection for company ${company._id}:`, error.message);
          }
        })
      );
    }

    console.log(`🔥 Connection warmup completed:`);
    console.log(`   ✅ Success: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);

    return results;
  } catch (error) {
    console.error("❌ Connection warmup failed:", error);
    // Don't throw - warmup failure shouldn't crash the app
    return null;
  }
};

/**
 * Schedule periodic connection warmup
 * Helps maintain healthy connections in long-running processes
 */
export const scheduleConnectionWarmup = (intervalMinutes = 60) => {
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`⏰ Scheduling connection warmup every ${intervalMinutes} minutes`);

  setInterval(async () => {
    console.log("⏰ Running scheduled connection warmup...");
    await warmUpConnections();
  }, intervalMs);
};
