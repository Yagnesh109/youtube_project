import video from "../Modals/video.js";
import history from "../Modals/history.js";

export const addToHistory = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;
  
  console.log("History Request - userId:", userId, "videoId:", videoId);
  
  try {
    // Check if video is already in history
    const existingHistory = await history.findOne({
      viewer: userId,
      videoid: videoId,
    });
    
    console.log("Existing history:", existingHistory);
    
    if (existingHistory) {
      // Update timestamp to bring it to top of history
      await history.findByIdAndUpdate(existingHistory._id, { 
        likedon: new Date() 
      });
      console.log("History updated");
      return res.status(200).json({ message: "History updated" });
    } else {
      // Add to history
      const newHistory = await history.create({ viewer: userId, videoid: videoId });
      console.log("Added to history:", newHistory);
      return res.status(201).json({ message: "Added to history" });
    }
  } catch (error) {
    console.error("History error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getHistory = async (req, res) => {
  const { userId } = req.params;
  try {
    const historyVideos = await history
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .sort({ likedon: -1 }) // Most recent first
      .exec();
    return res.status(200).json(historyVideos);
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const removeFromHistory = async (req, res) => {
  const { userId, videoId } = req.params;
  try {
    await history.deleteOne({
      viewer: userId,
      videoid: videoId,
    });
    return res.status(200).json({ message: "Removed from history" });
  } catch (error) {
    console.error("Remove from history error:", error);
    res.status(500).json({ message: error.message });
  }
};