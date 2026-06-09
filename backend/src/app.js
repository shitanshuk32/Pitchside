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

// Supported reactions. The heart is the default and absorbs legacy likes.
const REACTION_EMOJIS = ["❤️", "⚽", "🔥", "😱", "🐐", "👏"];

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
  createdAt: post.createdAt,
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
  requireAuth(),
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
app.post("/create_a_text_post", requireAuth(), async (req, res) => {
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

// Toggle a like for the signed-in user.
app.post("/posts/:id/like", requireAuth(), async (req, res) => {
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
app.post("/posts/:id/react", requireAuth(), async (req, res) => {
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
    return res.status(200).json(summarizeReactions(post, userId));
  } catch (err) {
    console.log("Error reacting", err);
    return res.status(500).json({ message: "Could not react" });
  }
});

// Add a comment as the signed-in user.
app.post("/posts/:id/comment", requireAuth(), async (req, res) => {
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
