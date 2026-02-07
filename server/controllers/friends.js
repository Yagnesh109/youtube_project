import mongoose from "mongoose";
import users from "../Modals/Auth.js";

const toPublicFriend = (user) => ({
  _id: user._id,
  name: user.name,
  channelname: user.channelname,
  email: user.email,
  image: user.image,
});

export const getFriends = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await users
      .findById(userId)
      .populate("friends", "name channelname email image");
    if (!user) return res.status(404).json({ message: "User not found" });

    const friends = (user.friends || []).map(toPublicFriend);
    res.status(200).json(friends);
  } catch (error) {
    console.error("getFriends error:", error);
    res.status(500).json({ message: "Failed to fetch friends" });
  }
};

export const addFriend = async (req, res) => {
  const { userId } = req.params;
  const { friendId, email } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await users.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let friend = null;
    if (friendId) {
      if (!mongoose.Types.ObjectId.isValid(friendId)) {
        return res.status(400).json({ message: "Invalid friend ID" });
      }
      if (userId === friendId) {
        return res.status(400).json({ message: "Cannot add yourself" });
      }
      friend = await users.findById(friendId);
    } else if (email) {
      friend = await users.findOne({ email: email.toLowerCase().trim() });
    } else {
      return res.status(400).json({ message: "Provide friendId or email" });
    }

    if (!friend) {
      return res.status(404).json({ message: "Friend not found" });
    }
    if (userId.toString() === friend._id.toString()) {
      return res.status(400).json({ message: "Cannot add yourself" });
    }

    await Promise.all([
      users.findByIdAndUpdate(userId, { $addToSet: { friends: friend._id } }),
      users.findByIdAndUpdate(friend._id, { $addToSet: { friends: userId } }),
    ]);

    const updated = await users
      .findById(userId)
      .populate("friends", "name channelname email image");

    const friends = (updated?.friends || []).map(toPublicFriend);
    res.status(200).json(friends);
  } catch (error) {
    console.error("addFriend error:", error);
    res.status(500).json({ message: "Failed to add friend" });
  }
};

export const removeFriend = async (req, res) => {
  const { userId, friendId } = req.params;
  if (
    !mongoose.Types.ObjectId.isValid(userId) ||
    !mongoose.Types.ObjectId.isValid(friendId)
  ) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    await Promise.all([
      users.findByIdAndUpdate(userId, { $pull: { friends: friendId } }),
      users.findByIdAndUpdate(friendId, { $pull: { friends: userId } }),
    ]);

    const updated = await users
      .findById(userId)
      .populate("friends", "name channelname email image");
    const friends = (updated?.friends || []).map(toPublicFriend);
    res.status(200).json(friends);
  } catch (error) {
    console.error("removeFriend error:", error);
    res.status(500).json({ message: "Failed to remove friend" });
  }
};
