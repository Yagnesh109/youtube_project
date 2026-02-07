import express from "express";
import { addToHistory, getHistory, removeFromHistory } from "../controllers/history.js";

const routes = express.Router();
routes.get("/:userId", getHistory);
routes.post("/:videoId", addToHistory);
routes.delete("/:userId/:videoId", removeFromHistory);

export default routes;