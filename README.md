# Pitchside ⚽

A World Cup companion app: predict match results, climb a unified XP leaderboard, play a physics-based free-kick mini-game, follow live scores and standings, fill in a knockout bracket, and share photos/chants in a social feed — all gamified around a single tournament-long XP economy.

Pitchside is a two-part app:

- **`backend/`** — a Node.js + Express REST API backed by MongoDB (Mongoose), with Clerk for auth, ImageKit for image hosting, football-data.org for live match data, and SMTP (Nodemailer) for reminder emails.
- **`frontend/`** — a React 19 + Vite single-page app styled with Tailwind CSS v4, using Clerk for authentication and React Router for navigation.

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Tech Stack](#tech-stack)
3. [Repository Layout](#repository-layout)
4. [High-Level Architecture](#high-level-architecture)
5. [The XP Economy (the heart of the product)](#the-xp-economy)
6. [Data Model](#data-model)
7. [Backend Subsystems & Design Decisions](#backend-subsystems--design-decisions)
8. [Frontend Subsystems & Design Decisions](#frontend-subsystems--design-decisions)
9. [API Reference](#api-reference)
10. [Local Development](#local-development)
11. [Environment Variables](#environment-variables)
12. [Deployment](#deployment)
13. [Operational Scripts](#operational-scripts)
14. [Cross-Cutting Themes](#cross-cutting-themes-the-why-behind-the-code)

---

## Feature Overview

| Feature | Description |
| --- | --- |
| **Free Kick Challenge** | A swipe-to-shoot, physics-driven mini-game (curve, power, keeper, posts, FIFA goal-line rule). Each goal earns XP toward the leaderboard. Energy refills over time. |
| **Match Predictions** | Pick home/draw/away on today's fixtures. Locked at kick-off. Correct picks are auto-graded and awarded XP when the real result comes in. |
| **Knockout Bracket** | Advance teams through the knockout rounds; picks lock per-match at kick-off; correct picks score bracket XP. |
| **Match Centre** | Live and same-day fixtures with scores, scorers, cards, plus all 12 group standings. |
| **Social Feed** | Photo posts and text-only "Chants", with one-tap emoji reactions and comments. |
| **Unified Leaderboard** | A single ranking blending every XP source (goals + predictions + daily challenges). |
| **Daily Challenges & Streaks** | A fixed set of daily quests; completing activity keeps a daily streak alive. |
| **Profile & XP Ledger** | A per-user breakdown of where every XP point came from, with level/rank. |
| **Energy Refill Reminders** | Opt-in email + browser notification shortly before the free-kick energy refills. |

---

## Tech Stack

**Backend**
- Node.js (≥ 20), Express 5
- MongoDB via Mongoose 9
- `@clerk/express` — authentication / session verification
- `@imagekit/nodejs` — image upload & CDN hosting
- `multer` — multipart/form-data parsing (in-memory)
- `nodemailer` — SMTP email for reminders
- Native `fetch` (Node 20+) for the football-data.org integration
- `cors`, `dotenv`

**Frontend**
- React 19 + Vite 8
- Tailwind CSS v4 (`@tailwindcss/vite`)
- `@clerk/react` — auth UI + session tokens
- `react-router-dom` 7
- `framer-motion` — animations
- `axios` available, though the API layer mostly uses native `fetch`

**External services**
- **Clerk** — identity provider (the single source of truth for users; the app stores no passwords and no user table)
- **MongoDB Atlas** — primary datastore
- **ImageKit** — image storage / delivery
- **football-data.org** (v4 API, `WC` competition) — fixtures, scores, standings
- **SMTP provider** — any (Gmail app password, Resend, Brevo, Mailgun…)

---

## Repository Layout

```
Pitchside/
├── render.yaml                 # Render.com deploy spec for the backend
├── backend/
│   ├── server.js               # Entry point: load env, connect DB, listen
│   ├── src/
│   │   ├── app.js              # Express app: all routes + middleware (~1k lines)
│   │   ├── db/db.js            # Mongoose connection
│   │   ├── models/             # Mongoose schemas (see Data Model)
│   │   │   ├── post.model.js
│   │   │   ├── score.model.js
│   │   │   ├── engagement.model.js
│   │   │   ├── prediction.model.js
│   │   │   ├── bracket.model.js
│   │   │   ├── match.model.js
│   │   │   ├── xpEvent.model.js
│   │   │   ├── cache.model.js
│   │   │   └── energyReminder.model.js
│   │   └── services/           # Business logic, isolated from routes
│   │       ├── engagement.service.js   # daily challenges, streaks, XP awards
│   │       ├── xpLedger.service.js     # append-only XP event ledger + backfill
│   │       ├── match.service.js        # football-data sync, grading, backfill loop
│   │       ├── reminder.service.js     # energy refill email sweep loop
│   │       ├── email.service.js        # SMTP transport (provider-agnostic)
│   │       └── storage.service.js      # ImageKit upload
│   └── scripts/                # One-off maintenance / diagnostics
│       ├── drop-stale-indexes.js
│       └── inspect-leaderboard-docs.js
└── frontend/
    ├── index.html
    ├── vite.config.js          # React + Tailwind plugins
    ├── vercel.json             # SPA rewrites for Vercel
    └── src/
        ├── main.jsx            # ClerkProvider + Router bootstrap
        ├── App.jsx             # Route table (public + protected)
        ├── lib/
        │   ├── api.js          # Typed-ish fetch wrapper for all endpoints
        │   ├── engagement.js   # Fire-and-forget activity reporting
        │   ├── flags.js        # Country name → emoji flag
        │   ├── matchFacts.js
        │   └── redirect.js
        ├── components/         # Navbar, AuthControls, ProtectedRoute, etc.
        └── pages/              # Home, Feed, Predictions, Bracket, MatchCentre,
                                # Leaderboard, Profile, FreeKickGame, auth pages
```

---

## High-Level Architecture

```
                          ┌──────────────────────────────────────┐
                          │            Frontend (SPA)             │
                          │  React 19 + Vite + Tailwind + Clerk   │
                          │   (deployed on Vercel, static dist)   │
                          └───────────────┬──────────────────────┘
                                          │  HTTPS  (Bearer = Clerk session JWT)
                                          ▼
                          ┌──────────────────────────────────────┐
                          │          Backend REST API             │
                          │       Express 5 (on Render.com)       │
                          │  clerkMiddleware → requireUser guard   │
                          └───┬───────────────┬──────────────┬────┘
                              │               │              │
                ┌─────────────▼───┐   ┌───────▼──────┐   ┌───▼────────────┐
                │   MongoDB Atlas │   │   ImageKit   │   │ football-data  │
                │   (Mongoose)    │   │ (image CDN)  │   │   .org API     │
                └─────────────────┘   └──────────────┘   └────────────────┘
                              ▲                              ▲
                              │     Clerk (identity)         │ background
                              └──── SMTP (Nodemailer) ───────┘ sync loop
```

Two background loops run inside the API process (no separate worker/cron infra):

- **Match sync loop** — every 30 minutes: pull World Cup fixtures/scores/standings, grade predictions and brackets, and backfill any stalled results.
- **Reminder sweep loop** — every minute: email users whose free-kick energy is about to refill.

This "loops inside the web process" choice keeps the deployment to a single free-tier service. The trade-offs (and why they're acceptable here) are discussed in [Cross-Cutting Themes](#cross-cutting-themes-the-why-behind-the-code).

---

## The XP Economy

XP is the spine of the entire product, so it gets its own section. The defining design decision is:

> **There is ONE unified XP total per player**, blending every way to earn points, and the leaderboard is derived from it on the fly.

### XP sources and values

| Source | XP | Where it's defined | How it's earned |
| --- | --- | --- | --- |
| Free-kick goal | `10` each (`GOAL_XP`) | `app.js`, `xpLedger.service.js`, frontend `FreeKickGame.jsx` | Scoring in the mini-game |
| Streak bonus | `+20` (`STREAK_BONUS`) | `FreeKickGame.jsx` | 3 perfect goals in a row (added to the goal total) |
| "Create a post" challenge | `30` | `engagement.service.js` | First photo post of the day |
| "Share a chant" challenge | `20` | `engagement.service.js` | First text post of the day |
| "Predict a match" challenge | `20` | `engagement.service.js` | First prediction of the day |
| Correct prediction | `15` (`PREDICTION_XP`) | `match.service.js` | Auto-graded when the real result lands |
| Correct bracket pick | `20` (`BRACKET_XP`) | `match.service.js` | Auto-graded as knockout matches finish |

> ⚠️ **The `GOAL_XP = 10` constant is duplicated** in `backend/src/app.js`, `backend/src/services/xpLedger.service.js`, and `frontend/src/pages/FreeKickGame.jsx`. They are deliberately kept in lockstep (each file comments this). If you change one, change all three.

### Two stores, one ranking

XP physically lives in **two** places, and the leaderboard merges them:

1. **`score.totalScore`** — the running count of free-kick *goals* (multiplied by `GOAL_XP` at read time).
2. **`engagement.totalXp`** — the accumulated total of prediction + daily-challenge XP.

`buildUnifiedRanking()` in `app.js` is the single source of truth: it loads both collections, sums `goals × GOAL_XP + engagement XP` per user, filters out zero-XP users, and sorts. Both the public leaderboard and a user's own rank are computed from this same function so they can never disagree.

**Why two stores instead of one running counter?** Goals arrive in fast client-driven bursts and need their own race-safe accumulator (`$inc` on a unique doc), whereas challenge/prediction XP is awarded server-side at well-defined moments. Keeping them separate avoids cross-contaminating two very different write patterns, while the unified read keeps the product simple for the user.

### The XP Ledger (`xpEvent`)

On top of the two aggregate stores, there's an **append-only ledger** (`xpEvent.model.js`) that records *one timestamped row per XP-earning event*, so the profile page can show "where did my points come from?" Key design points:

- **Idempotency by `refId`.** Every event has a deterministic, unique `(clerkUserId, refId)` key — e.g. `daily:2026-06-19:create_post`, `predcorrect:<user>:<matchId>`, `goals:<user>:<ts>`. A retried award upserts the same row instead of double-logging. A unique compound index enforces this.
- **The ledger never blocks the real award.** `logXpEvent` swallows its own errors — it's a "convenience view," and the authoritative totals are the aggregate stores. Losing a ledger row never costs a user real XP.
- **One-time backfill for legacy users.** `backfillXpLedger` reconstructs history for users who earned XP before the ledger existed. It's guarded by a `marker:<user>` row so it runs at most once per user, reconstructs itemised rows from durable records (posts, correct predictions, goal totals), and folds any *remaining* engagement XP into a single "Earlier match predictions" row. The reconciliation is computed against what's *already* in the ledger, so it can never double-count — and it's mathematically guaranteed to sum to the same unified total as the leaderboard.

### XP revocation (delete-a-post safety)

When a user deletes a post that earned a daily-challenge award, only **that exact XP** is clawed back — never the rest of their day. This is why each post carries an optional `xpAward` sub-document (`challengeId`, `xp`, `dateKey`): only the post that actually triggered the award stores it (a repeat post the same day earns nothing and stores nothing). On delete, `revokeChallengeXp` subtracts exactly that amount (clamped at 0), re-opens the quest if it was today, and the matching ledger row is removed.

---

## Data Model

All collections are keyed by Clerk's `clerkUserId` (a string) rather than a local user table — **Clerk is the user store**. Profile snapshots (username, avatar) are *cached* onto documents so the feed and leaderboard render without extra Clerk lookups.

| Model | Key fields | Purpose & notes |
| --- | --- | --- |
| **post** | `type` (`image`/`text`), `image`, `caption`, `author{clerkUserId, username, imageUrl}`, `likes[]`, `reactions[]`, `comments[]`, `xpAward` | Feed entries. `likes` is a **legacy** heart-only field folded into ❤️ reactions on read; `reactions` is the new one-emoji-per-user model. `comments` are embedded with a profile snapshot. `xpAward` ties a single challenge award to this post for precise revocation. |
| **score** | `clerkUserId` (unique), `username`, `imageUrl`, `totalScore` | Running lifetime free-kick goal count (not a single best run). Drives the goal half of the unified ranking. |
| **engagement** | `clerkUserId` (unique), `username`, `imageUrl`, `streak`, `longestStreak`, `lastActiveDate`, `totalXp`, `todayDate`, `todayCompleted[]` | Per-user daily-challenge/streak state + the prediction/challenge XP accumulator. Caches a profile so prediction-only players still appear on the leaderboard. |
| **prediction** | `clerkUserId`, `matchId`, `pick` (`home`/`draw`/`away`), `correct` (null until graded), `xpAwarded` | One pick per user per match (unique compound index). |
| **bracket** | `clerkUserId` (unique), `picks[{matchId, pick}]`, `score` | One knockout bracket per user. Picks lock per match at kick-off. |
| **match** | `matchId` (unique), `homeTeam`, `awayTeam`, `utcDate`, `status`, `minute`, `score`, `goals[]`, `cards[]`, `round`, `group`, `venue`, `graded` | Cached football-data.org fixture. `status` mirrors their vocabulary (`SCHEDULED`/`TIMED`/`IN_PLAY`/`PAUSED`/`FINISHED`…). `graded` prevents re-awarding XP. |
| **xpEvent** | `clerkUserId`, `source`, `label`, `detail`, `emoji`, `amount`, `refId`, `createdAt` | Append-only XP ledger (see above). Unique `(clerkUserId, refId)`; `createdAt` set explicitly so backfilled rows keep their original date. |
| **cache** | `key` (unique), `data` (Mixed) | Generic DB-backed cache so expensive third-party responses (e.g. standings) survive restarts. |
| **energyReminder** | `clerkUserId` (unique), `refillAt` | One pending refill reminder per user; deleted once emailed (one-shot). |

---

## Backend Subsystems & Design Decisions

### Authentication (`app.js`)

- `clerkMiddleware()` attaches auth context to every request; `getAuth(req)` reads `userId`.
- A small `requireUser` guard returns 401 when there's no session. This deliberately replaces Clerk's deprecated `requireAuth()` while keeping identical behaviour.
- **No local user records.** Display name + avatar are resolved on demand via `clerkClient.users.getUser()` (`resolveProfile`) and then *cached* onto domain documents to avoid repeat lookups.

### Posts, reactions & comments

- **Image upload path:** `multer` memory storage → `storage.service.uploadFile` base64-encodes the buffer and sends it to ImageKit, which returns a public URL stored on the post. No files ever touch the API's disk.
- **Reactions migration strategy:** the old model only had hearts (`likes[]`). The new model is one emoji per user (`reactions[]`). On read, `summarizeReactions` folds legacy hearts into the ❤️ count; on write, the `react` route migrates a user out of `likes` so they're never double-counted. This lets the schema evolve without a destructive migration.
- `shapePost` is the single response shaper, exposing only public comment fields and the caller's own reaction/ownership.

### Match data integration (`match.service.js`)

This is the most defensive part of the codebase, because the free-tier football-data.org API is rate-limited (~10 req/min) and flaky.

- **`apiFetch` with retries:** transient network errors (`ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, …) and HTTP 429 are retried with backoff (honouring `Retry-After`), up to 3 attempts.
- **Rolling sync window:** `syncMatches` pulls matches from **3 days back to 2 days ahead**, not just the future. Looking backward lets recently-finished matches get their final status/score so predictions can be graded — otherwise a match would leave a forward-only window stuck "upcoming" forever.
- **Self-healing backfill:** `backfillPredictedMatches` directly re-fetches (by id, batched 20 at a time with pauses) any match that (1) still has an ungraded prediction, or (2) kicked off but never reached a final status. It's self-limiting — once a match is `FINISHED` + scored, it's skipped — so the work shrinks to nothing as results resolve.
- **Grading:** `gradePredictions` derives the result from the final score, marks picks correct/incorrect, awards `PREDICTION_XP` to correct ones (also logging a ledger row), and flips `graded = true`. `gradeBracket` does the analogous thing for knockout picks.
- **Standings caching:** standings use a two-tier cache — in-memory (30-min TTL) backed by the `cache` collection. A cold process hydrates from the DB first and only fetches live if empty; when stale, it refreshes in the **background** so the slow external call never blocks a response.

### Pick-locking logic

A subtle but important decision: a match is open for predictions only if **both** its status is still `SCHEDULED`/`TIMED` **and** kick-off hasn't passed (`isPickOpen` / the inline check in `/matches/today`). The cached `status` can lag reality (it only updates on the 30-min sync), so the kick-off timestamp is the hard guard that prevents picking a match that has already started.

### Leaderboard write safety

- `/leaderboard/score` clamps each submission to `MAX_REASONABLE_SCORE` (basic anti-cheat) and uses `findOneAndUpdate(..., {$inc}, {upsert:true})`. Because goals arrive in bursts, two first-time submissions can race to create the unique doc — so a duplicate-key (E11000) error is retried once (the retry just `$inc`s the now-existing doc).
- `/leaderboard/reconcile` can **only lower** a total, never raise it. The client's localStorage goal counter is the source of truth for undoing historical over-counts (e.g. from an old double-submit bug). Because it can't raise a total, a tampered client can't use it to mint goals.

### Concurrency model for engagement

The client fires several activities at once while playing, so requests race on the same engagement doc (E11000 on insert, or Mongoose `VersionError` on concurrent array saves). `recordActivity` wraps `recordActivityOnce` in a small retry loop on exactly those retryable race errors, re-reading the latest doc each attempt.

### Daily challenges & streaks (`engagement.service.js`)

- A **fixed** (non-random) set of 3 daily quests, each earnable once per UTC day. Day rollover is detected by comparing a `YYYY-MM-DD` UTC key.
- Activities the client reports but that no longer grant standalone XP (playing, scoring, browsing, reacting) are still accepted as a "sign of life" to keep the **streak** alive.
- Tournament timeline (`getTournamentInfo`) computes a "Match day N of 39" label / pre/live/post phase from a fixed `TOURNAMENT_START`.

### Energy refill reminders (`reminder.service.js` + `email.service.js`)

- Energy itself is **client-side** (localStorage in the Free Kick game). The backend only handles the "about to refill" nudge.
- The client posts the `refillAt` timestamp (validated to be in the future and within ~65 minutes). A per-minute sweep finds reminders within a 5-minute lead window, resolves the user's email from Clerk, sends it, and **deletes the row** (one-shot — failures also delete so a bad address isn't retried forever).
- `email.service` is fully provider-agnostic via SMTP env vars, and the whole reminder loop **no-ops gracefully** if SMTP isn't configured.

---

## Frontend Subsystems & Design Decisions

### Routing & auth gating (`App.jsx`, `ProtectedRoute.jsx`, `main.jsx`)

- `ClerkProvider` wraps the app; if no publishable key is set, a friendly setup notice renders instead of a broken app.
- Public routes: Home, Leaderboard, Predictions, Bracket, Match Centre, sign-in/up. Protected routes (`ProtectedRoute`): Create Post, Feed, Profile.
- `ProtectedRoute` remembers the intended destination in `redirect_url` (in the URL so it survives refresh, plus router state as backup) so Clerk returns the user there after login.

### API layer (`lib/api.js`)

A single thin `fetch` wrapper centralises base URL, JSON/FormData handling, the `Authorization: Bearer <Clerk token>` header, and error unwrapping. Every endpoint is a one-line method on the exported `api` object, so components never hand-roll fetches. Tokens are passed in explicitly (from Clerk's `getToken()`), keeping the lib stateless.

### The Free Kick game (`pages/FreeKickGame.jsx`)

The single most complex client file. Highlights of its design:

- **Pure-SVG rendering + a `requestAnimationFrame` loop.** State that the animation loop needs is mirrored into refs (`phaseRef`, `ballRef`, `trajRef`, …) so the loop reads fresh values without re-subscribing.
- **Real-ish ball physics:** a quadratic Bézier trajectory built from the swipe (endpoint = aim, swipe bow = curve), with friction/deceleration, loft, spin, a patrolling keeper, post ricochets, and the **FIFA whole-ball-over-the-line** goal rule.
- **State hydrated synchronously before first render** (`loadSavedState` lazy initializer) — doing this in a mount effect previously raced with the persist effects and accidentally refilled energy on reload.
- **Burst-safe leaderboard sync:** only the *delta* of new goals is submitted, with a `syncingRef` mutex ensuring a single in-flight request and a drain loop that picks up goals scored mid-request. A separate one-time `reconcile` self-heals historical over-counts.
- **Shot gating:** the pitch is inert behind a "Play" overlay and only a small "shot zone" captures gestures, so scrolling the page never wastes a shot. Signed-out users get a sign-in CTA — every goal must map to a real leaderboard entry.
- **Two-channel reminders:** an opt-in email (scheduled via the backend, survives the tab closing) plus a browser `Notification`/in-app toast fallback.

### Other notable client bits

- `lib/flags.js` maps country names → emoji flags (with special-cased home nations like England/Scotland/Wales whose flags aren't ISO countries), falling back to initials for unknowns.
- `lib/engagement.js` is fire-and-forget activity reporting — failures are swallowed so the game/feed keep working offline.
- The `Navbar` auto-hides on scroll-down and is suppressed entirely on the home/auth pages.

---

## API Reference

All authenticated routes expect `Authorization: Bearer <Clerk session token>`. Routes marked **auth** require a session (`requireUser`); routes marked **optional** behave differently when signed in but work signed out.

### Health
- `GET /` → `{ status: "ok", service: "pitchside-api" }`

### Posts & Feed
- `POST /create_a_post` **auth** — multipart (`image` file + `caption`); creates a photo post, may award "create_post" XP.
- `POST /create_a_text_post` **auth** — `{ text }`; creates a Chant (≤280 chars), may award "post_chant" XP.
- `GET /get_all_posts` **optional** — all posts, shaped for the viewer.
- `DELETE /posts/:id` **auth** — author-only; revokes that post's challenge XP if any.
- `POST /posts/:id/like` **auth** — toggle legacy heart like.
- `POST /posts/:id/react` **auth** — `{ emoji }`; set/switch/clear a single reaction.
- `POST /posts/:id/comment` **auth** — `{ text }` (≤280 chars).

### Engagement (daily challenges)
- `GET /engagement/today` **optional** — today's quests, streak, tournament info.
- `POST /engagement/activity` **auth** — `{ type }`; record an activity / complete a quest.

### Leaderboard
- `POST /leaderboard/score` **auth** — `{ goals }`; add newly-scored goals (clamped, race-safe `$inc`).
- `POST /leaderboard/reconcile` **auth** — `{ total }`; lower-only self-heal of the goal total.
- `GET /leaderboard` **optional** — unified top list (`?limit`, max 100) + the caller's own rank.

### Matches
- `GET /matches/today` **optional** — up to 3 fixtures for the prediction polls (with `canPick`, your pick, community %).
- `GET /matches/live` — all of today's fixtures with live detail.
- `GET /matches/standings` — all 12 group standings.
- `GET /matches/bracket` **optional** — knockout fixtures + your bracket picks.
- `POST /matches/backfill` **auth** — manually trigger result backfill + grading.

### Predictions
- `POST /predictions/:matchId` **auth** — `{ pick }` (`home`/`draw`/`away`); only while open.
- `DELETE /predictions/:matchId` **auth** — undo a pick before kick-off.
- `GET /predictions/me` **auth** — prediction history + accuracy + XP.

### Bracket
- `POST /bracket` **auth** — `{ picks: [{matchId, pick}] }`; locked picks are preserved.
- `GET /bracket/me` **auth** — your picks + bracket score.

### Profile
- `GET /me/posts` **auth** — your own posts.
- `GET /me/xp` **auth** — full XP breakdown, level, rank, streak, counts, and the itemised ledger (triggers one-time backfill).

### Energy reminders
- `POST /energy/reminder` **auth** — `{ refillAt }`; schedule a refill email.
- `DELETE /energy/reminder` **auth** — cancel it.

---

## Local Development

### Prerequisites
- Node.js ≥ 20 (the backend uses native `fetch` and `node --watch`)
- A MongoDB connection string (Atlas or local)
- Clerk app (publishable + secret keys)
- ImageKit account (private key) — for image uploads
- football-data.org API key — for live match data
- (Optional) SMTP credentials — for reminder emails

### Backend

```bash
cd backend
npm install
# create backend/.env (see Environment Variables below)
npm run dev      # node --watch server.js  (auto-restarts on change)
# or
npm start        # node server.js
```

The API listens on `PORT` (default `3000`). The match-sync loop only starts if `FOOTBALL_DATA_API_KEY` is set; the reminder loop only starts if SMTP is configured.

### Frontend

```bash
cd frontend
npm install
# create frontend/.env (see below)
npm run dev      # Vite dev server
npm run build    # production build → dist/
npm run preview  # preview the production build
```

---

## Environment Variables

### `backend/.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | MongoDB connection string. |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Clerk frontend/publishable key. |
| `CLERK_SECRET_KEY` | ✅ | Clerk backend secret (verifies sessions, resolves profiles). |
| `IMAGEKIT_PRIVATE_KEY` | ✅ (for posts) | ImageKit private key for uploads. |
| `CLIENT_ORIGIN` | ✅ (prod) | Comma-separated allowed CORS origins; also used as the email link base. |
| `FOOTBALL_DATA_API_KEY` | ⬚ | Enables the match-sync loop and live data. |
| `PORT` | ⬚ | Defaults to `3000`. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | ⬚ | Enables reminder emails (any SMTP provider). `SMTP_FROM` optional. |

### `frontend/.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key for the SPA. |
| `VITE_API_URL` | ✅ | Base URL of the backend API (defaults to `http://localhost:3000`). |

> `.env` files are git-ignored. Never commit secrets.

---

## Deployment

The repo is set up for a split deployment:

- **Backend → Render.com.** `render.yaml` defines a free-tier Node web service (`rootDir: backend`, `npm install` / `npm start`, health check on `/`, auto-deploy). All secrets are declared as `sync: false` env vars to be set in the Render dashboard.
- **Frontend → Vercel.** `frontend/vercel.json` configures the Vite framework preset, `dist` output, and a catch-all rewrite to `index.html` so client-side routing works on refresh/deep-links.

For CORS to work in production, set `CLIENT_ORIGIN` on the backend to the deployed frontend origin(s).

> **Free-tier note:** Render free services sleep when idle. On cold start the in-process sync/reminder loops restart from scratch — which is fine because all state is in MongoDB and the loops are idempotent and self-healing.

---

## Operational Scripts

Run from `backend/` with the same `.env` loaded:

- **`node scripts/drop-stale-indexes.js`** — drops unique indexes left over from older schema versions (e.g. `userId_1` on `scores`/`engagements`, which now key on `clerkUserId`). Useful when migrating an existing database.
- **`node scripts/inspect-leaderboard-docs.js`** — read-only dump of `scores` + `engagements` docs to diagnose duplicate leaderboard entries.

---

## Cross-Cutting Themes (the "why" behind the code)

A few principles recur throughout the codebase and explain many of the smaller decisions:

1. **Clerk is the user store.** There is no local users table. Identity, auth, and profile data come from Clerk; domain documents only cache name/avatar snapshots for rendering speed.

2. **Idempotency everywhere.** XP awards, ledger rows, and match grading all use deterministic keys and upserts so retries, races, and restarts can't double-count. This is what makes it safe to run sync loops inside a sleepy free-tier process.

3. **Self-healing over correctness-by-construction.** Rather than guaranteeing perfect state on the write path, the system is designed to converge: backfill loops resolve stalled matches, the ledger reconciles to the leaderboard total, and `reconcile` lowers inflated goal counts. Bad/missing data tends to fix itself on the next cycle or read.

4. **Defensive integration with flaky third parties.** The football-data.org client retries transient errors and 429s, batches by-id fetches, uses a rolling backward+forward window, and caches standings in two tiers so slow external calls never block users.

5. **Graceful degradation.** Missing SMTP disables emails (not the app). Missing football API key disables sync (not the app). Missing Clerk key shows a setup screen. Engagement reporting is fire-and-forget. The product keeps working with whatever is configured.

6. **Anti-cheat without heavy infrastructure.** Score submissions are clamped; reconcile can only lower; predictions lock by the hard kick-off timestamp (not the stale cached status); and only the post that truly earned XP can revoke it.

7. **Schema evolution without destructive migrations.** Legacy `likes` coexist with new `reactions` and are folded together on read; the XP ledger backfills legacy users lazily on first profile load. Old data keeps working while the model moves forward.
