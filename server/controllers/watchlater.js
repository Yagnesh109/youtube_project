import video from "../Modals/video.js";
import watchlater from "../Modals/watchlater.js";

export const handleWatchLater = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;
  
  console.log("Watch Later Request - userId:", userId, "videoId:", videoId);
  
  try {
    const existingWatchLater = await watchlater.findOne({
      viewer: userId,
      videoid: videoId,
    });
    
    console.log("Existing watch later:", existingWatchLater);
    
    if (existingWatchLater) {
      await watchlater.findByIdAndDelete(existingWatchLater._id);
      console.log("Removed from watch later");
      return res.status(200).json({ watchLater: false });
    } else {
      const newWatchLater = await watchlater.create({ viewer: userId, videoid: videoId });
      console.log("Added to watch later:", newWatchLater);
      return res.status(200).json({ watchLater: true });
    }
  } catch (error) {
    console.error("Watch later error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getWatchLaterStatus = async (req, res) => {
  const { userId, videoId } = req.params;
  try {
    const existingWatchLater = await watchlater.findOne({
      viewer: userId,
      videoid: videoId,
    });
    return res.status(200).json({ watchLater: !!existingWatchLater });
  } catch (error) {
    console.error("Check watch later status error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const removeFromWatchLater = async (req, res) => {
  const { userId, videoId } = req.params;
  try {
    await watchlater.deleteOne({
      viewer: userId,
      videoid: videoId,
    });
    return res.status(200).json({ message: "Removed from watch later" });
  } catch (error) {
    console.error("Remove from watch later error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getWatchLaterVideos = async (req, res) => {
  const { userId } = req.params;
  try {
    const watchLaterVideos = await watchlater
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();
    return res.status(200).json(watchLaterVideos);
  } catch (error) {
    console.error("Get watch later videos error:", error);
    res.status(500).json({ message: error.message });
  }
};