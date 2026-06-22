const express = require("express");
const cors = require("cors");
const multer = require("multer");
const {
  clerkMiddleware,
  getAuth,
  clerkClient,
} = require("@clerk/express");
const uploadFile = require("./services/storage.service");
const postModel = require("./models/post.model");
const scoreModel = require("./models/score.model");
const engagementModel = require("./models/engagement.model");
const predictionModel = require("./models/prediction.model");
const bracketModel = require("./models/bracket.model");
const matchModel = require("./models/match.model");
const xpEventModel = require("./models/xpEvent.model");
const {
  getEngagementToday,
  recordActivity,
  revokeChallengeXp,
} = require("./services/engagement.service");
const {
  logXpEvent,
  removeXpEvent,
  backfillXpLedger,
} = require("./services/xpLedger.service");

// UTC day key (YYYY-MM-DD) used to stamp which day a post's XP was credited.
const getDateKey = () => new Date().toISOString().slice(0, 10);
const {
  getMatchesToday,
  getLiveAndToday,
  getGroupStandings,
  getKnockoutBracket,
  backfillPredictedMatches,
  startSyncLoop,
} = require("./services/match.service");
const {
  scheduleReminder,
  cancelReminder,
  startReminderLoop,
} = require("./services/reminder.service");

const app = express();

// ---- Middlewares ----
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(",")
      : true,
  })
);
app.use(express.json());
// Attaches auth context (req.auth) to every request when a session is present.
app.use(clerkMiddleware({ telemetry: { disabled: true } }));

// Route guard for endpoints that require a signed-in user. Replaces Clerk's
// deprecated requireAuth() — same behaviour (401 when there's no session),
// built on clerkMiddleware() + getAuth() as recommended.
const requireUser = (req, res, next) => {
  const { userId } = getAuth(req) || {};
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  return next();
};

const upload = multer({ storage: multer.memoryStorage() });

// ---- Health check (used by hosting platforms to verify the service is up) ----
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", service: "pitchside-api" });
});

// Largest sane score for the Free Kick Challenge — basic anti-cheat guard.
const MAX_REASONABLE_SCORE = 9999;

// The leaderboard ranks everyone by a single unified XP total that blends
// every way to earn points: free-kick goals, match predictions and daily
// challenges. Each goal scored in the swipe game is worth this much XP.
const GOAL_XP = 10;

// XP needed per level (mirrors the client's hero card maths).
const LEVEL_SIZE = 1000;

// Resolve a friendly display name + avatar from the authenticated Clerk user.
const resolveProfile = async (userId) => {
  const user = await clerkClient.users.getUser(userId);
  const name =
    user.username ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    (user.emailAddresses?.[0]?.emailAddress || "").split("@")[0] ||
    "Player";
  return { username: name, imageUrl: user.imageUrl || "" };
};

// Supported reactions. The heart is the default and absorbs legacy likes.
const REACTION_EMOJIS = ["❤️", "⚽", "🔥", "😂", "😱", "🐐", "👏"];

// Build the per-emoji counts + the caller's current reaction. Legacy heart
// "likes" (from before reactions existed) are folded into the ❤️ count, and a
// user is only ever counted once (the react route migrates them out of likes).
const summarizeReactions = (post, viewerId) => {
  const counts = new Map();
  for (const r of post.reactions || []) {
    if (!REACTION_EMOJIS.includes(r.emoji)) continue;
    counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
  }
  const legacyLikes = (post.likes || []).length;
  if (legacyLikes) counts.set("❤️", (counts.get("❤️") || 0) + legacyLikes);

  const reactions = REACTION_EMOJIS.filter((e) => counts.get(e)).map(
    (emoji) => ({ emoji, count: counts.get(emoji) })
  );

  let myReaction = null;
  if (viewerId) {
    const mine = (post.reactions || []).find(
      (r) => r.clerkUserId === viewerId
    );
    if (mine) myReaction = mine.emoji;
    else if ((post.likes || []).includes(viewerId)) myReaction = "❤️";
  }
  return { reactions, myReaction };
};

// Shape a stored post for the client: summarize reactions, expose the caller's
// own reaction, and return only the public comment fields.
const shapePost = (post, viewerId) => ({
  _id: post._id,
  type: post.type || "image",
  image: post.image,
  caption: post.caption,
  author: post.author?.clerkUserId ? post.author : null,
  isOwner: !!viewerId && post.author?.clerkUserId === viewerId,
  createdAt: post.createdAt,
  // XP this post earned (0 for repeat posts that earned nothing). Lets the owner
  // be warned before deleting the one post that's holding their challenge XP.
  earnedXp: post.xpAward?.xp || 0,
  ...summarizeReactions(post, viewerId),
  commentCount: (post.comments || []).length,
  comments: (post.comments || []).map((c) => ({
    _id: c._id,
    username: c.username,
    imageUrl: c.imageUrl,
    text: c.text,
    createdAt: c.createdAt,
  })),
});

// ---- Posts ----
app.post(
  "/create_a_post",
  requireUser,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "An image is required" });
      }

      const { userId } = getAuth(req);
      const author = await resolveProfile(userId);
      const result = await uploadFile(req.file);

      const post = await postModel.create({
        image: result.url,
        caption: req.body.caption,
        author: { clerkUserId: userId, ...author },
      });

      const award = await recordActivity(userId, "create_post", () =>
        Promise.resolve(author)
      );
      // Only the post that actually earned the XP carries the award, so deleting
      // a repeat post the same day never costs the user any XP.
      if (award?.ok && !award.alreadyDone && !award.skipped && award.newXp) {
        post.xpAward = {
          challengeId: "create_post",
          xp: award.newXp,
          dateKey: getDateKey(),
        };
        await post.save();
      }

      return res.status(201).json({
        message: "Post created successfully...",
        post: shapePost(post, userId),
      });
    } catch (err) {
      console.log("Error creating post", err);
      return res.status(500).json({ message: "Could not create post" });
    }
  }
);

// Create a text-only "Chant" post — no file upload, just a short caption.
app.post("/create_a_text_post", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const caption = String(req.body?.text ?? req.body?.caption ?? "").trim();

    if (!caption) {
      return res.status(400).json({ message: "Your chant can't be empty" });
    }
    if (caption.length > 280) {
      return res.status(400).json({ message: "Chant is too long" });
    }

    const author = await resolveProfile(userId);
    const post = await postModel.create({
      type: "text",
      caption,
      author: { clerkUserId: userId, ...author },
    });

    const award = await recordActivity(userId, "post_chant", () =>
      Promise.resolve(author)
    );
    if (award?.ok && !award.alreadyDone && !award.skipped && award.newXp) {
      post.xpAward = {
        challengeId: "post_chant",
        xp: award.newXp,
        dateKey: getDateKey(),
      };
      await post.save();
    }

    return res.status(201).json({
      message: "Chant posted successfully...",
      post: shapePost(post, userId),
    });
  } catch (err) {
    console.log("Error creating text post", err);
    return res.status(500).json({ message: "Could not post chant" });
  }
});

app.get("/get_all_posts", async (req, res) => {
  const posts = await postModel.find().sort({ createdAt: -1 }).lean();
  const { userId } = getAuth(req) || {};
  return res.status(200).json({
    message: "Posts loaded successfully",
    post: posts.map((p) => shapePost(p, userId)),
  });
});

// Delete a post / chant. Only the author may remove their own post.
app.delete("/posts/:id", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const post = await postModel.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.author?.clerkUserId !== userId) {
      return res
        .status(403)
        .json({ message: "You can only delete your own post" });
    }

    const award = post.xpAward;
    await post.deleteOne();

    // If this exact post earned challenge XP, take just that XP back — nothing
    // else the user earned today or since is affected.
    let revokedXp = 0;
    if (award?.xp) {
      try {
        const result = await revokeChallengeXp(
          userId,
          award.challengeId,
          award.xp,
          award.dateKey
        );
        if (result?.ok) revokedXp = result.removedXp;
      } catch (revokeErr) {
        // Non-fatal: the post is already gone; XP can self-correct on next earn.
        console.log("Error revoking post XP", revokeErr);
      }
      // Drop the matching ledger row so the history stays in sync. Re-earning
      // the challenge re-creates it.
      await removeXpEvent(userId, `daily:${award.dateKey}:${award.challengeId}`);
    }

    return res.status(200).json({ message: "Post deleted", revokedXp });
  } catch (err) {
    console.log("Error deleting post", err);
    return res.status(500).json({ message: "Could not delete post" });
  }
});

// Toggle a like for the signed-in user.
app.post("/posts/:id/like", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const post = await postModel.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const idx = post.likes.indexOf(userId);
    const liked = idx === -1;
    if (liked) post.likes.push(userId);
    else post.likes.splice(idx, 1);

    await post.save();
    return res.status(200).json({ liked, likeCount: post.likes.length });
  } catch (err) {
    console.log("Error toggling like", err);
    return res.status(500).json({ message: "Could not update like" });
  }
});

// Set / change / clear the signed-in user's emoji reaction (one per user).
app.post("/posts/:id/react", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const emoji = String(req.body?.emoji || "");
    if (!REACTION_EMOJIS.includes(emoji)) {
      return res.status(400).json({ message: "Unsupported reaction" });
    }

    const post = await postModel.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Migrate any legacy heart-like by this user into the reactions list so
    // they are never double-counted.
    post.likes = (post.likes || []).filter((id) => id !== userId);

    const idx = post.reactions.findIndex((r) => r.clerkUserId === userId);
    if (idx === -1) {
      post.reactions.push({ clerkUserId: userId, emoji });
    } else if (post.reactions[idx].emoji === emoji) {
      post.reactions.splice(idx, 1); // tapping the same emoji clears it
    } else {
      post.reactions[idx].emoji = emoji; // switch to the new emoji
    }

    await post.save();
    await recordActivity(userId, "react", () => resolveProfile(userId));

    return res.status(200).json(summarizeReactions(post, userId));
  } catch (err) {
    console.log("Error reacting", err);
    return res.status(500).json({ message: "Could not react" });
  }
});

// Add a comment as the signed-in user.
app.post("/posts/:id/comment", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }
    if (text.length > 280) {
      return res.status(400).json({ message: "Comment is too long" });
    }

    const post = await postModel.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const { username, imageUrl } = await resolveProfile(userId);
    post.comments.push({ clerkUserId: userId, username, imageUrl, text });
    await post.save();

    const added = post.comments[post.comments.length - 1];
    return res.status(201).json({
      comment: {
        _id: added._id,
        username: added.username,
        imageUrl: added.imageUrl,
        text: added.text,
        createdAt: added.createdAt,
      },
      commentCount: post.comments.length,
    });
  } catch (err) {
    console.log("Error adding comment", err);
    return res.status(500).json({ message: "Could not add comment" });
  }
});

// ---- World Cup engagement (daily challenges + streaks) ----
app.get("/engagement/today", async (req, res) => {
  try {
    const { userId } = getAuth(req) || {};
    const payload = await getEngagementToday(userId);
    return res.status(200).json(payload);
  } catch (err) {
    console.log("Error loading engagement", err);
    return res.status(500).json({ message: "Could not load daily challenges" });
  }
});

app.post("/engagement/activity", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const type = String(req.body?.type || "");
    const result = await recordActivity(userId, type, () =>
      resolveProfile(userId)
    );

    if (!result.ok) {
      return res.status(400).json({ message: "Invalid activity" });
    }

    return res.status(200).json({
      message: result.alreadyDone ? "Already completed" : "Challenge complete",
      newXp: result.newXp || 0,
      ...result.payload,
    });
  } catch (err) {
    console.log("Error recording activity", err);
    return res.status(500).json({ message: "Could not record activity" });
  }
});

// ---- Leaderboard ----
// Add goals to the user's running tournament total. The body carries `goals`
// (the number of new goals scored since the client last synced), which we
// accumulate onto the existing total.
app.post("/leaderboard/score", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const raw = Number(req.body?.goals ?? req.body?.score);

    if (!Number.isFinite(raw) || raw <= 0) {
      return res.status(400).json({ message: "Invalid goal count" });
    }
    // Clamp a single submission so a bad client can't inflate the total.
    const delta = Math.min(Math.floor(raw), MAX_REASONABLE_SCORE);

    const { username, imageUrl } = await resolveProfile(userId);

    // Goals are submitted in quick succession, so concurrent first-time
    // submissions can race to create the (unique) score doc. Retry once on a
    // duplicate-key error — the second attempt finds the doc and just $inc's.
    const upsertScore = () =>
      scoreModel.findOneAndUpdate(
        { clerkUserId: userId },
        { $inc: { totalScore: delta }, $set: { username, imageUrl } },
        { returnDocument: "after", upsert: true }
      );

    let entry;
    try {
      entry = await upsertScore();
    } catch (err) {
      if (err && err.code === 11000) {
        entry = await upsertScore();
      } else {
        throw err;
      }
    }

    // Itemise this batch of goals in the XP ledger (one row per submission).
    await logXpEvent({
      clerkUserId: userId,
      source: "goals",
      amount: delta * GOAL_XP,
      refId: `goals:${userId}:${Date.now()}`,
      detail: `${delta} goal${delta === 1 ? "" : "s"} × ${GOAL_XP} XP`,
    });

    return res.status(200).json({
      message: "Goals counted",
      totalScore: entry.totalScore,
    });
  } catch (err) {
    console.log("Error saving score", err);
    return res.status(500).json({ message: "Could not save score" });
  }
});

// Reconcile the server total down to the client's true local goal count. The
// client's localStorage counter is incremented exactly once per goal and is
// never double-counted, so it's the source of truth for undoing any historical
// over-count (e.g. from the old overlapping-submit bug). This can ONLY LOWER a
// total — never raise it — so a tampered client can't use it to award goals.
app.post("/leaderboard/reconcile", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const clientTotal = Math.floor(Number(req.body?.total));

    if (!Number.isFinite(clientTotal) || clientTotal < 0) {
      return res.status(400).json({ message: "Invalid total" });
    }

    const score = await scoreModel.findOne({ clerkUserId: userId });
    if (!score) return res.status(200).json({ totalScore: 0 });

    if (clientTotal < score.totalScore) {
      score.totalScore = clientTotal;
      await score.save();
      // Let the XP ledger re-derive its goal rows from the corrected total on
      // the next profile load (dropping the marker re-runs the idempotent,
      // self-reconciling backfill; dropping the aggregate forces a fresh sum).
      await xpEventModel.deleteOne({ clerkUserId: userId, refId: `marker:${userId}` });
      await xpEventModel.deleteOne({ clerkUserId: userId, refId: `goals:init:${userId}` });
    }

    return res.status(200).json({ totalScore: score.totalScore });
  } catch (err) {
    console.log("Error reconciling score", err);
    return res.status(500).json({ message: "Could not reconcile score" });
  }
});

// Build the unified ranking once — the single source of truth for both the
// public leaderboard and an individual user's rank. Merges the two XP sources
// (goals scored + prediction/challenge XP) into one combined total per player.
const buildUnifiedRanking = async () => {
  const [scores, engagements] = await Promise.all([
    scoreModel.find().select("clerkUserId username imageUrl totalScore").lean(),
    engagementModel
      .find()
      .select("clerkUserId username imageUrl totalXp")
      .lean(),
  ]);

  const byUser = new Map();
  const ensure = (id) => {
    let u = byUser.get(id);
    if (!u) {
      u = { clerkUserId: id, username: "", imageUrl: "", goals: 0, xp: 0 };
      byUser.set(id, u);
    }
    return u;
  };

  // Goals contribute GOAL_XP each toward the unified total.
  for (const s of scores) {
    const u = ensure(s.clerkUserId);
    u.goals = s.totalScore || 0;
    u.xp += (s.totalScore || 0) * GOAL_XP;
    if (s.username) u.username = s.username;
    if (s.imageUrl) u.imageUrl = s.imageUrl;
  }

  // Prediction + daily-challenge XP is already accumulated on engagement.
  for (const e of engagements) {
    const u = ensure(e.clerkUserId);
    u.xp += e.totalXp || 0;
    if (!u.username && e.username) u.username = e.username;
    if (!u.imageUrl && e.imageUrl) u.imageUrl = e.imageUrl;
  }

  return [...byUser.values()]
    .filter((u) => u.xp > 0)
    .sort((a, b) => b.xp - a.xp || b.goals - a.goals);
};

// Public top list, ranked by unified XP. Optionally returns the caller's own
// rank when signed in.
app.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const ranked = await buildUnifiedRanking();
    const players = ranked.length;

    const shape = (u, rank) => ({
      rank,
      username: u.username || "Player",
      imageUrl: u.imageUrl,
      xp: u.xp,
      goals: u.goals,
      clerkUserId: u.clerkUserId,
    });

    const leaders = ranked.slice(0, limit).map((u, i) => shape(u, i + 1));

    let me = null;
    const { userId } = getAuth(req) || {};
    if (userId) {
      const idx = ranked.findIndex((u) => u.clerkUserId === userId);
      if (idx !== -1) me = shape(ranked[idx], idx + 1);
    }

    return res.status(200).json({ leaders, players, me });
  } catch (err) {
    console.log("Error loading leaderboard", err);
    return res.status(500).json({ message: "Could not load leaderboard" });
  }
});

// ---- Matches: shared data layer ----

// Shape a cached match document into a clean API response.
const shapeMatchResponse = (m) => ({
  matchId: m.matchId,
  homeTeam: m.homeTeam,
  awayTeam: m.awayTeam,
  utcDate: m.utcDate,
  status: m.status,
  minute: m.minute,
  score: m.score,
  goals: m.goals || [],
  cards: m.cards || [],
  round: m.round,
  group: m.group,
  venue: m.venue,
});

// Count community predictions for a list of matchIds and return pick percentages.
const communityStats = async (matchIds) => {
  const agg = await predictionModel.aggregate([
    { $match: { matchId: { $in: matchIds } } },
    {
      $group: {
        _id: { matchId: "$matchId", pick: "$pick" },
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = {};
  for (const { _id, count } of agg) {
    const mid = _id.matchId;
    if (!stats[mid]) stats[mid] = { home: 0, draw: 0, away: 0, total: 0 };
    stats[mid][_id.pick] = count;
    stats[mid].total += count;
  }

  const result = {};
  for (const [mid, s] of Object.entries(stats)) {
    const t = s.total || 1;
    result[mid] = {
      home: Math.round((s.home / t) * 100),
      draw: Math.round((s.draw / t) * 100),
      away: Math.round((s.away / t) * 100),
    };
  }
  return result;
};

// Today's matches for the prediction polls.
app.get("/matches/today", async (req, res) => {
  try {
    const { userId } = getAuth(req) || {};
    const matches = await getMatchesToday();
    const matchIds = matches.map((m) => m.matchId);

    const [dbCommunity, userPicks] = await Promise.all([
      communityStats(matchIds),
      userId
        ? predictionModel
            .find({ clerkUserId: userId, matchId: { $in: matchIds } })
            .lean()
        : [],
    ]);

    const community = { ...dbCommunity };

    const pickMap = {};
    for (const p of userPicks) pickMap[p.matchId] = p;

    const now = Date.now();
    const data = matches.map((m) => {
      const myPick = pickMap[m.matchId];
      // Lock by BOTH a still-open status AND the kick-off time: the cached
      // status can lag behind reality (it only refreshes on the API sync), so
      // once kick-off has passed we close picks regardless of a stale status.
      const kickoff = m.utcDate ? new Date(m.utcDate).getTime() : 0;
      const canPick =
        ["SCHEDULED", "TIMED"].includes(m.status) && kickoff > now;
      return {
        ...shapeMatchResponse(m),
        canPick,
        myPick: myPick ? myPick.pick : null,
        correct: myPick?.correct ?? null,
        xpAwarded: myPick?.xpAwarded ?? 0,
        community: myPick || !canPick ? community[m.matchId] || null : null,
      };
    });

    return res.status(200).json({
      matches: data,
    });
  } catch (err) {
    console.log("Error loading today's matches", err);
    return res.status(500).json({ message: "Could not load matches" });
  }
});

// All of today's matches with live detail for the Match Centre.
app.get("/matches/live", async (req, res) => {
  try {
    const matches = await getLiveAndToday();
    return res.status(200).json({
      matches: matches.map(shapeMatchResponse),
    });
  } catch (err) {
    console.log("Error loading live matches", err);
    return res.status(500).json({ message: "Could not load live matches" });
  }
});

// Group standings for all 12 World Cup groups.
app.get("/matches/standings", async (req, res) => {
  try {
    const standings = await getGroupStandings();
    return res.status(200).json({ standings });
  } catch (err) {
    console.log("Error loading standings", err);
    return res.status(500).json({ message: "Could not load standings" });
  }
});

// Knockout bracket structure.
app.get("/matches/bracket", async (req, res) => {
  try {
    const { userId } = getAuth(req) || {};
    const matches = await getKnockoutBracket();
    const matchIds = matches.map((m) => m.matchId);

    const userBracket = userId
      ? await bracketModel.findOne({ clerkUserId: userId }).lean()
      : null;
    const pickMap = {};
    for (const p of userBracket?.picks || []) pickMap[p.matchId] = p;

    const data = matches.map((m) => {
      const myPick = pickMap[m.matchId];
      return {
        ...shapeMatchResponse(m),
        myPick: myPick?.pick || null,
      };
    });

    return res.status(200).json({
      matches: data,
      bracketScore: userBracket?.score || 0,
    });
  } catch (err) {
    console.log("Error loading bracket", err);
    return res.status(500).json({ message: "Could not load bracket" });
  }
});

// Manually trigger a backfill of final scores for predicted matches and grade
// any open picks. Useful right after deploying so old predictions resolve
// immediately instead of waiting for the next sync cycle.
app.post("/matches/backfill", requireUser, async (req, res) => {
  try {
    const fetched = await backfillPredictedMatches();
    return res.status(200).json({ message: "Backfill complete", fetched });
  } catch (err) {
    console.log("Error backfilling matches", err);
    return res.status(500).json({ message: "Could not backfill matches" });
  }
});

// ---- Predictions ----

// A match is open for picks only while it's still scheduled AND kick-off
// hasn't passed. The kick-off guard matters because the cached `status` can be
// stale (it only updates when the football-data sync runs), so a match that
// has already started could otherwise still look pickable.
const isPickOpen = (match) => {
  if (!match || !["SCHEDULED", "TIMED"].includes(match.status)) return false;
  const kickoff = match.utcDate ? new Date(match.utcDate).getTime() : 0;
  return kickoff > Date.now();
};

app.post("/predictions/:matchId", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const matchId = Number(req.params.matchId);
    const pick = String(req.body?.pick || "");

    if (!["home", "draw", "away"].includes(pick)) {
      return res.status(400).json({ message: "Invalid pick" });
    }

    const match = await matchModel.findOne({ matchId }).lean();
    if (!match) return res.status(404).json({ message: "Match not found" });

    if (!isPickOpen(match)) {
      return res.status(400).json({ message: "Predictions are locked for this match" });
    }

    const existing = await predictionModel.findOne({ clerkUserId: userId, matchId });
    if (existing) {
      existing.pick = pick;
      existing.correct = null;
      existing.xpAwarded = 0;
      await existing.save();
    } else {
      await predictionModel.create({ clerkUserId: userId, matchId, pick });
    }

    await recordActivity(userId, "predict_match", () => resolveProfile(userId));

    return res.status(200).json({ message: "Pick saved", pick });
  } catch (err) {
    console.log("Error saving prediction", err);
    return res.status(500).json({ message: "Could not save prediction" });
  }
});

// Remove a pick (lets the user undo a prediction before kick-off).
app.delete("/predictions/:matchId", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const matchId = Number(req.params.matchId);

    const match = await matchModel.findOne({ matchId }).lean();
    if (match && !isPickOpen(match)) {
      return res
        .status(400)
        .json({ message: "Predictions are locked for this match" });
    }

    await predictionModel.deleteOne({ clerkUserId: userId, matchId });
    return res.status(200).json({ message: "Pick removed" });
  } catch (err) {
    console.log("Error removing prediction", err);
    return res.status(500).json({ message: "Could not remove prediction" });
  }
});

app.get("/predictions/me", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const preds = await predictionModel.find({ clerkUserId: userId }).lean();

    const predMap = {};
    for (const p of preds) predMap[p.matchId] = p;

    // History shows every match that has already kicked off (so the user can
    // see which ones they skipped), plus any match they predicted on — even if
    // it hasn't started yet. Matches without a prediction are flagged
    // participated:false so the UI can show a "didn't predict" state instead of
    // a fake pick.
    const now = new Date();
    const matchDocs = await matchModel
      .find({
        $or: [
          { utcDate: { $lte: now } },
          { matchId: { $in: Object.keys(predMap).map(Number) } },
        ],
      })
      .sort({ utcDate: -1 })
      .lean();

    const total = preds.length;
    const graded = preds.filter((p) => p.correct !== null);
    const correct = graded.filter((p) => p.correct).length;
    const totalXp = preds.reduce((s, p) => s + (p.xpAwarded || 0), 0);

    const history = matchDocs.map((m) => {
      const p = predMap[m.matchId];
      return {
        matchId: m.matchId,
        homeTeam: m.homeTeam?.shortName || "?",
        awayTeam: m.awayTeam?.shortName || "?",
        homeName: m.homeTeam?.name || m.homeTeam?.shortName || null,
        awayName: m.awayTeam?.name || m.awayTeam?.shortName || null,
        status: m.status || null,
        utcDate: m.utcDate,
        participated: !!p,
        pick: p?.pick ?? null,
        correct: p?.correct ?? null,
        xpAwarded: p?.xpAwarded ?? 0,
        score: m.score,
      };
    });

    return res.status(200).json({ total, correct, totalXp, history });
  } catch (err) {
    console.log("Error loading predictions", err);
    return res.status(500).json({ message: "Could not load predictions" });
  }
});

// ---- Profile (a user's own posts + XP history) ----

// Every post the signed-in user has created, newest first.
app.get("/me/posts", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const posts = await postModel
      .find({ "author.clerkUserId": userId })
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ posts: posts.map((p) => shapePost(p, userId)) });
  } catch (err) {
    console.log("Error loading user posts", err);
    return res.status(500).json({ message: "Could not load your posts" });
  }
});

// A breakdown of where the user's XP came from, read straight from the per-event
// xpEvent ledger (one timestamped row per award site). Existing users are
// backfilled once, on first read, so their pre-ledger history shows up too.
app.get("/me/xp", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);

    // Reconstruct any pre-ledger history (idempotent; runs once per user).
    await backfillXpLedger(userId);

    const [eng, score, preds, postsCount, ranked, rows] = await Promise.all([
      engagementModel.findOne({ clerkUserId: userId }).lean(),
      scoreModel.findOne({ clerkUserId: userId }).lean(),
      predictionModel.find({ clerkUserId: userId }).select("correct").lean(),
      postModel.countDocuments({ "author.clerkUserId": userId }),
      buildUnifiedRanking(),
      xpEventModel
        .find({ clerkUserId: userId, source: { $ne: "marker" }, amount: { $gt: 0 } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const engXp = eng?.totalXp || 0;
    const goals = score?.totalScore || 0;
    const total = engXp + goals * GOAL_XP;

    const rankIdx = ranked.findIndex((u) => u.clerkUserId === userId);
    const rank = rankIdx === -1 ? null : rankIdx + 1;

    const events = rows.map((e) => ({
      source: e.source,
      label: e.label,
      detail: e.detail,
      emoji: e.emoji,
      amount: e.amount,
      date: e.createdAt,
    }));

    // Group the ledger by area for the summary chips on the profile.
    const breakdown = { challengesXp: 0, predictionsXp: 0, goalsXp: 0 };
    for (const e of events) {
      if (e.source === "goals") breakdown.goalsXp += e.amount;
      else if (e.source === "predict_match_correct")
        breakdown.predictionsXp += e.amount;
      else breakdown.challengesXp += e.amount;
    }

    return res.status(200).json({
      total,
      level: Math.floor(total / LEVEL_SIZE) + 1,
      xpInLevel: total % LEVEL_SIZE,
      levelSize: LEVEL_SIZE,
      rank,
      streak: eng?.streak || 0,
      longestStreak: eng?.longestStreak || 0,
      counts: {
        posts: postsCount,
        goals,
        totalPredictions: preds.length,
        correctPredictions: preds.filter((p) => p.correct === true).length,
      },
      breakdown,
      events,
    });
  } catch (err) {
    console.log("Error loading XP history", err);
    return res.status(500).json({ message: "Could not load XP history" });
  }
});

// ---- Bracket ----

app.post("/bracket", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const picks = req.body?.picks;

    if (!Array.isArray(picks)) {
      return res.status(400).json({ message: "picks must be an array" });
    }

    const knockoutMatches = await getKnockoutBracket();
    const openMatchIds = new Set(
      knockoutMatches
        .filter((m) => ["SCHEDULED", "TIMED"].includes(m.status))
        .map((m) => m.matchId)
    );

    const existing = await bracketModel.findOne({ clerkUserId: userId });
    const lockedPicks = (existing?.picks || []).filter(
      (p) => !openMatchIds.has(p.matchId)
    );
    const lockedIds = new Set(lockedPicks.map((p) => p.matchId));

    const newPicks = picks
      .filter((p) => p.matchId && p.pick && openMatchIds.has(p.matchId))
      .map((p) => ({ matchId: p.matchId, pick: String(p.pick) }));

    const merged = [
      ...lockedPicks,
      ...newPicks.filter((p) => !lockedIds.has(p.matchId)),
    ];

    const entry = await bracketModel.findOneAndUpdate(
      { clerkUserId: userId },
      { picks: merged },
      { returnDocument: "after", upsert: true }
    );

    return res.status(200).json({ message: "Bracket saved", picks: entry.picks, score: entry.score });
  } catch (err) {
    console.log("Error saving bracket", err);
    return res.status(500).json({ message: "Could not save bracket" });
  }
});

app.get("/bracket/me", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const b = await bracketModel.findOne({ clerkUserId: userId }).lean();
    return res.status(200).json({
      picks: b?.picks || [],
      score: b?.score || 0,
    });
  } catch (err) {
    console.log("Error loading bracket", err);
    return res.status(500).json({ message: "Could not load bracket" });
  }
});

// ---- Energy refill reminders ----
// The Free Kick game registers when the signed-in player's energy will refill;
// a background sweep emails them (via their Clerk email) shortly before it's
// ready. The energy itself still lives client-side — this only handles the
// "your energy is about to refill" nudge.
app.post("/energy/reminder", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const refillAt = Number(req.body?.refillAt);

    // Sanity window: must be in the future, and energy never takes more than
    // an hour to refill (small buffer for clock skew).
    const maxAhead = 65 * 60 * 1000;
    if (
      !Number.isFinite(refillAt) ||
      refillAt <= Date.now() ||
      refillAt > Date.now() + maxAhead
    ) {
      return res.status(400).json({ message: "Invalid refill time" });
    }

    await scheduleReminder(userId, refillAt);
    return res.status(200).json({ message: "Reminder scheduled" });
  } catch (err) {
    console.log("Error scheduling reminder", err);
    return res.status(500).json({ message: "Could not schedule reminder" });
  }
});

app.delete("/energy/reminder", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    await cancelReminder(userId);
    return res.status(200).json({ message: "Reminder cancelled" });
  } catch (err) {
    console.log("Error cancelling reminder", err);
    return res.status(500).json({ message: "Could not cancel reminder" });
  }
});

// Start the background match-sync loop when this module is loaded.
if (process.env.FOOTBALL_DATA_API_KEY) {
  startSyncLoop();
}

// Email sweep for energy refill reminders (no-op unless SMTP is configured).
startReminderLoop();

module.exports = app;
