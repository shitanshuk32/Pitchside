const express = require("express");
const cors = require("cors");
const multer = require("multer");
const {
  clerkMiddleware,
  requireAuth,
  getAuth,
  clerkClient,
} = require("@clerk/express");
const uploadFile = require("./services/storage.service");
const postModel = require("./models/post.model");
const scoreModel = require("./models/score.model");

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
app.use(clerkMiddleware());

const upload = multer({ storage: multer.memoryStorage() });

// ---- Health check (used by hosting platforms to verify the service is up) ----
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", service: "pitchside-api" });
});

// Largest sane score for the Free Kick Challenge — basic anti-cheat guard.
const MAX_REASONABLE_SCORE = 9999;

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

// ---- Posts ----
app.post(
  "/create_a_post",
  requireAuth(),
  upload.single("image"),
  async (req, res) => {
    const result = await uploadFile(req.file);

    const post = await postModel.create({
      image: result.url,
      caption: req.body.caption,
    });

    return res.status(201).json({
      message: "Post created successfully...",
      post,
    });
  }
);

app.get("/get_all_posts", async (req, res) => {
  const post = await postModel.find();
  return res.status(200).json({
    message: "Post created successfully",
    post,
  });
});

// ---- Leaderboard ----
// Submit a score; we only keep the user's personal best.
app.post("/leaderboard/score", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const raw = Number(req.body?.score);

    if (!Number.isFinite(raw) || raw < 0) {
      return res.status(400).json({ message: "Invalid score" });
    }
    const score = Math.min(Math.floor(raw), MAX_REASONABLE_SCORE);

    const { username, imageUrl } = await resolveProfile(userId);

    const existing = await scoreModel.findOne({ clerkUserId: userId });
    const bestScore = Math.max(existing?.bestScore || 0, score);

    const entry = await scoreModel.findOneAndUpdate(
      { clerkUserId: userId },
      { clerkUserId: userId, username, imageUrl, bestScore },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      message: "Score saved",
      bestScore: entry.bestScore,
      improved: bestScore > (existing?.bestScore || 0),
    });
  } catch (err) {
    console.log("Error saving score", err);
    return res.status(500).json({ message: "Could not save score" });
  }
});

// Public top list. Optionally returns the caller's own rank when signed in.
app.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const top = await scoreModel
      .find()
      .sort({ bestScore: -1, updatedAt: 1 })
      .limit(limit)
      .lean();

    const players = await scoreModel.estimatedDocumentCount();

    const leaders = top.map((e, i) => ({
      rank: i + 1,
      username: e.username,
      imageUrl: e.imageUrl,
      bestScore: e.bestScore,
      clerkUserId: e.clerkUserId,
    }));

    let me = null;
    const { userId } = getAuth(req) || {};
    if (userId) {
      const mine = await scoreModel.findOne({ clerkUserId: userId }).lean();
      if (mine) {
        const rank =
          (await scoreModel.countDocuments({
            bestScore: { $gt: mine.bestScore },
          })) + 1;
        me = {
          rank,
          username: mine.username,
          imageUrl: mine.imageUrl,
          bestScore: mine.bestScore,
          clerkUserId: mine.clerkUserId,
        };
      }
    }

    return res.status(200).json({ leaders, players, me });
  } catch (err) {
    console.log("Error loading leaderboard", err);
    return res.status(500).json({ message: "Could not load leaderboard" });
  }
});

module.exports = app;
