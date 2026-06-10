const mongoose = require("mongoose");

// Per-user World Cup engagement: daily challenge progress, streak, XP.
const engagementSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    streak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActiveDate: { type: String, default: "" }, // YYYY-MM-DD (UTC)
    totalXp: { type: Number, default: 0, min: 0 },
    todayDate: { type: String, default: "" },
    todayCompleted: { type: [String], default: [] },
  },
  { timestamps: true }
);

const engagementModel = mongoose.model("engagement", engagementSchema);

module.exports = engagementModel;
