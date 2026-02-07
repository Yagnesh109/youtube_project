import express from "express";
import { 
  googleAuth, // <--- Ensure this is imported
  login, 
  updateprofile, 
  downloadVideo, 
  getUserDownloads, 
  getPublicUser,
  sendOTP, 
  verifyOTP 
} from "../controllers/auth.js";

const routes = express.Router();

// 1. Google Auth Route (Fixes the "Sign in with Google" failure)
routes.post("/google", googleAuth);

// 2. OTP Verification Routes
routes.post("/send-otp", sendOTP);
routes.post("/verify-otp", verifyOTP);

// 3. Existing Routes
routes.post("/login", login);
routes.patch("/update/:id", updateprofile);
routes.post("/download", downloadVideo);
routes.get("/downloads/:userId", getUserDownloads);
routes.get("/public/:id", getPublicUser);

export default routes;
