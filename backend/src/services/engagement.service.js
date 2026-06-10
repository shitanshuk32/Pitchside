const engagementModel = require("../models/engagement.model");

const TOURNAMENT_START = new Date("2026-06-11T00:00:00Z");
const TOURNAMENT_DAYS = 39;

const CHALLENGE_POOL = [
  {
    id: "play_free_kick",
    label: "Take your 3 free kicks",
    emoji: "⚽",
    xp: 10,
  },
  {
    id: "score_goal",
    label: "Score at least 1 goal",
    emoji: "🥅",
    xp: 25,
  },
  {
    id: "post_chant",
    label: "Share a World Cup chant",
    emoji: "📣",
    xp: 20,
  },
  {
    id: "react",
    label: "React to a squad post",
    emoji: "🔥",
    xp: 15,
  },
  {
    id: "view_leaderboard",
    label: "Check the leaderboard",
    emoji: "🏆",
    xp: 10,
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

// Same three challenges for every user on a given UTC date.
const getDailyChallenges = (dateKey) => {
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) {
    seed += dateKey.charCodeAt(i) * (i + 1);
  }

  const pool = [...CHALLENGE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
};

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

const recordActivity = async (userId, challengeId) => {
  // predict_match_correct awards bonus XP directly without being a daily challenge.
  if (EXTRA_ACTIVITIES.has(challengeId)) {
    const CORRECT_PREDICTION_XP = 15;
    let eng = await engagementModel.findOne({ clerkUserId: userId });
    if (!eng) eng = new engagementModel({ clerkUserId: userId });
    eng.totalXp += CORRECT_PREDICTION_XP;
    await eng.save();
    return { ok: true, newXp: CORRECT_PREDICTION_XP };
  }

  if (!VALID_CHALLENGE_IDS.has(challengeId)) {
    return { ok: false, reason: "invalid_challenge" };
  }

  const today = getTodayKey();
  const todaysChallenges = getDailyChallenges(today);
  if (!todaysChallenges.some((c) => c.id === challengeId)) {
    // Valid activity, but it isn't one of today's rotating challenges.
    // The frontend reports activities proactively (e.g. visiting the
    // leaderboard or playing the game), so this is expected — acknowledge it
    // as a benign no-op instead of a 400 to avoid noisy client errors.
    return { ok: true, skipped: true };
  }

  let eng = await engagementModel.findOne({ clerkUserId: userId });
  if (!eng) {
    eng = new engagementModel({ clerkUserId: userId });
  }

  ensureToday(eng, today);

  if (eng.todayCompleted.includes(challengeId)) {
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

  return {
    ok: true,
    alreadyDone: false,
    newXp: challenge.xp,
    payload: shapeEngagementResponse(eng, today),
  };
};

module.exports = {
  CHALLENGE_POOL,
  getEngagementToday,
  recordActivity,
  getTournamentInfo,
};
