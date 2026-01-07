import mongoose from "mongoose";
import { DB_NAME } from "../constants/website.constants.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      `${process.env.MONGODB_URI}`,
      {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      }
    );
    
    // Wait for connection to be fully ready
    await new Promise((resolve, reject) => {
      if (mongoose.connection.readyState === 1) {
        resolve();
      } else {
        mongoose.connection.once('open', resolve);
        mongoose.connection.once('error', reject);
      }
    });

    // Verify connection with ping
    await mongoose.connection.db.admin().ping();
    
    console.log(
      `--------------------------\n✅ MongoDB Connected !! DB HOST: ${conn.connection.host}\n✅ Connection ReadyState: ${mongoose.connection.readyState}`
    );
  } catch (err) {
    console.error("❌ MONGODB connection FAILED", err);
    process.exit(1);
  }
};

export default connectDB;
