const mongoose = require("mongoose");

// An append-only ledger of every XP-earning (or XP-revoking) event, so a user
// can see exactly where each point came from and when. `refId` is a stable,
// deterministic key per logical event (e.g. `daily:2026-06-19:create_post`,
// `predcorrect:<user>:<matchId>`, `goals:<user>:<ts>`) — it's unique per user
// so writes are idempotent (a retried award never double-logs).
const xpEventSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, index: true },
    source: { type: String, required: true }, // create_post | post_chant | predict_match | predict_match_correct | goals | marker
    label: { type: String, default: "XP" },
    detail: { type: String, default: "" },
    emoji: { type: String, default: "✨" },
    amount: { type: Number, required: true },
    refId: { type: String, required: true },
    // Set explicitly (not via timestamps) so backfilled rows can keep the
    // original date of the activity they represent.
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

xpEventSchema.index({ clerkUserId: 1, refId: 1 }, { unique: true });
xpEventSchema.index({ clerkUserId: 1, createdAt: -1 });

module.exports = mongoose.model("xpEvent", xpEventSchema);
