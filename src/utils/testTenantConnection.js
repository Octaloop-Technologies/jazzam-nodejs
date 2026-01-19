import mongoose from "mongoose";
import { getTenantConnection } from "../db/tenantConnection.js";
import { Company } from "../models/company.model.js";

/**
 * Test tenant connection for a specific company
 * This utility helps debug connection issues
 */
export async function testTenantConnection(tenantId) {
  console.log('\n🧪 ===== TENANT CONNECTION TEST =====');
  console.log(`Testing connection for tenant: ${tenantId}`);
  console.log('=====================================\n');

  try {
    // Step 1: Verify company exists
    console.log('Step 1: Verifying company exists in system database...');
    const company = await Company.findById(tenantId);
    
    if (!company) {
      throw new Error(`❌ Company with ID ${tenantId} not found in system database`);
    }
    
    console.log(`✅ Company found: ${company.companyName} (${company.email})`);
    console.log(`   User Type: ${company.userType}`);
    console.log(`   Active: ${company.isActive}`);

    // Step 2: Test tenant connection
    console.log('\nStep 2: Creating tenant database connection...');
    const tenantConnection = await getTenantConnection(tenantId);
    
    console.log(`✅ Tenant connection created successfully`);
    console.log(`   Database name: jazzam_company_${tenantId}`);
    console.log(`   Connection readyState: ${tenantConnection.readyState}`);
    console.log(`   Connection host: ${tenantConnection.host}`);

    // Step 3: Test database operations
    console.log('\nStep 3: Testing database operations...');
    
    // Test ping
    await tenantConnection.db.admin().ping();
    console.log('✅ Database ping successful');

    // Test listing collections
    const collections = await tenantConnection.db.listCollections().toArray();
    console.log(`✅ Collections in tenant database: ${collections.length}`);
    collections.forEach(col => console.log(`   - ${col.name}`));

    // Step 4: Test model creation
    console.log('\nStep 4: Testing model creation...');
    const { getTenantModels } = await import('../models/index.js');
    const models = getTenantModels(tenantConnection);
    console.log('✅ Tenant models created successfully');
    console.log(`   Available models: ${Object.keys(models).join(', ')}`);

    console.log('\n✅ ===== ALL TESTS PASSED =====\n');
    return {
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        email: company.email,
        userType: company.userType
      },
      connection: {
        database: `jazzam_company_${tenantId}`,
        readyState: tenantConnection.readyState,
        host: tenantConnection.host,
        collections: collections.length
      }
    };

  } catch (error) {
    console.error('\n❌ ===== TEST FAILED =====');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('==========================\n');
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Test connection for all active companies
 */
export async function testAllTenantConnections() {
  console.log('\n🧪 ===== TESTING ALL TENANT CONNECTIONS =====\n');

  try {
    const companies = await Company.find({ 
      userType: { $in: ['company', 'admin'] },
      isActive: true 
    }).select('_id companyName email userType');

    console.log(`Found ${companies.length} active companies to test\n`);

    const results = [];

    for (const company of companies) {
      console.log(`\nTesting: ${company.companyName} (${company._id})`);
      console.log('─'.repeat(50));
      
      const result = await testTenantConnection(company._id.toString());
      results.push({
        companyId: company._id,
        companyName: company.companyName,
        ...result
      });

      // Wait a bit between tests to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('\n📊 ===== TEST SUMMARY =====');
    console.log(`Total companies tested: ${results.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed companies:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.companyName} (${r.companyId}): ${r.error}`);
      });
    }

    console.log('===========================\n');

    return results;

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    throw error;
  }
}

// If running this file directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting tenant connection tests...\n');
  
  // Connect to main database first
  const connectDB = (await import('../db/index.js')).default;
  await connectDB();

  // Get tenant ID from command line or test all
  const tenantId = process.argv[2];

  if (tenantId) {
    await testTenantConnection(tenantId);
  } else {
    await testAllTenantConnections();
  }

  // Close connections
  await mongoose.connection.close();
  const { closeAllTenantConnections } = await import('../db/tenantConnection.js');
  await closeAllTenantConnections();

  process.exit(0);
}
