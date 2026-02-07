import express from "express";
import { addFriend, getFriends, removeFriend } from "../controllers/friends.js";

const routes = express.Router();

routes.get("/:userId", getFriends);
routes.post("/:userId", addFriend);
routes.delete("/:userId/:friendId", removeFriend);

export default routes;
