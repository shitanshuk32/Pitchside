const mongoose = require("mongoose");

// One pending refill reminder per user. Created when the player opts in after
// running out of energy; deleted once the reminder email has been sent (or
// when the user turns reminders off).
const energyReminderSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    // When the player's energy refills (the email goes out shortly before).
    refillAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

const energyReminderModel = mongoose.model(
  "energyReminder",
  energyReminderSchema
);

module.exports = energyReminderModel;
