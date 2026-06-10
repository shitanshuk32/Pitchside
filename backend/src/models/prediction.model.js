const mongoose = require("mongoose");

// One prediction per user per match.
const predictionSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, index: true },
    matchId: { type: Number, required: true, index: true },
    pick: { type: String, enum: ["home", "draw", "away"], required: true },
    correct: { type: Boolean, default: null }, // null until match is graded
    xpAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
);

predictionSchema.index({ clerkUserId: 1, matchId: 1 }, { unique: true });

const predictionModel = mongoose.model("prediction", predictionSchema);

module.exports = predictionModel;
