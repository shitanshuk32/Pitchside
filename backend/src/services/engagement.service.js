const engagementModel = require("../models/engagement.model");
const { logXpEvent } = require("./xpLedger.service");

const TOURNAMENT_START = new Date("2026-06-11T00:00:00Z");
const TOURNAMENT_DAYS = 39;

// The daily quests are now a FIXED set (no random rotation). Each can be earned
// once per day. Goals are handled separately — they accumulate continuously
// toward the leaderboard (see GOAL_XP in app.js), so they aren't a one-off quest.
const CHALLENGE_POOL = [
  {
    id: "create_post",
    label: "Create a post",
    emoji: "📸",
    xp: 30,
  },
  {
    id: "post_chant",
    label: "Share a World Cup chant",
    emoji: "📣",
    xp: 20,
  },
  {
    id: "predict_match",
    label: "Predict a match result",
    emoji: "🔮",
    xp: 20,
  },
];

// Extra activity IDs that award XP but aren't daily challenges (don't need to be in the pool).
const EXTRA_ACTIVITIES = new Set(["predict_match_correct"]);

const VALID_CHALLENGE_IDS = new Set(CHALLENGE_POOL.map((c) => c.id));

// Activities the client still reports (playing, scoring, reacting, browsing)
// that no longer award standalone XP, but should be accepted as a sign of life
// so they keep the player's daily streak alive.
const KNOWN_ACTIVITIES = new Set([
  "play_free_kick",
  "score_goal",
  "react",
  "view_leaderboard",
]);

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getYesterdayKey = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const getTournamentInfo = () => {
  const diffDays = Math.floor(
    (Date.now() - TOURNAMENT_START.getTime()) / 86400000
  );

  if (diffDays < 0) {
    const daysToKickoff = Math.abs(diffDays);
    return {
      day: 0,
      totalDays: TOURNAMENT_DAYS,
      label:
        daysToKickoff === 1
          ? "1 day to kickoff"
          : `${daysToKickoff} days to kickoff`,
      phase: "pre",
      daysRemaining: TOURNAMENT_DAYS,
    };
  }

  if (diffDays >= TOURNAMENT_DAYS) {
    return {
      day: TOURNAMENT_DAYS,
      totalDays: TOURNAMENT_DAYS,
      label: "Tournament complete",
      phase: "post",
      daysRemaining: 0,
    };
  }

  const day = diffDays + 1;
  return {
    day,
    totalDays: TOURNAMENT_DAYS,
    label: `Match day ${day} of ${TOURNAMENT_DAYS}`,
    phase: "live",
    daysRemaining: TOURNAMENT_DAYS - day,
  };
};

// The same fixed quests every day for every user.
const getDailyChallenges = () => [...CHALLENGE_POOL];

const ensureToday = (eng, today) => {
  if (eng.todayDate !== today) {
    eng.todayDate = today;
    eng.todayCompleted = [];
  }
};

const updateStreak = (eng, today) => {
  if (eng.lastActiveDate === today) return;

  const yesterday = getYesterdayKey();
  if (eng.lastActiveDate === yesterday) {
    eng.streak += 1;
  } else {
    eng.streak = 1;
  }
  eng.lastActiveDate = today;
  eng.longestStreak = Math.max(eng.longestStreak, eng.streak);
};

const shapeEngagementResponse = (eng, today) => {
  const tournament = getTournamentInfo();
  const challenges = getDailyChallenges(today);
  const completed =
    eng?.todayDate === today ? eng.todayCompleted || [] : [];

  const shaped = challenges.map((c) => ({
    id: c.id,
    label: c.label,
    emoji: c.emoji,
    xp: c.xp,
    done: completed.includes(c.id),
  }));

  const dailyXp = shaped
    .filter((c) => c.done)
    .reduce((sum, c) => sum + c.xp, 0);
  const dailyXpMax = shaped.reduce((sum, c) => sum + c.xp, 0);

  return {
    tournament,
    streak: eng?.streak || 0,
    longestStreak: eng?.longestStreak || 0,
    totalXp: eng?.totalXp || 0,
    challenges: shaped,
    allDone: shaped.length > 0 && shaped.every((c) => c.done),
    dailyXp,
    dailyXpMax,
  };
};

const getEngagementToday = async (userId) => {
  const today = getTodayKey();
  const eng = userId
    ? await engagementModel.findOne({ clerkUserId: userId })
    : null;
  return shapeEngagementResponse(eng, today);
};

// Lazily cache the player's display profile on the engagement doc so the
// unified leaderboard can show them even if they never score a goal. We only
// invoke the (Clerk) resolver once per user — when no profile is stored yet.
const applyProfile = async (eng, getProfile) => {
  if (!getProfile || eng.username) return;
  try {
    const p = await getProfile();
    if (p && p.username) {
      eng.username = p.username;
      eng.imageUrl = p.imageUrl || "";
    }
  } catch {
    // Non-fatal: profile resolution can fail without blocking XP.
  }
};

const recordActivityOnce = async (userId, challengeId, getProfile = null) => {
  // predict_match_correct awards bonus XP directly without being a daily challenge.
  if (EXTRA_ACTIVITIES.has(challengeId)) {
    const CORRECT_PREDICTION_XP = 15;
    let eng = await engagementModel.findOne({ clerkUserId: userId });
    if (!eng) eng = new engagementModel({ clerkUserId: userId });
    await applyProfile(eng, getProfile);
    eng.totalXp += CORRECT_PREDICTION_XP;
    await eng.save();
    return { ok: true, newXp: CORRECT_PREDICTION_XP };
  }

  const isQuest = VALID_CHALLENGE_IDS.has(challengeId);
  if (!isQuest && !KNOWN_ACTIVITIES.has(challengeId)) {
    return { ok: false, reason: "invalid_challenge" };
  }

  const today = getTodayKey();

  let eng = await engagementModel.findOne({ clerkUserId: userId });
  if (!eng) {
    eng = new engagementModel({ clerkUserId: userId });
  }
  await applyProfile(eng, getProfile);

  if (!isQuest) {
    // Recognised activity (playing, scoring, browsing) that doesn't award XP on
    // its own. Keep the streak alive and persist any captured profile.
    updateStreak(eng, today);
    if (eng.isModified()) await eng.save();
    return { ok: true, skipped: true };
  }

  ensureToday(eng, today);

  if (eng.todayCompleted.includes(challengeId)) {
    if (eng.isModified()) await eng.save();
    return {
      ok: true,
      alreadyDone: true,
      payload: shapeEngagementResponse(eng, today),
    };
  }

  const challenge = CHALLENGE_POOL.find((c) => c.id === challengeId);
  eng.todayCompleted.push(challengeId);
  eng.totalXp += challenge.xp;
  updateStreak(eng, today);
  await eng.save();

  // Ledger row for the day's challenge (idempotent per user/day/challenge).
  await logXpEvent({
    clerkUserId: userId,
    source: challengeId,
    amount: challenge.xp,
    refId: `daily:${today}:${challengeId}`,
  });

  return {
    ok: true,
    alreadyDone: false,
    newXp: challenge.xp,
    payload: shapeEngagementResponse(eng, today),
  };
};

// The client fires several activities at once while playing, so they can race
// on the same engagement doc: two requests may both try to insert it (E11000
// duplicate key) or both save edits to its arrays (Mongoose VersionError).
// Re-running re-reads the latest doc, so retry a couple of times on those.
const isRetryableRaceError = (err) =>
  !!err && (err.code === 11000 || err.name === "VersionError");

const recordActivity = async (userId, challengeId, getProfile = null) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await recordActivityOnce(userId, challengeId, getProfile);
    } catch (err) {
      if (isRetryableRaceError(err) && attempt < 3) continue;
      throw err;
    }
  }
};

// Reverse a single challenge award when its qualifying post is deleted. Only
// the exact XP that post earned is removed (clamped at 0) — every other post,
// prediction or activity the user did stays untouched. If the award happened
// today, the quest is marked incomplete again so they can re-earn it by posting.
const revokeChallengeXpOnce = async (userId, challengeId, xp, dateKey) => {
  const eng = await engagementModel.findOne({ clerkUserId: userId });
  if (!eng) return { ok: false, reason: "no_engagement" };

  const amount = Number(xp) || 0;
  eng.totalXp = Math.max(0, (eng.totalXp || 0) - amount);

  const today = getTodayKey();
  if (dateKey === today && Array.isArray(eng.todayCompleted)) {
    eng.todayCompleted = eng.todayCompleted.filter((id) => id !== challengeId);
  }

  await eng.save();
  return {
    ok: true,
    removedXp: amount,
    payload: shapeEngagementResponse(eng, today),
  };
};

const revokeChallengeXp = async (userId, challengeId, xp, dateKey) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await revokeChallengeXpOnce(userId, challengeId, xp, dateKey);
    } catch (err) {
      if (isRetryableRaceError(err) && attempt < 3) continue;
      throw err;
    }
  }
};

// Bonus XP for a completed perfect 3-goal streak in the Free Kick game. The
// server is the source of truth for this value (the client only reports HOW
// MANY streaks were completed), so a tampered client can't choose its own
// bonus. Must match STREAK_BONUS_XP on the client (FreeKickGame.jsx).
const STREAK_BONUS_XP = 20;

// Add bonus XP for `streaks` newly-completed streaks. Lives on engagement
// (totalXp) like prediction/challenge XP — so it lifts the unified leaderboard
// total WITHOUT touching the goal count.
const awardStreakBonusOnce = async (userId, streaks, getProfile = null) => {
  const count = Math.floor(Number(streaks));
  if (!Number.isFinite(count) || count <= 0) {
    return { ok: false, reason: "invalid_count" };
  }

  let eng = await engagementModel.findOne({ clerkUserId: userId });
  if (!eng) eng = new engagementModel({ clerkUserId: userId });
  await applyProfile(eng, getProfile);

  const xp = count * STREAK_BONUS_XP;
  eng.totalXp += xp;
  await eng.save();

  return { ok: true, count, xp, totalXp: eng.totalXp };
};

const awardStreakBonus = async (userId, streaks, getProfile = null) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await awardStreakBonusOnce(userId, streaks, getProfile);
    } catch (err) {
      if (isRetryableRaceError(err) && attempt < 3) continue;
      throw err;
    }
  }
};

module.exports = {
  CHALLENGE_POOL,
  STREAK_BONUS_XP,
  getEngagementToday,
  recordActivity,
  revokeChallengeXp,
  awardStreakBonus,
  getTournamentInfo,
};
