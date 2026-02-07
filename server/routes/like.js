import express from "express";
import { handlelike, handledislike, checkLikeStatus, getallLikedVideo } from "../controllers/like.js";

const routes = express.Router();
routes.get("/:userId", getallLikedVideo);
routes.get("/:userId/:videoId/status", checkLikeStatus);
routes.post("/:videoId/like", handlelike);
routes.post("/:videoId/dislike", handledislike);

export default routes;
