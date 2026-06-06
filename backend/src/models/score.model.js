const mongoose = require("mongoose");

// One leaderboard entry per signed-in user. We keep only their personal best
// for the Free Kick Challenge — the global ranking is derived from bestScore.
const scoreSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    bestScore: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

const scoreModel = mongoose.model("score", scoreSchema);

module.exports = scoreModel;
