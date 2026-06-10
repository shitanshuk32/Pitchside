const matchModel = require("../models/match.model");
const predictionModel = require("../models/prediction.model");

const BASE_URL = "https://api.football-data.org/v4";
const WC_CODE = "WC"; // football-data.org competition code for FIFA World Cup
const PREDICTION_XP = 15;
const BRACKET_XP = 20;

// In-memory cache for standings (refreshed with each sync cycle).
let standingsCache = { data: null, fetchedAt: 0 };

const getApiKey = () => process.env.FOOTBALL_DATA_API_KEY || "";

const apiFetch = async (path) => {
  const key = getApiKey();
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY not set");

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": key },
  });

  if (res.status === 429) {
    throw new Error("Football API rate limit hit");
  }
  if (!res.ok) {
    throw new Error(`Football API error ${res.status} for ${path}`);
  }
  return res.json();
};

const todayUTC = () => new Date().toISOString().slice(0, 10);

const shapeMatch = (m) => ({
  matchId: m.id,
  homeTeam: {
    id: m.homeTeam?.id,
    name: m.homeTeam?.name || "TBD",
    shortName: m.homeTeam?.shortName || m.homeTeam?.name || "TBD",
    crest: m.homeTeam?.crest || null,
  },
  awayTeam: {
    id: m.awayTeam?.id,
    name: m.awayTeam?.name || "TBD",
    shortName: m.awayTeam?.shortName || m.awayTeam?.name || "TBD",
    crest: m.awayTeam?.crest || null,
  },
  utcDate: new Date(m.utcDate),
  status: m.status,
  minute: m.minute ?? null,
  score: {
    home: m.score?.fullTime?.home ?? null,
    away: m.score?.fullTime?.away ?? null,
  },
  goals: (m.goals || []).map((g) => ({
    minute: g.minute,
    team: g.team?.name,
    scorer: g.scorer?.name,
  })),
  cards: (m.bookings || []).map((b) => ({
    minute: b.minute,
    team: b.team?.name,
    player: b.player?.name,
    type: b.card,
  })),
  competition: m.competition?.name || "FIFA World Cup",
  round: m.stage || m.matchday ? String(m.matchday || m.stage) : "",
  group: m.group || null,
  venue: m.venue || "",
});

// Fetch and cache all World Cup matches for today + next 2 days.
const syncMatches = async () => {
  const today = todayUTC();
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 2);
  const dateTo = future.toISOString().slice(0, 10);

  const data = await apiFetch(
    `/competitions/${WC_CODE}/matches?dateFrom=${today}&dateTo=${dateTo}`
  );

  const matches = data.matches || [];
  for (const m of matches) {
    const shaped = shapeMatch(m);
    await matchModel.findOneAndUpdate(
      { matchId: shaped.matchId },
      shaped,
      { upsert: true, new: true }
    );
  }

  // Refresh standings cache alongside match sync.
  try {
    await syncStandings();
  } catch {
    // Non-fatal — standings may not be available yet (pre-tournament).
  }

  await gradePredictions();

  return matches.length;
};

const syncStandings = async () => {
  const data = await apiFetch(`/competitions/${WC_CODE}/standings`);
  standingsCache = { data: data.standings || [], fetchedAt: Date.now() };
};

// Today's matches for the prediction poll widget (up to 3, sorted by kick-off).
const getMatchesToday = async () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  return matchModel
    .find({ utcDate: { $gte: start, $lte: end } })
    .sort({ utcDate: 1 })
    .limit(3)
    .lean();
};

// All today's matches for the Match Centre (no limit).
const getLiveAndToday = async () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  return matchModel
    .find({ utcDate: { $gte: start, $lte: end } })
    .sort({ utcDate: 1 })
    .lean();
};

const getGroupStandings = async () => {
  // Return cached standings; if stale (>30 min) or empty, try a fresh fetch.
  const stale = Date.now() - standingsCache.fetchedAt > 30 * 60 * 1000;
  if (!standingsCache.data || stale) {
    try {
      await syncStandings();
    } catch {
      // Return whatever we have (could be null pre-tournament).
    }
  }
  return standingsCache.data || [];
};

const KNOCKOUT_STAGES = [
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

const getKnockoutBracket = async () => {
  return matchModel
    .find({ round: { $in: KNOCKOUT_STAGES } })
    .sort({ utcDate: 1 })
    .lean();
};

// Grade all ungraded predictions for finished matches and award XP.
const gradePredictions = async () => {
  const { recordActivity } = require("./engagement.service");

  const finished = await matchModel
    .find({ status: "FINISHED", graded: false })
    .lean();

  for (const match of finished) {
    const home = match.score?.home ?? null;
    const away = match.score?.away ?? null;
    if (home === null || away === null) continue;

    const correctPick =
      home > away ? "home" : away > home ? "away" : "draw";

    const preds = await predictionModel.find({
      matchId: match.matchId,
      correct: null,
    });

    for (const pred of preds) {
      const isCorrect = pred.pick === correctPick;
      pred.correct = isCorrect;
      pred.xpAwarded = isCorrect ? PREDICTION_XP : 0;
      await pred.save();

      if (isCorrect) {
        try {
          await recordActivity(pred.clerkUserId, "predict_match_correct");
        } catch {
          // Non-fatal.
        }
      }
    }

    await matchModel.findOneAndUpdate(
      { matchId: match.matchId },
      { graded: true }
    );
  }
};

// Grade bracket picks for newly finished knockout matches.
const gradeBracket = async () => {
  const bracketModel = require("../models/bracket.model");
  const finished = await matchModel
    .find({ status: "FINISHED", round: { $in: KNOCKOUT_STAGES } })
    .lean();

  for (const match of finished) {
    const home = match.score?.home ?? null;
    const away = match.score?.away ?? null;
    if (home === null || away === null) continue;

    const winner =
      home > away
        ? match.homeTeam?.name
        : away > home
          ? match.awayTeam?.name
          : null;
    if (!winner) continue;

    const brackets = await bracketModel.find({
      "picks.matchId": match.matchId,
    });

    for (const b of brackets) {
      const pick = b.picks.find((p) => p.matchId === match.matchId);
      if (!pick || pick.correct !== undefined) continue;
      pick.correct = pick.pick === winner;
      if (pick.correct) b.score += BRACKET_XP;
      await b.save();
    }
  }
};

// Start a background sync loop: runs immediately, then every 30 minutes.
const startSyncLoop = () => {
  const run = async () => {
    try {
      const n = await syncMatches();
      await gradeBracket();
      console.log(`[match-sync] synced ${n} matches`);
    } catch (err) {
      console.warn("[match-sync] error:", err.message);
    }
  };

  run();
  setInterval(run, 30 * 60 * 1000);
};

module.exports = {
  syncMatches,
  getMatchesToday,
  getLiveAndToday,
  getGroupStandings,
  getKnockoutBracket,
  gradePredictions,
  gradeBracket,
  startSyncLoop,
};
