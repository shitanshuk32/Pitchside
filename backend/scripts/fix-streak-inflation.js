// One-off cleanup for the streak-bonus inflation bug.
//
// The old Free Kick code added the streak bonus as 20 *extra goals* instead of
// 20 bonus XP, so a single 3-goal streak was recorded as "21 goals" (+210 XP)
// rather than "1 goal (+10) + 20 bonus XP" (+30). Because the bonus was folded
// into the goal COUNT, there's no reliable record of how many goals were real
// vs. bonus — so the only clean fix is to reset the affected user's free-kick
// goal economy and let them re-accumulate correctly with the fixed code.
//
// This script ONLY touches free-kick data:
//   • scores.totalScore                         → reset (0 by default, or --goals=N)
//   • xpEvents with source "goals"/"streak_bonus" → deleted
//   • xpEvents "goals:init:<user>" + "marker:<user>" → deleted so the (idempotent)
//     ledger backfill re-derives ONE clean "<N> goals × 10 XP" row on next load
// It does NOT touch predictions, posts, daily challenges, streaks, or the
// prediction/challenge XP stored on engagement.totalXp.
//
// Usage (run from backend/ with the same .env loaded):
//   node scripts/fix-streak-inflation.js <clerkUserId>            # dry run, reset to 0 goals
//   node scripts/fix-streak-inflation.js <clerkUserId> --goals=12 # dry run, reset to 12 goals
//   node scripts/fix-streak-inflation.js <clerkUserId> --apply    # actually write
//   node scripts/fix-streak-inflation.js --all --apply            # every user (reset to 0)
//
// IMPORTANT: after applying, clear the affected browser's localStorage keys
//   ffk_total, ffk_synced, ffk_bonusStreaks, ffk_bonusSynced
// (or just run localStorage.clear()) so the client's sync baseline matches the
// reset server total. Otherwise the stale baseline will suppress re-syncing.

require("dotenv").config();
const mongoose = require("mongoose");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const goalsArg = args.find((a) => a.startsWith("--goals="));
const resetGoals = goalsArg ? Math.max(0, parseInt(goalsArg.split("=")[1], 10) || 0) : 0;
const userId = args.find((a) => !a.startsWith("--")) || null;

if (!all && !userId) {
  console.error(
    "Usage: node scripts/fix-streak-inflation.js <clerkUserId> [--goals=N] [--apply]\n" +
      "   or: node scripts/fix-streak-inflation.js --all [--apply]"
  );
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const scores = db.collection("scores");
  const xpEvents = db.collection("xpevents");

  // Resolve the set of users to fix.
  let targets;
  if (all) {
    targets = (await scores.distinct("clerkUserId")).filter(Boolean);
  } else {
    targets = [userId];
  }

  console.log(
    `${apply ? "APPLYING" : "DRY RUN"} — ${targets.length} user(s), ` +
      `reset goals to ${all ? 0 : resetGoals}\n`
  );

  for (const id of targets) {
    const score = await scores.findOne({ clerkUserId: id });
    const goalRows = await xpEvents
      .find({ clerkUserId: id, source: { $in: ["goals", "streak_bonus"] } })
      .toArray();
    const ledgerGoalXp = goalRows.reduce((s, r) => s + (r.amount || 0), 0);
    const target = all ? 0 : resetGoals;

    console.log(`user ${id}`);
    console.log(`  current score.totalScore : ${score?.totalScore ?? "(none)"}`);
    console.log(`  goal/bonus ledger rows   : ${goalRows.length} (sum ${ledgerGoalXp} XP)`);
    console.log(`  → reset totalScore to    : ${target}`);
    console.log(`  → delete goal/bonus rows + goals:init + marker (backfill re-derives a clean row)`);

    if (apply) {
      if (score) {
        await scores.updateOne({ clerkUserId: id }, { $set: { totalScore: target } });
      }
      await xpEvents.deleteMany({
        clerkUserId: id,
        source: { $in: ["goals", "streak_bonus"] },
      });
      await xpEvents.deleteOne({ clerkUserId: id, refId: `goals:init:${id}` });
      await xpEvents.deleteOne({ clerkUserId: id, refId: `marker:${id}` });
      console.log("  ✓ done");
    }
    console.log("");
  }

  await mongoose.disconnect();
  console.log(apply ? "Cleanup complete." : "Dry run complete — re-run with --apply to write.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
