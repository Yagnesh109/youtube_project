import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import mongoose from "mongoose";
import multer from "multer";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import paymentroutes from "./routes/payment.js";
import subscriptionRoutes from "./routes/subscription.js";
import friendsRoutes from "./routes/friends.js";
import path from "path";
import fs from "fs";
dotenv.config();
const app = express();
const httpServer = createServer(app);

// Ensure uploads directory exists (needed for Render/production)
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads (stored temporarily on disk)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ".mp4");
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "video/mp4") {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ storage, fileFilter });

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
    credentials: true,
  })
);
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.use(bodyParser.json());
app.use("/user", userroutes);
app.use("/video", upload.single("file"), videoroutes);
app.use("/like", likeroutes);
app.use("/watchlater", watchlaterroutes);
app.use("/history", historyroutes);
app.use("/comment", commentroutes);
app.use("/payment", paymentroutes);
app.use("/subscription", subscriptionRoutes);
app.use("/friends", friendsRoutes);

// Serve uploaded files statically
app.use("/uploads", express.static(path.join("uploads")));

// Socket.IO signaling for WebRTC calls
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
    credentials: true,
  },
});

const userSockets = new Map();

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("register", ({ userId }) => {
    if (!userId) return;
    socket.data.userId = userId;
    userSockets.set(userId, socket.id);
    console.log("Registered user:", userId, "socket:", socket.id);
    io.emit("presence:update", Array.from(userSockets.keys()));
  });

  socket.on("call:offer", ({ to, from, offer }) => {
    console.log("Call offer:", { from, to });
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:offer", { from, offer });
    } else {
      socket.emit("call:unavailable", { to });
    }
  });

  socket.on("call:answer", ({ to, from, answer }) => {
    console.log("Call answer:", { from, to });
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:answer", { from, answer });
    }
  });

  socket.on("ice-candidate", ({ to, from, candidate }) => {
    console.log("ICE candidate:", { from, to });
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", { from, candidate });
    }
  });

  socket.on("call:end", ({ to, from }) => {
    console.log("Call end:", { from, to });
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:end", { from });
    }
  });

  socket.on("call:reject", ({ to, from }) => {
    console.log("Call reject:", { from, to });
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:reject", { from });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    const userId = socket.data.userId;
    if (userId) {
      userSockets.delete(userId);
      io.emit("presence:update", Array.from(userSockets.keys()));
    }
  });
});
const PORT = process.env.PORT || 5000;

const DB_URL = process.env.DB_URL;
console.log("Attempting to connect to database...");

mongoose
  .connect(DB_URL)
  .then(() => {
    console.log("Database connected successfully");
    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Database connection failed", err);
    console.log("Starting server without database connection...");
    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} (without database)`);
    });
  });
