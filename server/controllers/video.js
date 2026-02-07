import video from "../Modals/video.js";
import User from "../Modals/Auth.js";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getVideosByUser = async (req, res) => {
  const { userId } = req.params;
  
  console.log("Getting videos for user:", userId);
  
  try {
    const videos = await video.find({ uploader: userId }).sort({ createdAt: -1 });
    console.log("User videos found:", videos.length);
    return res.status(200).json(videos);
  } catch (error) {
    console.error("Get user videos error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const searchVideos = async (req, res) => {
  const { q } = req.query;
  
  console.log("Search query:", q);
  
  try {
    const videos = await video.find({
      $or: [
        { videotitle: { $regex: q, $options: "i" } },
        { videochanel: { $regex: q, $options: "i" } },
        { uploader: { $regex: q, $options: "i" } }
      ]
    });
    
    console.log("Search results:", videos);
    return res.status(200).json(videos);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const uploadvideo = async (req, res) => {
  if (req.file === undefined) {
    return res.status(404).json({ message: "Upload a MP4 video file only" });
  } else {
    try {
      const file = new video({
        videotitle: req.body.videotitle,
        filename: req.file.originalname,
        filepath: req.file.path,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        videochanel: req.body.videochanel,
        uploader: req.body.uploader,
      });
      await file.save();
      res.status(201).json(file);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: error.message });
    }
  }
};

export const getallvideo = async (req, res) => {
  try {
    const files = await video.find().lean();
    
    // Map uploader to userid for frontend consistency
    // Also populate user data if uploader is a valid ObjectId
    const videosWithUserid = await Promise.all(files.map(async (v) => {
      // Skip if uploader is undefined, null, or the string "undefined"
      if (v.uploader && v.uploader !== 'undefined' && v.uploader !== 'null') {
        try {
          // Validate it's a proper ObjectId before querying
          if (mongoose.Types.ObjectId.isValid(v.uploader)) {
            // Try to find and populate user data
            const user = await User.findById(v.uploader);
            if (user) {
              return { 
                ...v, 
                userid: {
                  _id: user._id.toString(),
                  name: user.name,
                  channelname: user.channelname,
                  image: user.image,
                  email: user.email
                },
                uploader: v.uploader // Keep original for backward compatibility
              };
            }
          }
        } catch (err) {
          console.log("Error populating user for video:", v._id, err);
        }
      }
      // If no user found or uploader is invalid/missing, return video without userid
      return { 
        ...v, 
        userid: null,
        uploader: (v.uploader && v.uploader !== 'undefined' && v.uploader !== 'null') ? v.uploader : null
      };
    }));
    
    return res.status(200).send(videosWithUserid);
  } catch (error) {
    console.log("Get all videos error", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const downloadVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1. Check User Permissions (Premium vs Free)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    const lastDate = user.lastDownloadDate ? new Date(user.lastDownloadDate) : null;
    const isNewDay = !lastDate || now.toDateString() !== lastDate.toDateString();

    if (isNewDay) {
      user.downloadsToday = 0;
      user.lastDownloadDate = now;
    }

    if (!user.isPremium && (user.downloadsToday || 0) >= 1) {
      return res.status(403).json({ message: "Daily limit reached. Upgrade to Premium." });
    }

    // 2. Find Video Metadata
    const videoDoc = await video.findById(videoId);
    if (!videoDoc) return res.status(404).json({ message: "Video not found" });

    // 3. Increment Download Count for User
    user.downloadsToday = (user.downloadsToday || 0) + 1;
    const alreadyDownloaded = Array.isArray(user.downloadedVideos)
      ? user.downloadedVideos.some((id) => id?.toString?.() === videoId)
      : false;

    if (!alreadyDownloaded) {
      user.downloadedVideos = Array.isArray(user.downloadedVideos) ? user.downloadedVideos : [];
      user.downloadedVideos.push(videoDoc._id);
    }
    await user.save();

    // 4. Send the File
    if (typeof videoDoc.filepath === "string" && videoDoc.filepath.startsWith("http")) {
      return res.status(200).json({
        downloadUrl: videoDoc.filepath,
        message: "Download approved",
      });
    }

    const relativePath = typeof videoDoc.filepath === "string" ? videoDoc.filepath : "";
    const absolutePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(__dirname, "..", relativePath);

    if (relativePath && fs.existsSync(absolutePath)) {
      const safeName = `${videoDoc.videotitle || "video"}.mp4`;
      return res.download(absolutePath, safeName);
    }

    return res.status(404).json({ message: "Video file not found" });

  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
};

export const getDownloadedVideos = async (req, res) => {
  try {
    // req.user.id comes from verifyToken middleware
    const userId = req.user.id;
    
    // Find user and populate the 'downloadedVideos' field to get full video details
    const userDoc = await User.findById(userId).populate("downloadedVideos");
    
    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return the list of video objects
    res.status(200).json(userDoc.downloadedVideos);
  } catch (error) {
    console.error("Fetch downloads error:", error);
    res.status(500).json({ message: "Failed to fetch downloaded videos" });
  }
};