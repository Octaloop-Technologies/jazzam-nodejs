/**
 * Validate MongoDB URI format
 * Helps identify issues with connection strings
 */
export function validateMongoUri(uri) {
  const errors = [];
  const warnings = [];

  if (!uri) {
    errors.push('MongoDB URI is missing or empty');
    return { valid: false, errors, warnings };
  }

  // Check basic format
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    errors.push('URI must start with mongodb:// or mongodb+srv://');
  }

  // Check for credentials
  const hasCredentials = /@/.test(uri);
  if (!hasCredentials) {
    warnings.push('No credentials found in URI (may be intentional)');
  }

  // Check for database name
  const dbMatch = uri.match(/\/([^\/\?]+)(\?|$)/);
  if (dbMatch) {
    const dbName = dbMatch[1];
    console.log(`Database name in URI: ${dbName}`);
  } else {
    warnings.push('Could not parse database name from URI');
  }

  // Check for authSource
  if (!uri.includes('authSource=')) {
    warnings.push('authSource parameter not found (may be needed for authentication)');
  }

  // Check for common issues
  if (uri.includes(' ')) {
    errors.push('URI contains spaces (not allowed)');
  }

  if (uri.includes('\n') || uri.includes('\r')) {
    errors.push('URI contains newline characters');
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    hasCredentials,
    databaseName: dbMatch ? dbMatch[1] : null
  };
}

/**
 * Create tenant database URI from base URI
 */
export function createTenantUri(baseUri, tenantId) {
  if (!baseUri) {
    throw new Error('Base MongoDB URI is required');
  }

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const dbName = `jazzam_company_${tenantId}`;
  
  // Replace database name in URI
  const tenantUri = baseUri.replace(
    /\/([^\/\?]+)(\?|$)/,
    `/${dbName}$2`
  );

  return {
    tenantUri,
    dbName,
    maskedUri: tenantUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
  };
}

/**
 * Test MongoDB URI connection (without creating a persistent connection)
 */
export async function testMongoUri(uri) {
  const mongoose = (await import('mongoose')).default;
  
  console.log('🧪 Testing MongoDB URI...');
  
  const validation = validateMongoUri(uri);
  console.log('Validation:', validation);

  if (!validation.valid) {
    throw new Error(`Invalid MongoDB URI: ${validation.errors.join(', ')}`);
  }

  try {
    const testConn = await mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 6000);
      
      testConn.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      testConn.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await testConn.db.admin().ping();
    console.log('✅ Connection test successful');

    await testConn.close();
    
    return { success: true };
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return { success: false, error: error.message };
  }
}
