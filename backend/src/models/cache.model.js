const mongoose = require("mongoose");

// Generic key/value cache persisted to the DB so expensive third-party
// responses (e.g. football-data standings) survive restarts and can be served
// instantly while they refresh in the background.
const cacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const cacheModel = mongoose.model("cache", cacheSchema);

module.exports = cacheModel;
