/**
 * Diagnostic script for tenant database connections
 * Run this to identify connection issues
 * 
 * Usage:
 *   node src/utils/diagnose.js                    - Test all companies
 *   node src/utils/diagnose.js <companyId>        - Test specific company
 *   node src/utils/diagnose.js uri                - Test MongoDB URI only
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

async function diagnoseSystem() {
  console.log('\n🔍 ===== SYSTEM DIAGNOSTICS =====\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`  PORT: ${process.env.PORT || 'not set'}`);
  console.log(`  MONGODB_URI: ${process.env.MONGODB_URI ? '✅ set' : '❌ not set'}`);
  
  if (process.env.MONGODB_URI) {
    const maskedUri = process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`  MONGODB_URI (masked): ${maskedUri}`);
  }

  console.log('\n');

  // Test MongoDB URI
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set. Please check your .env file.');
    return false;
  }

  const { validateMongoUri, testMongoUri } = await import('./validateMongoUri.js');
  
  console.log('🧪 Validating MongoDB URI format...');
  const validation = validateMongoUri(process.env.MONGODB_URI);
  
  if (!validation.valid) {
    console.error('❌ Invalid MongoDB URI:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }
  
  console.log('✅ MongoDB URI format is valid');
  
  if (validation.warnings.length > 0) {
    console.warn('⚠️ Warnings:');
    validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
  }

  console.log(`  Database name: ${validation.databaseName}`);
  console.log(`  Has credentials: ${validation.hasCredentials ? 'Yes' : 'No'}`);

  console.log('\n🔌 Testing main database connection...');
  const mainDbTest = await testMongoUri(process.env.MONGODB_URI);
  
  if (!mainDbTest.success) {
    console.error('❌ Failed to connect to main database:', mainDbTest.error);
    return false;
  }

  console.log('✅ Main database connection successful');
  
  return true;
}

async function diagnoseCompany(companyId) {
  console.log(`\n🏢 Testing company: ${companyId}\n`);

  const { testTenantConnection } = await import('./testTenantConnection.js');
  const result = await testTenantConnection(companyId);

  return result.success;
}

async function diagnoseAllCompanies() {
  console.log('\n🏢 Testing all companies...\n');

  const { testAllTenantConnections } = await import('./testTenantConnection.js');
  const results = await testAllTenantConnections();

  const failed = results.filter(r => !r.success);
  return failed.length === 0;
}

async function main() {
  try {
    const command = process.argv[2];

    // Always run system diagnostics first
    const systemOk = await diagnoseSystem();

    if (!systemOk) {
      console.error('\n❌ System diagnostics failed. Please fix the issues above.\n');
      process.exit(1);
    }

    console.log('\n✅ System diagnostics passed\n');

    // Connect to main database
    console.log('🔌 Connecting to main database...');
    const connectDB = (await import('../db/index.js')).default;
    await connectDB();
    console.log('✅ Connected to main database\n');

    if (!command || command === 'all') {
      // Test all companies
      const success = await diagnoseAllCompanies();
      
      await cleanup();
      process.exit(success ? 0 : 1);
    } else if (command === 'uri') {
      // Only test URI (already done in system diagnostics)
      await cleanup();
      process.exit(0);
    } else {
      // Test specific company
      const success = await diagnoseCompany(command);
      
      await cleanup();
      process.exit(success ? 0 : 1);
    }

  } catch (error) {
    console.error('\n❌ Diagnostic failed with error:', error.message);
    console.error('Stack trace:', error.stack);
    
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up connections...');
  
  try {
    const { closeAllTenantConnections } = await import('../db/tenantConnection.js');
    await closeAllTenantConnections();
    await mongoose.connection.close();
    console.log('✅ All connections closed');
  } catch (error) {
    console.error('⚠️ Error during cleanup:', error.message);
  }
}

// Run diagnostics
main();
