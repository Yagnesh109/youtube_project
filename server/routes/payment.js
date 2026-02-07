import express from "express";
import { createOrder, verifyPayment } from "../controllers/payment.js";

const routes = express.Router();

routes.post("/order", createOrder);
routes.post("/verify", verifyPayment);

export default routes;