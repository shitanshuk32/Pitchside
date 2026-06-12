// One-off maintenance: drop unique indexes left over from old schema versions
// (e.g. `userId_1` on scores — the current schema keys on `clerkUserId`).
require("dotenv").config();
const mongoose = require("mongoose");

const STALE = { scores: ["userId_1"], engagements: ["userId_1"] };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  for (const [collName, staleNames] of Object.entries(STALE)) {
    const coll = db.collection(collName);
    let indexes;
    try {
      indexes = await coll.indexes();
    } catch {
      console.log(`[skip] collection "${collName}" not found`);
      continue;
    }
    console.log(
      `[${collName}] indexes:`,
      indexes.map((i) => i.name).join(", ")
    );
    for (const name of staleNames) {
      if (indexes.some((i) => i.name === name)) {
        await coll.dropIndex(name);
        console.log(`[${collName}] dropped stale index ${name}`);
      }
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
