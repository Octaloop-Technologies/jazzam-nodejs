import dotenv from "dotenv";
import { app } from "./app.js";
import connectDB from "./db/index.js";

dotenv.config({ path: ".env" });

connectDB()
  .then(() => {
    app.listen(process.env.PORT || 4000, () => {
      console.log(
        `Server running on port http://localhost:${process.env.PORT || 4000}\n`
      );
    });
  })
  .catch((err) => {
    console.log("MONGODB connection Failed !!!", err);
  });
