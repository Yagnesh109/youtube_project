// Simple connection test
import dotenv from "dotenv";

dotenv.config();

const DB_URL = process.env.DB_URL;

console.log("Testing MongoDB connection...");
if (!DB_URL) {
  console.log("❌ Missing DB_URL in environment. Set it in your .env file.");
  process.exit(1);
}

console.log("Connection URL:", DB_URL.replace(/:([^@]+)@/, ':***@')); // Hide password

import('mongoose').then(({ default: mongoose }) => {
  mongoose.connect(DB_URL)
    .then(() => {
      console.log("✅ SUCCESS: Connected to MongoDB!");
      
      // List all databases
      return mongoose.connection.db.admin().listDatabases();
    })
    .then(result => {
      console.log("📊 Available databases:");
      result.databases.forEach(db => {
        console.log(`  - ${db.name}`);
      });
    })
    .catch(err => {
      console.log("❌ FAILED: Connection error");
      console.log("Error:", err.message);
    })
    .finally(() => {
      process.exit(0);
    });
});
