/**
 * Quick Test Script for Database Connection Fixes
 * 
 * Run this after starting your server to verify connections are working
 * Usage: node src/test/connection-test.js
 */

import mongoose from "mongoose";
import { getTenantConnection, getConnectionPoolStats } from "../db/tenantConnection.js";
import { checkDatabaseHealth } from "../utils/dbHealth.js";

const TEST_COMPANY_ID = "695e0ff978418fed16bdb8d2"; // Replace with a real company ID from your DB

async function runTests() {
  console.log("\n🧪 Starting Connection Tests...\n");
  console.log("=" .repeat(60));

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Main Database Connection
  console.log("\n📝 Test 1: Main Database Connection");
  console.log("-" .repeat(60));
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`Main DB not connected. ReadyState: ${mongoose.connection.readyState}`);
    }
    await mongoose.connection.db.admin().ping();
    console.log("✅ PASSED: Main database is connected and responsive");
    passedTests++;
  } catch (error) {
    console.log("❌ FAILED:", error.message);
    failedTests++;
  }

  // Test 2: Tenant Connection Creation
  console.log("\n📝 Test 2: Tenant Connection Creation");
  console.log("-" .repeat(60));
  try {
    console.log(`Creating connection for tenant: ${TEST_COMPANY_ID}...`);
    const startTime = Date.now();
    const connection = await getTenantConnection(TEST_COMPANY_ID);
    const duration = Date.now() - startTime;
    
    if (connection.readyState !== 1) {
      throw new Error(`Tenant connection not ready. ReadyState: ${connection.readyState}`);
    }
    
    await connection.db.admin().ping();
    console.log(`✅ PASSED: Tenant connection created and verified (${duration}ms)`);
    console.log(`   DB Name: ${connection.name}`);
    passedTests++;
  } catch (error) {
    console.log("❌ FAILED:", error.message);
    failedTests++;
  }

  // Test 3: Connection Reuse
  console.log("\n📝 Test 3: Connection Reuse (Should be fast)");
  console.log("-" .repeat(60));
  try {
    const startTime = Date.now();
    const connection = await getTenantConnection(TEST_COMPANY_ID);
    const duration = Date.now() - startTime;
    
    if (duration > 100) {
      console.log(`⚠️  WARNING: Reuse took ${duration}ms (expected < 100ms)`);
    }
    
    console.log(`✅ PASSED: Connection reused from pool (${duration}ms)`);
    passedTests++;
  } catch (error) {
    console.log("❌ FAILED:", error.message);
    failedTests++;
  }

  // Test 4: Connection Pool Stats
  console.log("\n📝 Test 4: Connection Pool Statistics");
  console.log("-" .repeat(60));
  try {
    const stats = getConnectionPoolStats();
    console.log(`✅ PASSED: Pool stats retrieved`);
    console.log(`   Active Connections: ${stats.activeConnections}`);
    console.log(`   Max Pool Size: ${stats.maxPoolSize}`);
    if (stats.connections.length > 0) {
      console.log(`   First Connection:`);
      console.log(`     - Tenant: ${stats.connections[0].tenantId}`);
      console.log(`     - Ready State: ${stats.connections[0].readyState}`);
      console.log(`     - Idle Time: ${Math.round(stats.connections[0].idleTime / 1000)}s`);
    }
    passedTests++;
  } catch (error) {
    console.log("❌ FAILED:", error.message);
    failedTests++;
  }

  // Test 5: Health Check System
  console.log("\n📝 Test 5: Health Check System");
  console.log("-" .repeat(60));
  try {
    const health = await checkDatabaseHealth();
    
    if (health.mainDatabase.status !== "healthy") {
      throw new Error(`Main DB unhealthy: ${health.mainDatabase.status}`);
    }
    
    console.log("✅ PASSED: Health check system working");
    console.log(`   Main DB: ${health.mainDatabase.status}`);
    console.log(`   Tenant Connections: ${health.tenantConnections.activeConnections}`);
    passedTests++;
  } catch (error) {
    console.log("❌ FAILED:", error.message);
    failedTests++;
  }

  // Test 6: Model Creation with Connection Validation
  console.log("\n📝 Test 6: Model Creation and Query");
  console.log("-" .repeat(60));
  try {
    const connection = await getTenantConnection(TEST_COMPANY_ID);
    const { getTenantModels } = await import("../models/index.js");
    const { Lead } = getTenantModels(connection);
    
    // Try a simple query
    const count = await Lead.countDocuments();
    console.log(`✅ PASSED: Model created and queried successfully`);
    console.log(`   Leads in database: ${count}`);
    passedTests++;
  } catch (error) {
    console.log("❌ FAILED:", error.message);
    failedTests++;
  }

  // Summary
  console.log("\n" + "=" .repeat(60));
  console.log("\n📊 TEST SUMMARY");
  console.log("-" .repeat(60));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  
  const allPassed = failedTests === 0;
  console.log("\n" + "=" .repeat(60));
  
  if (allPassed) {
    console.log("\n🎉 All tests passed! Connection system is working correctly.");
    console.log("✅ Ready for deployment!");
  } else {
    console.log("\n⚠️  Some tests failed. Please review the errors above.");
    console.log("❌ Fix issues before deploying to production.");
  }
  
  console.log("\n");
  
  process.exit(allPassed ? 0 : 1);
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  // Connect to database first
  console.log("Connecting to database...");
  const connectDB = (await import("../db/index.js")).default;
  
  await connectDB();
  console.log("✅ Connected to database\n");
  
  await runTests();
}

export { runTests };
