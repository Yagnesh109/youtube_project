import video from "../Modals/video.js";
import like from "../Modals/like.js";

export const handlelike = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;
  
  console.log("Like Request - userId:", userId, "videoId:", videoId);
  
  try {
    const existinglike = await like.findOne({
      viewer: userId,
      videoid: videoId,
    });
    
    console.log("Existing like:", existinglike);
    
    if (existinglike) {
      await like.findByIdAndDelete(existinglike._id);
      console.log("Removed like");
      await video.findByIdAndUpdate(videoId, { $inc: { Like: -1 } });
      return res.status(200).json({ liked: false });
    } else {
      const newLike = await like.create({ viewer: userId, videoid: videoId });
      console.log("Added like:", newLike);
      await video.findByIdAndUpdate(videoId, { $inc: { Like: 1 } });
      return res.status(200).json({ liked: true });
    }
  } catch (error) {
    console.error("Like error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const handledislike = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;
  
  console.log("Dislike Request - userId:", userId, "videoId:", videoId);
  
  try {
    // For now, just toggle a dislike count in video (you can extend this with a dislike model)
    const videoDoc = await video.findById(videoId);
    if (!videoDoc) {
      return res.status(404).json({ message: "Video not found" });
    }
    
    // Simple dislike toggle - you might want to add a separate dislike model
    const currentDislikes = videoDoc.Dislike || 0;
    await video.findByIdAndUpdate(videoId, { Dislike: currentDislikes + 1 });
    
    console.log("Dislike added, new count:", currentDislikes + 1);
    
    return res.status(200).json({ disliked: true });
  } catch (error) {
    console.error("Dislike error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const checkLikeStatus = async (req, res) => {
  const { userId, videoId } = req.params;
  try {
    const existinglike = await like.findOne({
      viewer: userId,
      videoid: videoId,
    });
    return res.status(200).json({ liked: !!existinglike });
  } catch (error) {
    console.error("Check like status error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getallLikedVideo = async (req, res) => {
  const { userId } = req.params;
  try {
    const likedvideo = await like
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();
    return res.status(200).json(likedvideo);
  } catch (error) {
    console.error("Get liked videos error:", error);
    res.status(500).json({ message: error.message });
  }
};
