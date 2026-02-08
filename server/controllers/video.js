import video from "../Modals/video.js";
import User from "../Modals/Auth.js";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return res.status(500).json({ message: "Cloudinary is not configured" });
      }

      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: process.env.CLOUDINARY_FOLDER || "youtube-clone",
      });

      // Clean up the temp file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn("Failed to delete temp upload:", cleanupError.message);
      }

      const file = new video({
        videotitle: req.body.videotitle,
        filename: req.file.originalname,
        filepath: uploadResult.secure_url,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        cloudinaryId: uploadResult.public_id,
        videochanel: req.body.videochanel,
        uploader: req.body.uploader,
      });
      await file.save();
      res.status(201).json(file);
    } catch (error) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // best-effort cleanup
        }
      }
      console.error("Upload error:", error);
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
      let downloadUrl = videoDoc.filepath;
      if (downloadUrl.includes("res.cloudinary.com") && downloadUrl.includes("/upload/")) {
        // Force attachment download on Cloudinary
        downloadUrl = downloadUrl.replace("/upload/", "/upload/fl_attachment/");
      }

      return res.status(200).json({
        downloadUrl,
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

export const streamVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const videoDoc = await video.findById(videoId);
    if (!videoDoc) return res.status(404).json({ message: "Video not found" });

    if (typeof videoDoc.filepath === "string" && videoDoc.filepath.startsWith("http")) {
      return res.redirect(videoDoc.filepath);
    }

    const relativePath = typeof videoDoc.filepath === "string" ? videoDoc.filepath : "";
    const absolutePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(__dirname, "..", relativePath);

    if (!relativePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: "Video file not found" });
    }

    const stat = fs.statSync(absolutePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = videoDoc.filetype || "video/mp4";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        return res
          .status(416)
          .set("Content-Range", `bytes */${fileSize}`)
          .end();
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.set({
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });

      const stream = fs.createReadStream(absolutePath, { start, end });
      return stream.pipe(res);
    }

    res.status(200);
    res.set({
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    });

    const stream = fs.createReadStream(absolutePath);
    return stream.pipe(res);
  } catch (err) {
    console.error("Stream video error:", err);
    res.status(500).json({ message: "Failed to stream video" });
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
