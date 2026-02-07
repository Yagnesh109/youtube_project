import Subscription from "../Modals/subscription.js";
import User from "../Modals/Auth.js";
import mongoose from "mongoose";

// Toggle Subscribe/Unsubscribe
export const toggleSubscription = async (req, res) => {
  const { channelId } = req.body;
  const userId = req.user.id; // From verifyToken middleware

  if (!channelId) {
    return res.status(400).json({ message: "Channel ID is required" });
  }

  if (channelId === userId) {
    return res.status(400).json({ message: "You cannot subscribe to yourself." });
  }

  try {
    // Validate channelId is a valid ObjectId format
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: "Invalid channel ID format" });
    }

    // Verify that the channel exists
    const channel = await User.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const existingSub = await Subscription.findOne({
      subscriber: userId,
      channel: channelId,
    });

    if (existingSub) {
      await Subscription.findByIdAndDelete(existingSub._id);
      return res.status(200).json({ subscribed: false, message: "Unsubscribed" });
    } else {
      await Subscription.create({
        subscriber: userId,
        channel: channelId,
      });
      return res.status(200).json({ subscribed: true, message: "Subscribed" });
    }
  } catch (error) {
    console.error("Subscription toggle error:", error);
    
    // Handle duplicate key error (shouldn't happen but just in case)
    if (error.code === 11000) {
      return res.status(400).json({ message: "Already subscribed to this channel" });
    }
    
    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Check if user is subscribed to a specific channel
export const checkSubscriptionStatus = async (req, res) => {
  const { channelId, userId } = req.params;

  try {
    const existingSub = await Subscription.findOne({
      subscriber: userId,
      channel: channelId,
    });
    return res.status(200).json({ subscribed: !!existingSub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get list of channels the user has subscribed to
export const getUserSubscriptions = async (req, res) => {
  const { userId } = req.params;

  try {
    const subscriptions = await Subscription.find({ subscriber: userId })
      .populate("channel", "name channelname image description")
      .sort({ createdAt: -1 });

    // Extract the channel details only
    const channels = subscriptions.map((sub) => sub.channel);
    
    return res.status(200).json(channels);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};