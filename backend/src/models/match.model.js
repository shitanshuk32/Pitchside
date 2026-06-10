const mongoose = require("mongoose");

const goalSchema = new mongoose.Schema(
  { minute: Number, team: String, scorer: String },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  { minute: Number, team: String, player: String, type: String },
  { _id: false }
);

// Cached fixture/result data from football-data.org.
// status mirrors their values: SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | SUSPENDED | POSTPONED | CANCELLED
const matchSchema = new mongoose.Schema(
  {
    matchId: { type: Number, required: true, unique: true, index: true },
    homeTeam: {
      id: Number,
      name: { type: String, required: true },
      shortName: String,
      crest: String,
    },
    awayTeam: {
      id: Number,
      name: { type: String, required: true },
      shortName: String,
      crest: String,
    },
    utcDate: { type: Date, required: true, index: true },
    status: { type: String, default: "SCHEDULED" },
    minute: { type: Number, default: null },
    score: {
      home: { type: Number, default: null },
      away: { type: Number, default: null },
    },
    goals: { type: [goalSchema], default: [] },
    cards: { type: [cardSchema], default: [] },
    competition: { type: String, default: "FIFA World Cup" },
    round: { type: String, default: "" },
    group: { type: String, default: null },
    venue: { type: String, default: "" },
    graded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const matchModel = mongoose.model("match", matchSchema);

module.exports = matchModel;
