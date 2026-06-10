const mongoose = require("mongoose");

const bracketPickSchema = new mongoose.Schema(
  {
    matchId: { type: Number, required: true },
    pick: { type: String, required: true }, // team name the user advanced
  },
  { _id: false }
);

// One bracket per user. Picks are locked per match as it kicks off.
const bracketSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    picks: { type: [bracketPickSchema], default: [] },
    score: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const bracketModel = mongoose.model("bracket", bracketSchema);

module.exports = bracketModel;
