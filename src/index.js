import dotenv from "dotenv";
import mongoose from "mongoose";
import { server } from "./app.js";
import connectDB from "./db/index.js";
import { closeAllTenantConnections } from "./db/tenantConnection.js";

dotenv.config({ path: ".env" });

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop accepting new requests
    server.close(async () => {
      console.log('HTTP server closed');
      
      // Close all tenant connections
      await closeAllTenantConnections();
      
      // Close main database connection
      await mongoose.connection.close();
      console.log('Main database connection closed');
      
      console.log('Graceful shutdown completed');
      process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

connectDB()
  .then(() => {
    const port = process.env.PORT || 4000;
    server.listen(port, async () => {
      console.log("===================================");
      console.log("✅ Server starting...");
      console.log("✅ MONGODB connected Successfully !!!");
      console.log("===================================");
      console.log(
        `🚀 Server running on port ${port}\n📡 http://localhost:${port}\n`
      );

      // Warm up tenant connections after server starts (don't await to not block)
      setTimeout(async () => {
        try {
          const { warmUpConnections, scheduleConnectionWarmup } = await import("./utils/connectionWarmer.js");
          await warmUpConnections();
          
          // Schedule periodic warmup in production
          if (process.env.NODE_ENV === "production") {
            scheduleConnectionWarmup(60); // Every 60 minutes
          }
        } catch (error) {
          console.error("Connection warmup error (non-critical):", error.message);
        }
      }, 5000); // Start warmup 5 seconds after server is ready
    });
  })
  .catch((err) => {
    console.log("❌ MONGODB connection Failed !!!", err);
    process.exit(1);
  });
