const matchModel = require("../models/match.model");
const predictionModel = require("../models/prediction.model");
const cacheModel = require("../models/cache.model");

const BASE_URL = "https://api.football-data.org/v4";
const WC_CODE = "WC"; // football-data.org competition code for FIFA World Cup
const PREDICTION_XP = 15;
const BRACKET_XP = 20;
const STANDINGS_KEY = "wc_standings";
const STANDINGS_TTL = 30 * 60 * 1000; // 30 minutes

// In-memory cache for standings (hydrated from the DB on first use and
// refreshed with each sync cycle).
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

// Fetch and cache World Cup matches for a window around today. We look back a
// few days as well as forward so recently finished matches get their final
// status + score synced (which lets gradePredictions resolve those picks),
// instead of being stuck "upcoming" forever once they leave a forward-only
// window.
const syncMatches = async () => {
  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 3);
  const dateFrom = past.toISOString().slice(0, 10);
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 2);
  const dateTo = future.toISOString().slice(0, 10);

  const data = await apiFetch(
    `/competitions/${WC_CODE}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`
  );

  const matches = data.matches || [];
  for (const m of matches) {
    const shaped = shapeMatch(m);
    await matchModel.findOneAndUpdate(
      { matchId: shaped.matchId },
      shaped,
      { upsert: true, returnDocument: "after" }
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
  const standings = data.standings || [];
  standingsCache = { data: standings, fetchedAt: Date.now() };
  // Persist so a restart can serve standings instantly without a live fetch.
  try {
    await cacheModel.findOneAndUpdate(
      { key: STANDINGS_KEY },
      { data: standings },
      { upsert: true }
    );
  } catch {
    // Non-fatal — the in-memory cache still works for this process.
  }
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
  // Cold in-memory cache (e.g. after a restart)? Hydrate from the DB first so
  // we can answer instantly instead of waiting on the third-party API.
  if (!standingsCache.data) {
    try {
      const cached = await cacheModel.findOne({ key: STANDINGS_KEY }).lean();
      if (cached) {
        standingsCache = {
          data: cached.data || [],
          fetchedAt: new Date(cached.updatedAt).getTime() || 0,
        };
      }
    } catch {
      // Ignore — fall through to a live fetch.
    }
  }

  const hasData = standingsCache.data && standingsCache.data.length > 0;
  const stale = Date.now() - standingsCache.fetchedAt > STANDINGS_TTL;

  // Nothing cached yet → we have to fetch once (blocking) so the client gets
  // something. Otherwise serve what we have and only refresh in the background
  // when it's stale, so the slow external call never blocks the response.
  if (!hasData) {
    try {
      await syncStandings();
    } catch {
      // Pre-tournament / rate-limited — return whatever we have.
    }
  } else if (stale) {
    syncStandings().catch(() => {});
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

// Backfill final scores for any match a user predicted on that we haven't been
// able to grade yet. The rolling sync window only covers a few days around
// today, so matches that kicked off earlier (and never got their result saved)
// would stay "upcoming" forever. This fetches those fixtures directly by id
// from the API, saves their final score/status, then grades the open picks.
// It is self-limiting: once a match is FINISHED + graded it's skipped, so the
// work shrinks to nothing as everything resolves.
const backfillPredictedMatches = async () => {
  // Distinct matches that still have at least one ungraded prediction.
  const pendingIds = await predictionModel.distinct("matchId", {
    correct: null,
  });
  if (!pendingIds.length) return 0;

  const stored = await matchModel
    .find({ matchId: { $in: pendingIds } })
    .lean();
  const storedMap = new Map(stored.map((m) => [m.matchId, m]));

  const now = Date.now();
  const needFetch = pendingIds.filter((id) => {
    const m = storedMap.get(id);
    if (!m) return true; // we don't have this match cached at all — fetch it
    const hasScore = m.score?.home != null && m.score?.away != null;
    if (m.status === "FINISHED" && hasScore) return false; // already resolvable
    // Only chase matches that have already kicked off; future ones get picked
    // up by the normal forward sync window and don't need backfilling yet.
    const kickoff = m.utcDate ? new Date(m.utcDate).getTime() : 0;
    return kickoff > 0 && kickoff < now;
  });
  if (!needFetch.length) return 0;

  let fetched = 0;
  // football-data.org lets us request several matches in one call via ?ids=.
  // Batch them and pause between batches to respect the free-tier rate limit
  // (~10 requests/minute).
  const BATCH = 20;
  for (let i = 0; i < needFetch.length; i += BATCH) {
    const chunk = needFetch.slice(i, i + BATCH);
    try {
      const data = await apiFetch(`/matches?ids=${chunk.join(",")}`);
      for (const m of data.matches || []) {
        const shaped = shapeMatch(m);
        await matchModel.findOneAndUpdate({ matchId: shaped.matchId }, shaped, {
          upsert: true,
          returnDocument: "after",
        });
        fetched += 1;
      }
    } catch (err) {
      console.warn("[backfill] batch failed:", err.message);
    }
    if (i + BATCH < needFetch.length) {
      await new Promise((r) => setTimeout(r, 6500));
    }
  }

  await gradePredictions();
  return fetched;
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
      const back = await backfillPredictedMatches();
      await gradeBracket();
      console.log(
        `[match-sync] synced ${n} matches` +
          (back ? `, backfilled ${back} predicted matches` : "")
      );
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
  backfillPredictedMatches,
  startSyncLoop,
};
