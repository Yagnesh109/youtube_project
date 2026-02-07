import mongoose from "mongoose";

const userschema = new mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  phone: { type: String }, // <--- Added Phone Field
  isOTPVerified: { type: Boolean, default: false }, // OTP verification status
  plan: { 
    type: String, 
    enum: ["Free", "Bronze", "Silver", "Gold"], 
    default: "Free" 
  },
  isPremium: { type: Boolean, default: false },
  downloadsToday: { type: Number, default: 0 },
  lastDownloadDate: { type: Date, default: null },
  downloadedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: "videofiles" }],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
