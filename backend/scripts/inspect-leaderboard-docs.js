// Read-only: print all score + engagement docs to diagnose duplicate
// leaderboard entries.
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const scores = await db.collection("scores").find().toArray();
  console.log("--- scores ---");
  for (const s of scores) {
    console.log({
      _id: String(s._id),
      clerkUserId: s.clerkUserId,
      userId: s.userId,
      username: s.username,
      totalScore: s.totalScore,
      best: s.best,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });
  }

  const engagements = await db.collection("engagements").find().toArray();
  console.log("--- engagements ---");
  for (const e of engagements) {
    console.log({
      _id: String(e._id),
      clerkUserId: e.clerkUserId,
      username: e.username,
      totalXp: e.totalXp,
      streak: e.streak,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    });
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
