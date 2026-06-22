const xpEventModel = require("../models/xpEvent.model");
const engagementModel = require("../models/engagement.model");
const scoreModel = require("../models/score.model");
const postModel = require("../models/post.model");
const predictionModel = require("../models/prediction.model");
const matchModel = require("../models/match.model");

// Each free-kick goal is worth this much XP — must match GOAL_XP in app.js.
const GOAL_XP = 10;

// Default friendly label + icon per source (callers can override).
const META = {
  create_post: { label: "Created a post", emoji: "📸" },
  post_chant: { label: "Shared a chant", emoji: "📣" },
  predict_match: { label: "Match prediction", emoji: "🔮" },
  predict_match_correct: { label: "Correct prediction", emoji: "🎯" },
  goals: { label: "Free-kick goals", emoji: "⚽" },
  streak_bonus: { label: "Free-kick streak bonus", emoji: "🔥" },
};

// Write (or idempotently update) one ledger row. Deduped by (clerkUserId,
// refId), so a retried award never double-logs. Never throws — the ledger is a
// convenience view and must not block the real XP award.
const logXpEvent = async ({
  clerkUserId,
  source,
  amount,
  refId,
  label,
  detail = "",
  emoji,
  createdAt,
}) => {
  if (!clerkUserId || !refId || !amount) return;
  const meta = META[source] || {};
  try {
    await xpEventModel.updateOne(
      { clerkUserId, refId },
      {
        $setOnInsert: { clerkUserId, refId, createdAt: createdAt || new Date() },
        $set: {
          source,
          amount,
          label: label || meta.label || "XP",
          detail,
          emoji: emoji || meta.emoji || "✨",
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) {
      console.warn("[xp-ledger] log failed:", err.message);
    }
  }
};

// Remove a ledger row (used when a post's challenge XP is revoked on delete).
const removeXpEvent = async (clerkUserId, refId) => {
  try {
    await xpEventModel.deleteOne({ clerkUserId, refId });
  } catch (err) {
    console.warn("[xp-ledger] remove failed:", err.message);
  }
};

// One-time, self-reconciling backfill so users who earned XP before the ledger
// existed still see a history. It reconstructs rows from records that carry
// detail (post awards, correct predictions, goal count) and folds any leftover
// engagement XP (e.g. the daily "make a prediction" bonus, which isn't tied to
// a single record) into one "Earlier match predictions" row — guaranteeing the
// ledger sums to the same unified total as the leaderboard. Guarded by a marker
// row so it runs at most once per user; all writes are idempotent upserts.
const backfillXpLedger = async (clerkUserId) => {
  const markerRef = `marker:${clerkUserId}`;
  const done = await xpEventModel
    .findOne({ clerkUserId, refId: markerRef })
    .lean();
  if (done) return;

  const [eng, score, awardPosts, preds] = await Promise.all([
    engagementModel.findOne({ clerkUserId }).lean(),
    scoreModel.findOne({ clerkUserId }).lean(),
    postModel
      .find({ "author.clerkUserId": clerkUserId, "xpAward.xp": { $gt: 0 } })
      .select("xpAward type caption createdAt")
      .lean(),
    predictionModel.find({ clerkUserId }).lean(),
  ]);

  // 1) Post / chant daily-challenge awards (same refId scheme as live logging,
  //    so this never collides with an event already written since deploy).
  for (const p of awardPosts) {
    const a = p.xpAward;
    await logXpEvent({
      clerkUserId,
      source: a.challengeId,
      amount: a.xp,
      refId: `daily:${a.dateKey}:${a.challengeId}`,
      detail: p.type === "text" ? p.caption || "Chant" : "Photo post",
      createdAt: p.createdAt,
    });
  }

  // 2) Correct predictions (with team names for context).
  const correct = preds.filter(
    (p) => p.correct === true && (p.xpAwarded || 0) > 0
  );
  if (correct.length) {
    const ms = await matchModel
      .find({ matchId: { $in: correct.map((p) => p.matchId) } })
      .select("matchId homeTeam awayTeam")
      .lean();
    const mMap = new Map(ms.map((m) => [m.matchId, m]));
    for (const p of correct) {
      const m = mMap.get(p.matchId);
      const tie = m
        ? `${m.homeTeam?.shortName || m.homeTeam?.name} v ${
            m.awayTeam?.shortName || m.awayTeam?.name
          }`
        : "Match";
      await logXpEvent({
        clerkUserId,
        source: "predict_match_correct",
        amount: p.xpAwarded,
        refId: `predcorrect:${clerkUserId}:${p.matchId}`,
        detail: tie,
        createdAt: p.updatedAt || p.createdAt,
      });
    }
  }

  // Re-read the ledger so the reconciling rows below fill only the gap and can
  // never double-count anything already itemised (or logged live since deploy).
  const events = await xpEventModel.find({ clerkUserId }).lean();
  const ENG = new Set([
    "create_post",
    "post_chant",
    "predict_match",
    "predict_match_correct",
  ]);
  const engLedger = events
    .filter((e) => ENG.has(e.source))
    .reduce((s, e) => s + e.amount, 0);
  const goalLedger = events
    .filter((e) => e.source === "goals")
    .reduce((s, e) => s + e.amount, 0);

  // 3) Pre-ledger goals as one aggregate row (individual goals weren't dated).
  const goals = score?.totalScore || 0;
  const goalInit = goals * GOAL_XP - goalLedger;
  if (goalInit > 0) {
    await logXpEvent({
      clerkUserId,
      source: "goals",
      amount: goalInit,
      refId: `goals:init:${clerkUserId}`,
      detail: `${goals} goal${goals === 1 ? "" : "s"} × ${GOAL_XP} XP`,
      createdAt: score?.updatedAt,
    });
  }

  // 4) Any remaining engagement XP (pre-ledger daily prediction bonuses, etc.).
  const recon = (eng?.totalXp || 0) - engLedger;
  if (recon > 0) {
    await logXpEvent({
      clerkUserId,
      source: "predict_match",
      amount: recon,
      refId: `recon:init:${clerkUserId}`,
      label: "Earlier match predictions",
      detail: "Daily picks made before kick-off",
      createdAt: eng?.updatedAt,
    });
  }

  // Mark complete so we never backfill this user again.
  await xpEventModel.updateOne(
    { clerkUserId, refId: markerRef },
    {
      $setOnInsert: {
        clerkUserId,
        refId: markerRef,
        source: "marker",
        amount: 0,
        label: "",
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
};

module.exports = { GOAL_XP, logXpEvent, removeXpEvent, backfillXpLedger };
