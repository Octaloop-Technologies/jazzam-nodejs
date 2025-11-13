import dotenv from "dotenv";
import { server } from "./app.js";
import connectDB from "./db/index.js";

dotenv.config({ path: ".env" });

connectDB()
  .then(() => {
    server.listen(process.env.PORT || 4000, () => {
      console.log("this is server starting...");
      console.log("MONGODB connected Successfully !!!");
      console.log("===================================");
      console.log(
        `Server running on port ************ http://localhost:${process.env.PORT || 4001}\n`
      );
    });
  })
  .catch((err) => {
    console.log("MONGODB connection Failed !!!", err);
  });
