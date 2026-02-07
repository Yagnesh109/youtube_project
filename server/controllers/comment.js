import comment from "../Modals/comment.js";
import Auth from "../Modals/Auth.js";
import axios from "axios";

// 🔹 FIXED REGEX: 
// \p{L} -> Matches ANY language letter (Hindi, English, etc.)
// \p{M} -> Combining marks (needed for many scripts, incl. Devanagari)
// \p{N} -> Matches any number
// u flag -> Essential for reading non-English characters
const SPECIAL_CHAR_REGEX = /^[\p{L}\p{M}\p{N}\s.,!?'"()\-\u2013\u2014]+$/u;

export const addComment = async (req, res) => {
  const { videoid, commentbody, city } = req.body;
  const userId = req.user?.id || req.body.userId;

  try {
    if (!userId || !videoid || !commentbody?.trim()) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check against the new multi-language regex
    if (!SPECIAL_CHAR_REGEX.test(commentbody)) {
      return res.status(400).json({ 
        message: "Comment contains restricted symbols (like @, #, $, %). Please use standard text only." 
      });
    }

    const userDetails = await Auth.findById(userId);
    if (!userDetails) return res.status(404).json({ message: "User not found" });

    const newComment = await comment.create({
      userid: userId,
      videoid: videoid,
      commentbody: commentbody.trim(),
      usercommented: userDetails.name || "Anonymous",
      city: city || "Unknown City",
    });

    const populatedComment = await comment.findById(newComment._id)
      .populate("userid", "name image")
      .populate("videoid", "videotitle")
      .exec();

    return res.status(201).json(populatedComment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getComments = async (req, res) => {
  const { videoId } = req.params;
  try {
    const comments = await comment.find({ videoid: videoId })
      .populate("userid", "name image")
      .sort({ commentedon: -1 })
      .exec();
    return res.status(200).json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteComment = async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user?.id || req.body.userId;
  try {
    const commentToDelete = await comment.findById(commentId);
    if (!commentToDelete) return res.status(404).json({ message: "Not found" });
    if (commentToDelete.userid.toString() !== userId) return res.status(403).json({ message: "Not authorized" });
    await comment.findByIdAndDelete(commentId);
    return res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateComment = async (req, res) => {
  const { commentId } = req.params;
  const { commentbody } = req.body;
  const userId = req.user?.id || req.body.userId;
  try {
    // Check updated text against new regex
    if (!SPECIAL_CHAR_REGEX.test(commentbody)) return res.status(400).json({ message: "Restricted symbols detected." });
    
    const commentToUpdate = await comment.findById(commentId);
    if (!commentToUpdate) return res.status(404).json({ message: "Not found" });
    if (commentToUpdate.userid.toString() !== userId) return res.status(403).json({ message: "Not authorized" });
    
    commentToUpdate.commentbody = commentbody.trim();
    await commentToUpdate.save();
    
    const updatedComment = await comment.findById(commentId).populate("userid", "name image").exec();
    return res.status(200).json(updatedComment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const dislikeComment = async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user?.id || req.body.userId;

  try {
    const targetComment = await comment.findById(commentId);
    if (!targetComment) return res.status(404).json({ message: "Comment not found" });

    if (targetComment.dislikedBy.includes(userId)) {
      return res.status(400).json({ message: "Already disliked" });
    }

    targetComment.dislikedBy.push(userId);
    targetComment.dislikes += 1;

    // Auto-remove rule
    if (targetComment.dislikes >= 2) {
      await comment.findByIdAndDelete(commentId);
      return res.status(200).json({ 
        message: "Comment removed due to negative feedback", 
        removed: true,
        _id: commentId 
      });
    }

    await targetComment.save();
    return res.status(200).json({ 
      message: "Comment disliked", 
      dislikes: targetComment.dislikes,
      removed: false 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const likeComment = async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user?.id || req.body.userId;

  try {
    const targetComment = await comment.findById(commentId);
    if (!targetComment) return res.status(404).json({ message: "Comment not found" });

    if (targetComment.likedBy.includes(userId)) {
      return res.status(400).json({ message: "Already liked" });
    }

    targetComment.likedBy.push(userId);
    targetComment.likes += 1;

    await targetComment.save();
    return res.status(200).json({
      message: "Comment liked",
      likes: targetComment.likes,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const translateComment = async (req, res) => {
    const { commentId } = req.params;
    const { targetLang } = req.body; 
    const target = targetLang || 'hi'; 
  
    try {
      const commentDoc = await comment.findById(commentId);
      if (!commentDoc) return res.status(404).json({ message: "Comment not found" });
  
      const text = commentDoc.commentbody;
      const langPair = `Autodetect|${target}`; 

      const response = await axios.get(`https://api.mymemory.translated.net/get`, {
        params: {
            q: text,
            langpair: langPair
        }
      });
  
      if (response.data.responseStatus !== 200) {
          console.error("MyMemory API Error:", response.data.responseDetails);
          return res.status(400).json({ message: "Translation unavailable." });
      }

      return res.status(200).json({
        original: text,
        translated: response.data.responseData.translatedText,
        lang: target
      });

    } catch (error) {
      console.error("Translation Controller Error:", error.message);
      res.status(500).json({ message: "Translation service unavailable." });
    }
  };
