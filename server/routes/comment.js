import express from "express";
import { 
  addComment, 
  getComments, 
  deleteComment, 
  updateComment, 
  dislikeComment,
  likeComment,
  translateComment 
} from "../controllers/comment.js";

const routes = express.Router();

routes.post("/add", addComment);
routes.get("/:videoId", getComments);
routes.delete("/:commentId", deleteComment);
routes.put("/:commentId", updateComment);

// New Routes
routes.post("/:commentId/dislike", dislikeComment);
routes.post("/:commentId/like", likeComment);
routes.post("/:commentId/translate", translateComment);

export default routes;
