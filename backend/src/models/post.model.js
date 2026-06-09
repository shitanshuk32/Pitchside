const mongoose = require("mongoose");

// A single comment on a post. We store a snapshot of the commenter's profile
// (name + avatar) so the feed can render without extra Clerk lookups.
const commentSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true },
    username: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    text: { type: String, required: true, maxlength: 280 },
  },
  { timestamps: true }
);

// One emoji reaction by one user. Each user has at most one reaction per post
// (picking a new emoji replaces the old one), so reactions stay tidy.
const reactionSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);

// A feed post. `author` is the signed-in creator, `reactions` holds one emoji
// per user, `likes` is the legacy heart-only field (kept for back-compat and
// folded into ❤️ reactions on read), and `comments` is an embedded list.
const postSchema = new mongoose.Schema(
  {
    // "image" posts carry a photo; "text" (Chant) posts are caption-only.
    type: { type: String, enum: ["image", "text"], default: "image" },
    image: String,
    caption: String,
    author: {
      clerkUserId: { type: String, index: true },
      username: String,
      imageUrl: { type: String, default: "" },
    },
    likes: { type: [String], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

const postModel = mongoose.model("post", postSchema);

module.exports = postModel;
