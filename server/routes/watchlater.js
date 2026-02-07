import express from "express";
import { handleWatchLater, getWatchLaterStatus, getWatchLaterVideos, removeFromWatchLater } from "../controllers/watchlater.js";

const routes = express.Router();
routes.get("/:userId", getWatchLaterVideos);
routes.get("/:userId/:videoId/status", getWatchLaterStatus);
routes.post("/:videoId", handleWatchLater);
routes.delete("/:userId/:videoId", removeFromWatchLater);

export default routes;