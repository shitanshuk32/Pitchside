import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { api } from "../lib/api";
import "./Predictions.css";

const fmt = (utcDate) => {
  const d = new Date(utcDate);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const fmtDate = (utcDate) => {
  const d = new Date(utcDate);
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
};

const STATUS_LIVE = new Set(["IN_PLAY", "PAUSED", "HALF_TIME"]);
const STATUS_DONE = new Set(["FINISHED", "SUSPENDED"]);

// Subtle national colours used for accent bars / top borders only.
const TEAM_ACCENTS = {
  Brazil: "#FCD116",
  France: "#0055A4",
  Argentina: "#75AADB",
  Mexico: "#006847",
  Canada: "#FF0000",
  "South Africa": "#007A4D",
  Germany: "#1F2937",
  Japan: "#BC002D",
  England: "#CF142B",
  Senegal: "#00853F",
};
const accentOf = (name) => TEAM_ACCENTS[name] || "#7C3AED";

const LEVEL_SIZE = 1000;

const Flag = ({ crest, flag, name }) => {
  if (flag) return <span className="pred-flag">{flag}</span>;
  if (crest)
    return <img src={crest} alt={name} className="pred-flag-img" />;
  return (
    <span className="pred-flag-fallback">
      {(name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
};

// Premium community prediction meter (home / draw / away).
const CommunityMeter = ({ community, match }) => {
  if (!community) return null;
  const { home = 0, draw = 0, away = 0 } = community;
  const homeName = match.homeTeam?.shortName || match.homeTeam?.name || "Home";
  const awayName = match.awayTeam?.shortName || match.awayTeam?.name || "Away";

  const rows = [
    { key: "home", name: homeName, pct: home, color: accentOf(match.homeTeam?.name) },
    { key: "draw", name: "Draw", pct: draw, color: "#64748b" },
    { key: "away", name: awayName, pct: away, color: accentOf(match.awayTeam?.name) },
  ];

  const top = rows.reduce((a, b) => (b.pct > a.pct ? b : a), rows[0]);
  const leadLabel = top.key === "draw" ? "a draw" : top.name;

  return (
    <div className="pred-meter">
      <p className="pred-meter-head">
        📊 <strong>{top.pct}%</strong> of fans predict {leadLabel}
      </p>
      <div className="pred-meter-rows">
        {rows.map((r) => (
          <div key={r.key} className="pred-meter-row">
            <span className="pred-meter-name">{r.name}</span>
            <span className="pred-meter-track">
              <span
                className="pred-meter-fill"
                style={{ width: `${r.pct}%`, "--c": r.color }}
              />
            </span>
            <span className="pred-meter-pct">{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MatchCard = ({ match, onPick, submitting }) => {
  const isLive = STATUS_LIVE.has(match.status);
  const isDone = STATUS_DONE.has(match.status);
  const canPick = match.canPick;
  const myPick = match.myPick;

  const picks = [
    { id: "home", label: match.homeTeam?.shortName || match.homeTeam?.name },
    { id: "draw", label: "Draw" },
    { id: "away", label: match.awayTeam?.shortName || match.awayTeam?.name },
  ];

  const outcomeLabel =
    match.correct === true
      ? "Correct +15 XP"
      : match.correct === false
        ? "Wrong pick"
        : null;

  return (
    <div
      className={`pred-match ${isLive ? "pred-match--live" : ""}`}
      style={{
        "--home": accentOf(match.homeTeam?.name),
        "--away": accentOf(match.awayTeam?.name),
      }}
    >
      <div className="pred-match-head">
        <span className="pred-round">{match.round || "Group stage"}</span>
        {isLive ? (
          <span className="pred-live">
            <span className="pred-live-dot" />
            LIVE {match.minute != null ? `${match.minute}'` : ""}
          </span>
        ) : isDone ? (
          <span className="pred-time pred-time--done">Full time</span>
        ) : (
          <span className="pred-time pred-time--up">{fmt(match.utcDate)}</span>
        )}
      </div>

      <div className="pred-teams">
        <div className="pred-team">
          <Flag
            crest={match.homeTeam?.crest}
            flag={match.homeTeam?.flag}
            name={match.homeTeam?.name}
          />
          <span className="pred-team-name">
            {match.homeTeam?.shortName || match.homeTeam?.name}
          </span>
          <span
            className="pred-team-accent"
            style={{ "--accent": accentOf(match.homeTeam?.name) }}
          />
        </div>

        <div className="pred-center">
          {isDone || isLive ? (
            <span className="pred-score">
              {match.score?.home ?? "–"} : {match.score?.away ?? "–"}
            </span>
          ) : (
            <span className="pred-vs">VS</span>
          )}
        </div>

        <div className="pred-team">
          <Flag
            crest={match.awayTeam?.crest}
            flag={match.awayTeam?.flag}
            name={match.awayTeam?.name}
          />
          <span className="pred-team-name">
            {match.awayTeam?.shortName || match.awayTeam?.name}
          </span>
          <span
            className="pred-team-accent"
            style={{ "--accent": accentOf(match.awayTeam?.name) }}
          />
        </div>
      </div>

      {canPick && (
        <>
          <div className="pred-picks">
            {picks.map((p) => {
              const active = myPick === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(match.matchId, p.id)}
                  disabled={submitting}
                  className={`pred-pick ${active ? "pred-pick--active" : ""}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="pred-reward-row">
            <span className="pred-reward">🏆 +15 XP for a correct call</span>
          </div>
        </>
      )}

      {!canPick && myPick && (
        <div className="pred-mypick">
          <span className="pred-mypick-label">
            Your pick: <strong>{myPick}</strong>
          </span>
          {outcomeLabel && (
            <span
              className={`pred-outcome ${
                match.correct ? "pred-outcome--ok" : "pred-outcome--no"
              }`}
            >
              {outcomeLabel}
            </span>
          )}
        </div>
      )}

      {(myPick || isDone) && (
        <CommunityMeter community={match.community} match={match} />
      )}
    </div>
  );
};

const RecordRow = ({ item }) => {
  const mark =
    item.correct === true
      ? { cls: "pred-hmark--ok", ch: "✓" }
      : item.correct === false
        ? { cls: "pred-hmark--no", ch: "✗" }
        : { cls: "pred-hmark--pend", ch: "–" };

  return (
    <li className="pred-hrow">
      <span className={`pred-hmark ${mark.cls}`}>{mark.ch}</span>
      <div className="pred-hmeta">
        <p className="pred-hmeta-teams">
          {item.homeTeam} vs {item.awayTeam}
        </p>
        <p className="pred-hmeta-sub">
          {fmtDate(item.utcDate)} · Pick: <span className="cap">{item.pick}</span>
          {item.score?.home !== null &&
            item.score?.home !== undefined &&
            ` · ${item.score.home}–${item.score.away}`}
        </p>
      </div>
      {item.xpAwarded > 0 && (
        <span className="pred-hxp">+{item.xpAwarded} XP</span>
      )}
    </li>
  );
};

const Predictions = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [tab, setTab] = useState("today");
  const [matches, setMatches] = useState(null);
  const [record, setRecord] = useState(null);
  const [stats, setStats] = useState(null);
  const [rank, setRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const loadToday = useCallback(async () => {
    try {
      const token = isSignedIn ? await getToken() : null;
      const data = await api.getMatchesToday(token);
      setMatches(data.matches || []);
    } catch {
      setMatches([]);
    }
  }, [isSignedIn, getToken]);

  const loadRecord = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const data = await api.getMyPredictions(token);
      setRecord(data);
    } catch {
      setRecord(null);
    }
  }, [isSignedIn, getToken]);

  // Hero progress card — reuses existing endpoints (engagement + leaderboard).
  const loadStats = useCallback(async () => {
    try {
      const token = isSignedIn ? await getToken() : null;
      const data = await api.getEngagementToday(token);
      setStats({ totalXp: data.totalXp || 0, streak: data.streak || 0 });
    } catch {
      setStats(null);
    }
  }, [isSignedIn, getToken]);

  const loadRank = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const data = await api.getLeaderboard(token);
      setRank(data?.me?.rank ?? null);
    } catch {
      setRank(null);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    Promise.all([loadToday(), loadRecord(), loadStats(), loadRank()]).finally(
      () => setLoading(false)
    );
  }, [isLoaded, loadToday, loadRecord, loadStats, loadRank]);

  const onPick = async (matchId, pick) => {
    if (!isSignedIn) {
      showToast("Sign in to save your prediction", false);
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      await api.submitPrediction(matchId, pick, token);
      showToast("Pick saved!");
      await loadToday();
      await loadStats();
      window.dispatchEvent(new CustomEvent("pitchside:engagement"));
    } catch (err) {
      showToast(err.message || "Could not save pick", false);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Derived (presentational only) hero values ----
  const totalXp = stats?.totalXp || 0;
  const level = Math.floor(totalXp / LEVEL_SIZE) + 1;
  const xpInLevel = totalXp % LEVEL_SIZE;
  const xpProgress = Math.round((xpInLevel / LEVEL_SIZE) * 100);
  const streak = stats?.streak || 0;
  const accuracy =
    record && record.total > 0
      ? Math.round((record.correct / record.total) * 100)
      : null;

  return (
    <div className="pred-screen">
      <div className="pred-wrap">
        <Link to="/" className="pred-back">
          ← Back home
        </Link>

        {/* ---- Header ---- */}
        <header className="pred-header">
          <span className="pred-badge">
            <span className="pred-badge-dot">🏆</span> World Cup 2026
          </span>
          <h1 className="pred-title">Matchday Predictions</h1>
          <p className="pred-sub">Predict before kick-off • Earn XP • Climb ranks</p>
        </header>

        {/* ---- Hero progress card ---- */}
        <section className="pred-hero">
          <div className="pred-hero-top">
            <div className="pred-level">
              <span className="pred-level-badge">🏆</span>
              <div className="pred-level-meta">
                <div className="pred-level-label">Your level</div>
                <div className="pred-level-num">Level {level}</div>
              </div>
            </div>
            <div className="pred-hero-xp">
              <div className="pred-xp-val">
                {xpInLevel} <span>/ {LEVEL_SIZE} XP</span>
              </div>
              <div className="pred-xp-cap">Season XP</div>
            </div>
          </div>

          <div className="pred-xp-track">
            <div className="pred-xp-fill" style={{ width: `${xpProgress}%` }} />
          </div>
          <p className="pred-xp-next">
            {LEVEL_SIZE - xpInLevel} XP to level {level + 1}
          </p>

          <div className="pred-hero-stats">
            <div className="pred-stat">
              <span className="pred-stat-ico">🔥</span>
              <span className="pred-stat-val">{streak}</span>
              <span className="pred-stat-lbl">Streak</span>
            </div>
            <div className="pred-stat">
              <span className="pred-stat-ico">🎯</span>
              <span className="pred-stat-val">
                {accuracy != null ? `${accuracy}%` : "—"}
              </span>
              <span className="pred-stat-lbl">Accuracy</span>
            </div>
            <div className="pred-stat">
              <span className="pred-stat-ico">🏅</span>
              <span className="pred-stat-val">
                {rank != null ? `#${rank}` : "—"}
              </span>
              <span className="pred-stat-lbl">Rank</span>
            </div>
          </div>
        </section>

        {/* ---- Segmented tabs ---- */}
        <div className="pred-tabs">
          <span
            className="pred-tab-thumb"
            style={{
              transform: `translateX(${tab === "today" ? "0%" : "100%"})`,
            }}
          />
          {["today", "record"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pred-tab ${tab === t ? "pred-tab--active" : ""}`}
            >
              {t === "today" ? "Today" : "My Record"}
            </button>
          ))}
        </div>

        {loading && (
          <div className="pred-list">
            {[1, 2].map((i) => (
              <div key={i} className="pred-skel" />
            ))}
          </div>
        )}

        {!loading && tab === "today" && (
          <>
            {matches && matches.length > 0 ? (
              <div className="pred-list">
                {matches.map((m) => (
                  <MatchCard
                    key={m.matchId}
                    match={m}
                    onPick={onPick}
                    submitting={submitting}
                  />
                ))}
              </div>
            ) : (
              <div className="pred-empty">
                <p className="pred-empty-emoji">📅</p>
                <p className="pred-empty-title">No matches today</p>
                <p className="pred-empty-sub">
                  Check back on match days — there are up to 8 per day in the
                  group stage.
                </p>
              </div>
            )}
            {!isSignedIn && (
              <p className="pred-signin-hint">
                <Link to="/sign-in">Sign in</Link> to save your picks and earn XP.
              </p>
            )}
          </>
        )}

        {!loading && tab === "record" && (
          <>
            {!isSignedIn ? (
              <div className="pred-empty">
                <p className="pred-empty-emoji">🔒</p>
                <p className="pred-empty-title">Sign in to see your record</p>
                <Link to="/sign-in" className="pred-cta">
                  Sign in
                </Link>
              </div>
            ) : record ? (
              <>
                <div className="pred-record-stats">
                  {[
                    { label: "Correct", value: record.correct },
                    { label: "Total", value: record.total },
                    { label: "XP earned", value: record.totalXp },
                  ].map(({ label, value }) => (
                    <div key={label} className="pred-rcard">
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                {record.history?.length > 0 ? (
                  <ul className="pred-history">
                    {record.history.map((item) => (
                      <RecordRow key={`${item.matchId}`} item={item} />
                    ))}
                  </ul>
                ) : (
                  <p className="pred-signin-hint">
                    No predictions yet — head to the Today tab to make your first
                    pick.
                  </p>
                )}
              </>
            ) : (
              <p className="pred-signin-hint">
                Could not load your record. Try refreshing.
              </p>
            )}
          </>
        )}
      </div>

      {toast && (
        <div
          className={`pred-toast ${toast.ok ? "pred-toast--ok" : "pred-toast--no"}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default Predictions;
