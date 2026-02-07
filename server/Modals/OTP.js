import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  identifier: { type: String, required: true }, // Email or Mobile Number
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 30 } // Expires in 30 seconds
});

export default mongoose.model("OTP", otpSchema);
