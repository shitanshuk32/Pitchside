const { clerkClient } = require("@clerk/express");
const energyReminderModel = require("../models/energyReminder.model");
const { sendEmail, isEmailConfigured } = require("./email.service");

// Email goes out this long before the energy actually refills, so the player
// gets a heads-up that their shots are "about to" be ready.
const REMIND_LEAD_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// The link in the email points back at the game.
const siteUrl = () =>
  (process.env.CLIENT_ORIGIN || "").split(",")[0] || "https://pitchside.app";

const scheduleReminder = (clerkUserId, refillAt) =>
  energyReminderModel.findOneAndUpdate(
    { clerkUserId },
    { refillAt: new Date(refillAt) },
    { returnDocument: "after", upsert: true }
  );

const cancelReminder = (clerkUserId) =>
  energyReminderModel.deleteOne({ clerkUserId });

// Resolve the user's primary email address from Clerk.
const resolveEmail = async (clerkUserId) => {
  const user = await clerkClient.users.getUser(clerkUserId);
  const primary =
    user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId) ||
    user.emailAddresses?.[0];
  const name =
    user.firstName || user.username || (primary?.emailAddress || "").split("@")[0];
  return { email: primary?.emailAddress || null, name: name || "Player" };
};

const buildEmail = (name, refillAt) => {
  const minutes = Math.max(1, Math.round((refillAt - Date.now()) / 60000));
  const when =
    refillAt <= Date.now()
      ? "now"
      : `in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const url = siteUrl();
  return {
    subject: "⚡ Your free kicks are about to refill!",
    text:
      `Hey ${name},\n\n` +
      `Your energy in the Pitchside Free Kick Challenge refills ${when}. ` +
      `Come back and take your 3 shots — every goal counts toward the leaderboard!\n\n` +
      `Play now: ${url}\n\n— Pitchside`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#111827;border-radius:16px;color:#fff">
        <h2 style="margin:0 0 8px;font-size:20px">⚡ Energy almost refilled!</h2>
        <p style="margin:0 0 16px;color:#d1d5db;line-height:1.5">
          Hey ${name}, your free kicks refill <strong style="color:#fbbf24">${when}</strong>.
          Come back and take your 3 shots — every goal counts toward the leaderboard! ⚽
        </p>
        <a href="${url}" style="display:inline-block;padding:12px 28px;border-radius:999px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-weight:700;text-decoration:none">
          Take your shots
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">— Pitchside</p>
      </div>`,
  };
};

// Find reminders whose refill is within the lead window, email each user, and
// delete the doc (one-shot). Failures also drop the doc so a bad address can't
// be retried forever every sweep.
const sweepDueReminders = async () => {
  const due = await energyReminderModel
    .find({ refillAt: { $lte: new Date(Date.now() + REMIND_LEAD_MS) } })
    .lean();

  for (const r of due) {
    try {
      const { email, name } = await resolveEmail(r.clerkUserId);
      if (email) {
        const { subject, text, html } = buildEmail(name, r.refillAt.getTime());
        await sendEmail({ to: email, subject, text, html });
        console.log(`[reminder] emailed ${email} (refill ${r.refillAt.toISOString()})`);
      }
    } catch (err) {
      console.warn(`[reminder] failed for ${r.clerkUserId}:`, err.message);
    } finally {
      await energyReminderModel.deleteOne({ _id: r._id });
    }
  }
};

// Background loop: checks every minute for reminders that are due.
const startReminderLoop = () => {
  if (!isEmailConfigured()) {
    console.warn(
      "[reminder] SMTP env vars not set (SMTP_HOST/SMTP_USER/SMTP_PASS) — energy refill emails are disabled"
    );
    return;
  }
  const run = () =>
    sweepDueReminders().catch((err) =>
      console.warn("[reminder] sweep error:", err.message)
    );
  run();
  setInterval(run, SWEEP_INTERVAL_MS);
};

module.exports = { scheduleReminder, cancelReminder, startReminderLoop };
