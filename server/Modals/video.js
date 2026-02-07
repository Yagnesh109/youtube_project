import mongoose from "mongoose";
const videoschema = new mongoose.Schema(
  {
    videotitle: { type: String, require: true },
    filename: { type: String, require: true },
    filetype: { type: String, require: true },
    filepath: { type: String, require: true },
    filesize: { type: String, require: true },
    videochanel: { type: String, require: true },
    Like: { type: Number, default: 0 },
    Dislike: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uploader: { type: String },
  },
  {
    timestamps: true,
  }
);
export default mongoose.model("videofiles", videoschema);
