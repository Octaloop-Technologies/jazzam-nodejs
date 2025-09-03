import mongoose from "mongoose";
import { DB_NAME } from "../constants/website.constants.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    console.log(
      `--------------------------\nMongoDB Connected !! DB HOST: ${conn.connection.host}`
    );
  } catch (err) {
    console.error("MONGODB connection FAILED", err);
    process.exit(1);
  }
};

export default connectDB;
