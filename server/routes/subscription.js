import express from "express";
import { 
  toggleSubscription, 
  checkSubscriptionStatus, 
  getUserSubscriptions 
} from "../controllers/subscription.js";
import { verifyToken } from "../verifyToken.js";

const routes = express.Router();

routes.post("/toggle", verifyToken, toggleSubscription);
routes.get("/status/:userId/:channelId", checkSubscriptionStatus);
routes.get("/user/:userId", getUserSubscriptions);

export default routes;