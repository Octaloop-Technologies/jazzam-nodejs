import OSS from "ali-oss";
import fs from "fs";
import path from "path";

// Lazy initialization of OSS client
let client = null;

const getOSSClient = () => {
  if (!client) {
    // Validate required environment variables
    const requiredEnvVars = {
      OSS_REGION: process.env.OSS_REGION,
      OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID,
      OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET,
      OSS_BUCKET_NAME: process.env.OSS_BUCKET_NAME,
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required OSS environment variables: ${missingVars.join(", ")}`
      );
    }

    // Configure OSS client
    client = new OSS({
      region: process.env.OSS_REGION,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      bucket: process.env.OSS_BUCKET_NAME,
      secure: true, // Use HTTPS
    });
  }
  return client;
};

/**
 * Upload a file to Alibaba Cloud OSS
 * @param {string} localFilePath - Local path to the file to upload
 * @param {string} folder - Optional folder name in OSS bucket (default: 'uploads')
 * @returns {Promise<Object>} - Object containing url and public_id
 */
const uploadToOSS = async (localFilePath, folder = "uploads") => {
  try {
    if (!localFilePath) {
      throw new Error("Local file path is required");
    }

    // Check if file exists
    if (!fs.existsSync(localFilePath)) {
      throw new Error("File does not exist at the specified path");
    }

    // Generate unique filename
    const fileExtension = path.extname(localFilePath);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExtension}`;
    const objectKey = `${folder}/${fileName}`;

    // Upload file to OSS
    const result = await getOSSClient().put(objectKey, localFilePath);

    // Clean up local file after upload
    fs.unlinkSync(localFilePath);

    return {
      url: result.url,
      public_id: objectKey,
      name: result.name,
      res: result.res,
    };
  } catch (error) {
    // Clean up local file if upload fails
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    console.error("OSS Upload Error:", error);
    throw new Error(`Failed to upload file to OSS: ${error.message}`);
  }
};

/**
 * Delete a file from Alibaba Cloud OSS
 * @param {string} publicId - The object key (public_id) of the file to delete
 * @returns {Promise<Object>} - Delete result
 */
const deleteFromOSS = async (publicId) => {
  try {
    if (!publicId) {
      throw new Error("Public ID is required for deletion");
    }

    // Extract object key from URL if full URL is provided
    let objectKey = publicId;
    if (publicId.includes("://")) {
      const url = new URL(publicId);
      objectKey = url.pathname.substring(1); // Remove leading '/'
    }

    // Delete file from OSS
    const result = await getOSSClient().delete(objectKey);

    return {
      deleted: true,
      objectKey: objectKey,
      res: result.res,
    };
  } catch (error) {
    console.error("OSS Delete Error:", error);
    throw new Error(`Failed to delete file from OSS: ${error.message}`);
  }
};

/**
 * Generate a signed URL for temporary access to a private object
 * @param {string} objectKey - The object key in OSS
 * @param {number} expires - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} - Signed URL
 */
const generateSignedUrl = async (objectKey, expires = 3600) => {
  try {
    if (!objectKey) {
      throw new Error("Object key is required");
    }

    const url = await getOSSClient().signatureUrl(objectKey, {
      expires: expires,
      method: "GET",
    });

    return url;
  } catch (error) {
    console.error("OSS Signed URL Error:", error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Check if a file exists in OSS
 * @param {string} objectKey - The object key to check
 * @returns {Promise<boolean>} - Whether the file exists
 */
const fileExists = async (objectKey) => {
  try {
    if (!objectKey) {
      return false;
    }

    await getOSSClient().head(objectKey);
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    console.error("OSS File Exists Check Error:", error);
    throw new Error(`Failed to check file existence: ${error.message}`);
  }
};

/**
 * List objects in a specific folder
 * @param {string} folder - Folder prefix to list
 * @param {number} maxKeys - Maximum number of objects to return (default: 100)
 * @returns {Promise<Array>} - Array of object information
 */
const listObjects = async (folder = "", maxKeys = 100) => {
  try {
    const result = await getOSSClient().list({
      prefix: folder,
      "max-keys": maxKeys,
    });

    return result.objects || [];
  } catch (error) {
    console.error("OSS List Objects Error:", error);
    throw new Error(`Failed to list objects: ${error.message}`);
  }
};

export {
  uploadToOSS,
  deleteFromOSS,
  generateSignedUrl,
  fileExists,
  listObjects,
  getOSSClient,
};
