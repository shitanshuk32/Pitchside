const mongoose = require("mongoose");

// One leaderboard entry per signed-in user. We accumulate the total number of
// goals scored across the whole tournament — the global ranking is derived
// from totalScore (running total, not a single best run).
const scoreSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    totalScore: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

const scoreModel = mongoose.model("score", scoreSchema);

module.exports = scoreModel;
