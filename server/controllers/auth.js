import users from "../Modals/Auth.js";
import mongoose from "mongoose";
import OTP from "../Modals/OTP.js";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken"; // Ensure you have: npm install jsonwebtoken
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Create transporter function (lazy initialization)
const getTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  const hasHost = !!process.env.EMAIL_HOST;
  const port = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined;
  const secure =
    process.env.EMAIL_SECURE !== undefined
      ? String(process.env.EMAIL_SECURE).toLowerCase() === "true"
      : port === 465;

  const baseConfig = {
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  };

  if (hasHost) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: port || 587,
      secure,
      ...baseConfig,
    });
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    ...baseConfig,
  });
};

export const googleAuth = async (req, res) => {
  const { email, name, image } = req.body;
  try {
    let user = await users.findOne({ email });
    if (!user) {
      // Create new user from Google data
      user = await users.create({ 
          email, 
          name, 
          image, 
          fromGoogle: true,
          plan: "Free",
          isPremium: false 
      });
    }
    // Return user info, but NO TOKEN yet. Token comes after OTP.
    res.status(200).json({ result: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Google Auth Failed" });
  }
};

export const login = async (req, res) => {
  const { email, name, image } = req.body;
  try {
    const existinguser = await users.findOne({ email: email });
    if (!existinguser) {
      const newuser = await users.create({ email, name, image });
      res.status(200).json({ result: newuser });
    } else {
      res.status(200).json({ result: existinguser });
    }
  } catch (err) {
    res.status(500).json({ message: "Database connection failed" });
  }
};

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description } = req.body;
  
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }
  
  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      { $set: { channelname: channelname, description: description } },
      { new: true }
    );
    res.status(200).json(updatedata);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const downloadVideo = async (req, res) => {
  const { userId, videoId } = req.body;

  try {
    const user = await users.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.downloadedVideos = Array.isArray(user.downloadedVideos) ? user.downloadedVideos : [];
    user.downloadsToday = typeof user.downloadsToday === "number" ? user.downloadsToday : 0;
    user.isPremium = typeof user.isPremium === "boolean" ? user.isPremium : false;

    // 1. Premium User: Unlimited
    if (user.isPremium) {
      const alreadyDownloaded = user.downloadedVideos.some((id) => id?.toString?.() === videoId);
      if (!alreadyDownloaded) {
        user.downloadedVideos.push(videoId);
        await user.save();
      }
      return res.status(200).json({ allowed: true, message: "Download started (Premium)" });
    }

    // 2. Free User: 1 per day
    const today = new Date();
    const lastDate = new Date(user.lastDownloadDate || 0); 
    
    // Check if it's a new day
    const isNewDay = today.toDateString() !== lastDate.toDateString();

    if (isNewDay) {
      user.downloadsToday = 0;
      user.lastDownloadDate = today;
    }

    if (user.downloadsToday >= 1) {
      return res.status(403).json({ 
        allowed: false, 
        message: "Daily download limit reached. Upgrade to Premium." 
      });
    }

    // Increment count
    user.downloadsToday += 1;
    user.lastDownloadDate = today;

    const alreadyDownloaded = user.downloadedVideos.some((id) => id?.toString?.() === videoId);
    if (!alreadyDownloaded) {
      user.downloadedVideos.push(videoId);
    }
    
    await user.save();
    return res.status(200).json({ allowed: true, message: "Download started" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getUserDownloads = async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await users.findById(userId).populate("downloadedVideos");
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json(user.downloadedVideos);
    } catch (error) {
        res.status(500).json({ message: "Error fetching downloads" });
    }
};

// Public user info for call popup
export const getPublicUser = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }
  try {
    const user = await users.findById(id).select("name channelname email image");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// 🔹 OTP Logic
export const sendOTP = async (req, res) => {
  const { email, phone, type } = req.body; 
  
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  
  if (type === 'mobile' && !phone) {
    return res.status(400).json({ message: "Phone number is required for mobile OTP" });
  }
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const identifier = type === 'email' ? email : phone;

  try {
    // Clean up old OTPs for this identifier
    await OTP.deleteMany({ identifier });
    await OTP.create({ identifier, otp });

    if (type === 'email') {
      // Debug: Check if credentials are loaded
      console.log("📧 Email Config Check:");
      console.log("EMAIL_USER:", process.env.EMAIL_USER ? `✅ ${process.env.EMAIL_USER}` : "❌ Missing");
      console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "✅ Set (hidden)" : "❌ Missing");
      
      // Development mode: If email not configured, log OTP to console
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log("=".repeat(60));
        console.log("📧 EMAIL OTP (Development Mode - Email not configured)");
        console.log("=".repeat(60));
        console.log(`To: ${email}`);
        console.log(`OTP: ${otp}`);
        console.log("=".repeat(60));
        console.log("⚠️  In production, configure EMAIL_USER and EMAIL_PASS in .env");
        console.log("=".repeat(60));
        // Still return success so testing can continue
        return res.status(200).json({ 
          message: "OTP Sent Successfully (Check server console for OTP)",
          debugOTP: process.env.NODE_ENV === 'development' ? otp : undefined // Only in dev mode
        });
      }
      
      try {
        const transporter = getTransporter();
        if (!transporter) {
          throw new Error("Email transporter not configured");
        }
        
        console.log(`📤 Attempting to send email to ${email}...`);
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: email,
          subject: "Verify your Login",
          text: `Your Verification OTP is ${otp}.`
        });
        console.log(`✅ Email OTP sent successfully to ${email}`);
      } catch (emailError) {
        console.error("❌ Email sending failed:", emailError.message);
        // Fallback: Log OTP for development
        console.log("=".repeat(60));
        console.log("📧 EMAIL OTP (Fallback - Email sending failed)");
        console.log(`To: ${email}`);
        console.log(`OTP: ${otp}`);
        console.log("=".repeat(60));
        return res.status(200).json({ 
          message: "OTP Generated (Check server console - Email sending failed)",
          debugOTP: process.env.NODE_ENV === 'development' ? otp : undefined
        });
      }
  } else {
      // For mobile OTP, return OTP in response (UI will show it for 30 seconds)
      const toNumber = String(phone || "").trim();
      if (!toNumber) {
        return res.status(400).json({ message: "Invalid phone number" });
      }
    }

    const responsePayload = { message: "OTP Sent Successfully" };
    if (type === "mobile") {
      responsePayload.otp = otp;
      responsePayload.expiresInSeconds = 30;
    }
    res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({ message: "Failed to send OTP" });
  }
};

export const verifyOTP = async (req, res) => {
  const { email, phone, otp, type } = req.body;
  const identifier = type === 'email' ? email : phone;

  try {
    const record = await OTP.findOne({ identifier, otp });
    if (!record) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    const ageMs = Date.now() - new Date(record.createdAt).getTime();
    if (ageMs > 30 * 1000) {
      await OTP.deleteOne({ _id: record._id });
      return res.status(400).json({ message: "OTP expired" });
    }

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Update user with phone if mobile OTP, and mark as verified
    if (type === 'mobile' && phone) {
        user.phone = phone; 
    }
    user.isOTPVerified = true;
    await user.save();

    await OTP.deleteOne({ _id: record._id });

    // 🔹 Generate JWT Token (Important for keeping user logged in)
    const token = jwt.sign(
        { email: user.email, id: user._id }, 
        process.env.JWT_SECRET || "test", 
        { expiresIn: "1h" }
    );

    res.status(200).json({ result: user, token, message: "Verification Successful" });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ message: "Verification Error" });
  }
};
