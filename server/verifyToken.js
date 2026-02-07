import users from "./Modals/Auth.js";
import jwt from "jsonwebtoken";

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    const userIdFromHeader = req.headers["x-user-id"];

    // First try to verify JWT token if present
    if (bearerToken) {
      try {
        const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET || "test");
        const user = await users.findById(decoded.id);
        if (!user) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        req.user = { id: user._id.toString(), email: user.email };
        next();
        return;
      } catch (jwtError) {
        console.log("JWT verification failed:", jwtError);
      }
    }

    // Fallback to user ID from header (for backward compatibility)
    const userId = (typeof userIdFromHeader === "string" && userIdFromHeader.trim())
      ? userIdFromHeader.trim()
      : null;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await users.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = { id: user._id.toString(), email: user.email };
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
