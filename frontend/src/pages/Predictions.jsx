import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { api } from "../lib/api";
import { flagFor } from "../lib/flags";
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

const MatchCard = ({ match, onPick }) => {
  const isLive = STATUS_LIVE.has(match.status);
  const isDone = STATUS_DONE.has(match.status);
  const canPick = match.canPick;

  // Optimistic local pick so the button highlights instantly on tap instead of
  // waiting for the network round-trip. Re-syncs whenever the server value
  // changes (e.g. after a refresh) — but never while a tap is still pending,
  // so a background refresh can't clobber a choice we haven't saved yet.
  const [myPick, setMyPick] = useState(match.myPick ?? null);
  const persistRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (pendingRef.current) return;
    setMyPick(match.myPick ?? null);
  }, [match.myPick]);

  useEffect(() => () => clearTimeout(persistRef.current), []);

  const handlePick = (id) => {
    if (!canPick) return;
    // Tapping the active pick clears it (undo); otherwise switch to it.
    const next = myPick === id ? null : id;
    setMyPick(next);
    // Persist only the FINAL choice once rapid taps settle. Spam-clicking used
    // to fire a burst of overlapping save/undo requests, and each response
    // re-synced the card mid-animation — that's what made the buttons jump.
    pendingRef.current = true;
    clearTimeout(persistRef.current);
    persistRef.current = setTimeout(async () => {
      try {
        await onPick(match.matchId, next);
      } finally {
        pendingRef.current = false;
      }
    }, 320);
  };

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
                  type="button"
                  onClick={() => handlePick(p.id)}
                  aria-pressed={active}
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

      {!canPick && !myPick && (
        <div className="pred-mypick">
          <span className="pred-mypick-label pred-mypick-label--closed">
            🔒 Predictions closed{isDone ? " · awaiting result" : ""}
          </span>
        </div>
      )}

      {(myPick || isDone) && (
        <CommunityMeter community={match.community} match={match} />
      )}
    </div>
  );
};

const RecordRow = ({ item }) => {
  const homeShort = item.homeTeam;
  const awayShort = item.awayTeam;
  const homeFlag = flagFor(item.homeName || homeShort);
  const awayFlag = flagFor(item.awayName || awayShort);

  const hasScore =
    item.score?.home !== null &&
    item.score?.home !== undefined &&
    item.score?.away !== null &&
    item.score?.away !== undefined;

  // participated defaults to true so older payloads without the flag still work.
  const participated = item.participated !== false;
  const won = item.correct === true;
  const lost = item.correct === false;
  const kickoff = item.utcDate ? new Date(item.utcDate).getTime() : 0;
  const isPast = kickoff > 0 && kickoff < Date.now();
  // No pick? It's a match the user skipped. Otherwise: graded → won/lost,
  // a played/past match is awaiting its result, a future match is upcoming.
  const status = !participated
    ? "missed"
    : won
      ? "won"
      : lost
        ? "lost"
        : hasScore || isPast
          ? "pending"
          : "upcoming";

  const pickLabel =
    item.pick === "home"
      ? homeShort
      : item.pick === "away"
        ? awayShort
        : item.pick === "draw"
          ? "Draw"
          : "—";

  const badgeText = !participated
    ? "DID NOT PLAY"
    : won
      ? `WON · +${item.xpAwarded || 15} XP`
      : lost
        ? "LOST"
        : status === "pending"
          ? "AWAITING"
          : "UPCOMING";

  return (
    <li className={`pred-hcard pred-hcard--${status}`}>
      <div className="pred-hcard-top">
        <div className="pred-hteam">
          <span className="pred-hflag">{homeFlag || "🏳️"}</span>
          <span className="pred-hteam-name">{homeShort}</span>
        </div>
        <div className="pred-hscore">
          {hasScore ? (
            <span className="pred-hscore-num">
              {item.score.home}
              <i>–</i>
              {item.score.away}
            </span>
          ) : (
            <span className="pred-hscore-vs">VS</span>
          )}
        </div>
        <div className="pred-hteam pred-hteam--right">
          <span className="pred-hteam-name">{awayShort}</span>
          <span className="pred-hflag">{awayFlag || "🏳️"}</span>
        </div>
      </div>
      <div className="pred-hcard-bottom">
        <span className="pred-hdate">{fmtDate(item.utcDate)}</span>
        {participated ? (
          <span className="pred-hpick">
            {won && <span className="pred-hpick-ico">✓</span>}
            {lost && <span className="pred-hpick-ico pred-hpick-ico--no">✗</span>}
            Your pick: <strong>{pickLabel}</strong>
          </span>
        ) : (
          <span className="pred-hpick pred-hpick--none">
            You didn&apos;t predict this match
          </span>
        )}
        <span className={`pred-hbadge pred-hbadge--${status}`}>{badgeText}</span>
      </div>
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
  const [matchesError, setMatchesError] = useState(false);
  const [recordError, setRecordError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      setMatchesError(false);
    } catch {
      // A failed request is NOT the same as an empty matchday — keep matches
      // unset and flag the error so we can show a retry instead of the
      // misleading "No matches today" empty state.
      setMatches(null);
      setMatchesError(true);
    }
  }, [isSignedIn, getToken]);

  const retryToday = useCallback(async () => {
    setRetrying(true);
    await loadToday();
    setRetrying(false);
  }, [loadToday]);

  const loadRecord = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const data = await api.getMyPredictions(token);
      setRecord(data);
      setRecordError(false);
    } catch {
      setRecord(null);
      setRecordError(true);
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

  // Pull final scores for finished matches from the API, then refresh the
  // record so newly graded picks (WON/LOST) and XP show up immediately.
  const refreshResults = useCallback(async () => {
    if (!isSignedIn || refreshing) return;
    setRefreshing(true);
    try {
      const token = await getToken();
      const data = await api.backfillResults(token);
      await Promise.all([loadRecord(), loadStats(), loadRank()]);
      window.dispatchEvent(new CustomEvent("pitchside:engagement"));
      showToast(
        data?.fetched > 0
          ? `Updated ${data.fetched} match${data.fetched === 1 ? "" : "es"}`
          : "Results are up to date"
      );
    } catch (err) {
      showToast(err.message || "Could not refresh results", false);
    } finally {
      setRefreshing(false);
    }
  }, [isSignedIn, refreshing, getToken, loadRecord, loadStats, loadRank]);

  useEffect(() => {
    if (!isLoaded) return;
    // Fire each load independently so the main Today list renders as soon as
    // matches arrive, instead of waiting for the slowest of all four calls.
    loadToday();
    loadRecord();
    loadStats();
    loadRank();
  }, [isLoaded, loadToday, loadRecord, loadStats, loadRank]);

  const onPick = async (matchId, pick) => {
    if (!isSignedIn) {
      showToast("Sign in to save your prediction", false);
      return;
    }
    try {
      const token = await getToken();
      // pick === null means "undo" — remove the existing prediction.
      if (pick === null) {
        await api.removePrediction(matchId, token);
      } else {
        await api.submitPrediction(matchId, pick, token);
      }
      // The button already updated optimistically; refresh community %, stats
      // and challenges in the background.
      await loadToday();
      await loadStats();
      window.dispatchEvent(new CustomEvent("pitchside:engagement"));
    } catch (err) {
      showToast(err.message || "Could not save pick", false);
      loadToday(); // revert the optimistic state to the server's truth
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

  // Per-tab loading: the Today list only depends on `matches`, so it no longer
  // waits on the record / stats / rank requests.
  const todayLoading = matches === null && !matchesError;
  const recordLoading = isSignedIn && record === null && !recordError;

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

        {tab === "today" && todayLoading && (
          <div className="pred-list">
            {[1, 2].map((i) => (
              <div key={i} className="pred-skel" />
            ))}
          </div>
        )}

        {tab === "today" && !todayLoading && (
          <>
            {matchesError ? (
              <div className="pred-empty">
                <p className="pred-empty-emoji">⚠️</p>
                <p className="pred-empty-title">Couldn't load matches</p>
                <p className="pred-empty-sub">
                  Something went wrong reaching the server. Check your connection
                  and try again.
                </p>
                <button
                  type="button"
                  className="pred-cta"
                  onClick={retryToday}
                  disabled={retrying}
                >
                  {retrying ? "Retrying…" : "Retry"}
                </button>
              </div>
            ) : matches && matches.length > 0 ? (
              <div className="pred-list">
                {matches.map((m) => (
                  <MatchCard key={m.matchId} match={m} onPick={onPick} />
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

        {tab === "record" && (
          <>
            {!isSignedIn ? (
              <div className="pred-empty">
                <p className="pred-empty-emoji">🔒</p>
                <p className="pred-empty-title">Sign in to see your record</p>
                <Link to="/sign-in" className="pred-cta">
                  Sign in
                </Link>
              </div>
            ) : recordLoading ? (
              <div className="pred-list">
                {[1, 2].map((i) => (
                  <div key={i} className="pred-skel" />
                ))}
              </div>
            ) : record ? (
              <>
                <div className="pred-record-head">
                  <h2 className="pred-record-title">Your record</h2>
                  <button
                    type="button"
                    className="pred-refresh"
                    onClick={refreshResults}
                    disabled={refreshing}
                    aria-busy={refreshing}
                  >
                    <span
                      className={`pred-refresh-ico ${refreshing ? "pred-refresh-ico--spin" : ""}`}
                      aria-hidden="true"
                    >
                      ↻
                    </span>
                    {refreshing ? "Refreshing…" : "Refresh results"}
                  </button>
                </div>
                <div className="pred-record-stats">
                  {[
                    { label: "Correct", value: record.correct },
                    { label: "Predicted", value: record.total },
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
