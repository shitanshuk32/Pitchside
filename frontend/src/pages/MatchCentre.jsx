import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { getTeamFacts } from "../data/teamFacts";
import { WORLD_CUP_FACTS } from "./facts";
import { buildLiveFacts } from "../lib/matchFacts";
import "./MatchCentre.css";

const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED", "HALF_TIME"]);
const DONE_STATUSES = new Set(["FINISHED"]);

const fmt = (utcDate) =>
  new Date(utcDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const countdown = (utcDate) => {
  const diff = new Date(utcDate).getTime() - Date.now();
  if (diff <= 0) return "Kicking off soon";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `Starts in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${h}h`;
};

const splitVenue = (venue) => {
  if (!venue) return null;
  const parts = venue.split(",").map((s) => s.trim());
  if (parts.length >= 2) return { name: parts[0], city: parts.slice(1).join(", ") };
  return { name: venue, city: "" };
};

const groupLabel = (match) =>
  match.group
    ? `Group ${match.group.replace("GROUP_", "")}`
    : (match.round || "").replace(/_/g, " ");

// Presentational only — pick the winning side from the final score.
const winnerSide = (match) => {
  if (!DONE_STATUSES.has(match.status)) return null;
  if (match.score?.home == null || match.score?.away == null) return null;
  if (match.score.home > match.score.away) return "home";
  if (match.score.away > match.score.home) return "away";
  return null;
};

const Flag = ({ crest, flag, name }) => {
  if (flag) return <span className="mc-flag">{flag}</span>;
  if (crest) return <img src={crest} alt={name} className="mc-flag-img" />;
  return (
    <span className="mc-flag-fallback">
      {(name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
};

// ---- Live / Today tab ----

const DOT_CLASS = {
  YELLOW_CARD: "mc-dot--yellow",
  RED_CARD: "mc-dot--red",
  SECOND_YELLOW_CARD: "mc-dot--orange",
};
const eventDotClass = (type) => DOT_CLASS[type] || "mc-dot--goal";

const MatchCard = ({ match }) => {
  const [expanded, setExpanded] = useState(false);
  const isLive = LIVE_STATUSES.has(match.status);
  const isDone = DONE_STATUSES.has(match.status);
  const hasScore = match.score?.home !== null;
  const winner = winnerSide(match);
  const venue = splitVenue(match.venue);
  const hasEvents = match.goals?.length > 0 || match.cards?.length > 0;

  return (
    <div className={`mc-match ${isLive ? "mc-match--live" : ""}`}>
      <div
        className="mc-match-tap"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      >
        <div className="mc-match-head">
          <span className="mc-group">{groupLabel(match)}</span>
          {isLive ? (
            <span className="mc-live">
              <span className="mc-live-dot" />
              LIVE {match.minute != null ? `${match.minute}'` : ""}
            </span>
          ) : isDone ? (
            <span className="mc-status mc-status--ft">✅ FT</span>
          ) : (
            <span className="mc-status mc-status--up">{fmt(match.utcDate)}</span>
          )}
        </div>

        <div className="mc-teams">
          <div className="mc-team">
            <Flag
              crest={match.homeTeam?.crest}
              flag={match.homeTeam?.flag}
              name={match.homeTeam?.name}
            />
            <span className={`mc-name ${winner === "home" ? "mc-name--win" : ""}`}>
              {match.homeTeam?.shortName || match.homeTeam?.name}
            </span>
            {winner === "home" && <span className="mc-win-tag">★ Winner</span>}
          </div>

          <div className="mc-center">
            {hasScore ? (
              <span className={`mc-score ${isLive ? "mc-score--live" : ""}`}>
                {match.score.home} – {match.score.away}
              </span>
            ) : (
              <span className="mc-vs">VS</span>
            )}
          </div>

          <div className="mc-team">
            <Flag
              crest={match.awayTeam?.crest}
              flag={match.awayTeam?.flag}
              name={match.awayTeam?.name}
            />
            <span className={`mc-name ${winner === "away" ? "mc-name--win" : ""}`}>
              {match.awayTeam?.shortName || match.awayTeam?.name}
            </span>
            {winner === "away" && <span className="mc-win-tag">★ Winner</span>}
          </div>
        </div>

        {venue && (
          <div className="mc-venue">
            <div className="mc-venue-wrap">
              <span className="mc-venue-name">📍 {venue.name}</span>
              {venue.city && <span className="mc-venue-city">{venue.city}</span>}
              {!isLive && !isDone && (
                <span className="mc-countdown">⏰ {countdown(match.utcDate)}</span>
              )}
            </div>
          </div>
        )}

        {hasEvents && (
          <p className="mc-expand-hint">
            {expanded ? "Tap to hide events ▲" : "Tap for match events ▼"}
          </p>
        )}
      </div>

      {expanded && hasEvents && (
        <div className="mc-expand">
          {match.goals?.map((g, i) => (
            <div key={`g${i}`} className="mc-event">
              <span className="mc-dot mc-dot--goal" />
              <span className="mc-event-name">⚽ {g.scorer}</span>
              <span className="mc-event-min">{g.minute}'</span>
              <span className="mc-event-team">{g.team}</span>
            </div>
          ))}
          {match.cards?.map((c, i) => (
            <div key={`c${i}`} className="mc-event">
              <span className={`mc-dot ${eventDotClass(c.type)}`} />
              <span className="mc-event-name">{c.player}</span>
              <span className="mc-event-min">{c.minute}'</span>
              <span className="mc-event-team">{c.team}</span>
            </div>
          ))}
        </div>
      )}

      {expanded && !hasEvents && (
        <div className="mc-expand-empty">
          {isDone ? "No recorded events" : "Events will appear here during the match"}
        </div>
      )}
    </div>
  );
};

const LiveHero = ({ matches, refreshedAt }) => {
  const live = matches.filter((m) => LIVE_STATUSES.has(m.status)).length;
  const done = matches.filter((m) => DONE_STATUSES.has(m.status)).length;
  const upcoming = matches.length - live - done;

  return (
    <section className="mc-hero">
      <div className="mc-hero-top">
        <div>
          <div className="mc-hero-eyebrow">⚽ Today's Fixtures</div>
          <div className="mc-hero-count">
            {matches.length} {matches.length === 1 ? "Match" : "Matches"} Today
          </div>
        </div>
        {refreshedAt && (
          <div className="mc-hero-updated">
            Updated
            <br />
            {new Date(refreshedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
      <div className="mc-hero-stats">
        <div className="mc-hstat">
          <span className="mc-hstat-val">{live}</span>
          <span className="mc-hstat-lbl">
            <span className="mc-hstat-dot mc-hstat-dot--live" /> Live
          </span>
        </div>
        <div className="mc-hstat">
          <span className="mc-hstat-val">{upcoming}</span>
          <span className="mc-hstat-lbl">
            <span className="mc-hstat-dot mc-hstat-dot--up" /> Upcoming
          </span>
        </div>
        <div className="mc-hstat">
          <span className="mc-hstat-val">{done}</span>
          <span className="mc-hstat-lbl">
            <span className="mc-hstat-dot mc-hstat-dot--ft" /> Finished
          </span>
        </div>
      </div>
    </section>
  );
};

const LiveTab = ({ matches, refreshedAt }) => {
  if (!matches) {
    return (
      <div className="mc-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="mc-skel mc-skel--match" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {matches.length > 0 ? (
        <>
          <LiveHero matches={matches} refreshedAt={refreshedAt} />
          <div className="mc-list">
            {matches.map((m) => (
              <MatchCard key={m.matchId} match={m} />
            ))}
          </div>
        </>
      ) : (
        <div className="mc-empty">
          <p className="mc-empty-emoji">📅</p>
          <p className="mc-empty-title">No matches today</p>
          <p className="mc-empty-sub">
            Up to 8 matches per day in the group stage — check the schedule and
            come back on match days.
          </p>
        </div>
      )}
    </div>
  );
};

// ---- Groups tab ----

// Honest record visualisation built from real won/draw/lost counts.
const recordBadges = (team) => {
  const out = [];
  for (let i = 0; i < (team.won || 0); i++) out.push("W");
  for (let i = 0; i < (team.draw || 0); i++) out.push("D");
  for (let i = 0; i < (team.lost || 0); i++) out.push("L");
  return out.slice(0, 6);
};

const GroupTable = ({ group }) => {
  const [open, setOpen] = useState(true);
  const label = group.type?.replace("TOTAL", "")?.trim() || group.group || "";
  const teams = group.table || [];
  const leader = teams[0];

  return (
    <div className="mc-group-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mc-group-head"
      >
        <span className="mc-group-head-left">
          <span className="mc-group-name">
            {group.group ? `Group ${group.group.replace("GROUP_", "")}` : label}
          </span>
          <span className="mc-group-qual">Top 2 qualify</span>
        </span>
        <span className={`mc-group-chev ${open ? "mc-group-chev--open" : ""}`}>
          ▼
        </span>
      </button>

      {open && (
        <div className="mc-table-wrap">
          {leader && recordBadges(leader).length > 0 && (
            <div className="mc-form">
              <span className="mc-form-leader">
                {leader.team?.shortName || leader.team?.name} · record
              </span>
              <span className="mc-form-dots">
                {recordBadges(leader).map((r, i) => (
                  <span
                    key={i}
                    className={`mc-fbadge mc-fbadge--${r.toLowerCase()}`}
                  >
                    {r}
                  </span>
                ))}
              </span>
            </div>
          )}

          <div className="mc-thead">
            <span>#</span>
            <span className="mc-th-team">Team</span>
            <span>P</span>
            <span>W</span>
            <span>D</span>
            <span>L</span>
            <span>GD</span>
            <span className="mc-th-pts">Pts</span>
          </div>

          {teams.map((t, i) => {
            const qualified = i < 2;
            return (
              <div
                key={t.team?.id || i}
                className={`mc-trow ${qualified ? "mc-trow--q" : ""} ${
                  t.team?.id ? "" : "mc-trow--empty"
                }`}
              >
                <span
                  className={`mc-rank ${
                    i === 0 ? "mc-rank--1" : i === 1 ? "mc-rank--2" : ""
                  }`}
                >
                  {i + 1}
                </span>
                <span className="mc-tteam">
                  {t.team?.flag ? (
                    <span className="mc-tflag">{t.team.flag}</span>
                  ) : (
                    t.team?.crest && (
                      <img
                        src={t.team.crest}
                        alt={t.team.name}
                        className="mc-tflag-img"
                      />
                    )
                  )}
                  <span className="mc-tname">
                    {t.team?.shortName || t.team?.name}
                  </span>
                </span>
                <span className="mc-tcell">{t.playedGames}</span>
                <span className="mc-tcell">{t.won}</span>
                <span className="mc-tcell">{t.draw}</span>
                <span className="mc-tcell">{t.lost}</span>
                <span className="mc-tcell">
                  {t.goalDifference >= 0
                    ? `+${t.goalDifference}`
                    : t.goalDifference}
                </span>
                <span className="mc-tpts">{t.points}</span>
              </div>
            );
          })}

          <p className="mc-group-foot">
            <span className="mc-foot-dot" /> Green border = qualifying for the
            Round of 32
          </p>
        </div>
      )}
    </div>
  );
};

const GroupsTab = ({ standings }) => {
  if (!standings) {
    return (
      <div className="mc-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="mc-skel mc-skel--group" />
        ))}
      </div>
    );
  }

  const groups = standings.filter((s) => s.type === "TOTAL" || s.table?.length > 0);

  if (groups.length === 0) {
    return (
      <div className="mc-empty">
        <p className="mc-empty-emoji">📊</p>
        <p className="mc-empty-title">Standings coming soon</p>
        <p className="mc-empty-sub">
          Group tables will appear here once the tournament kicks off.
        </p>
      </div>
    );
  }

  return (
    <div>
      {groups.map((g, i) => (
        <GroupTable key={g.group || i} group={g} />
      ))}
    </div>
  );
};

// ---- Facts tab ----

// Presentational category heuristic (does not alter the underlying facts).
const FACT_CATS = [
  {
    test: (f) => /^🔴 LIVE/i.test(f),
    label: "Live now",
    emoji: "🔴",
    accent: "#EF4444",
  },
  {
    test: (f) => /^⚽ .*scored/i.test(f),
    label: "Goal",
    emoji: "⚽",
    accent: "#16A34A",
  },
  {
    test: (f) => /^✅|^🤝/.test(f),
    label: "Result",
    emoji: "🏁",
    accent: "#0EA5E9",
  },
  {
    test: (f) => /^🥇|top .*group|sharpest attack/i.test(f),
    label: "Standings",
    emoji: "📊",
    accent: "#F59E0B",
  },
  {
    test: (f) => /co-host|host|cities|hosts/i.test(f),
    label: "Host Nations",
    emoji: "🌎",
    accent: "#22C55E",
  },
  {
    test: (f) => /champion|defend|lifted|title|won the/i.test(f),
    label: "Champions",
    emoji: "🏆",
    accent: "#F59E0B",
  },
  {
    test: (f) => /biggest|most|record|matches|teams|format|groups|fans|days/i.test(f),
    label: "Records",
    emoji: "⚽",
    accent: "#7C3AED",
  },
];
const categorize = (fact) =>
  FACT_CATS.find((c) => c.test(fact)) || {
    label: "History",
    emoji: "📖",
    accent: "#A855F7",
  };

const FactCard = ({ item }) => {
  const cat = categorize(item.fact);
  return (
    <div className="mc-fact" style={{ "--accent": cat.accent }}>
      <span className="mc-fact-cat">
        {cat.emoji} {cat.label}
      </span>
      <p className="mc-fact-body">{item.fact}</p>
      {item.tag && (
        <span className="mc-fact-tag">
          {item.flag ? item.flag : "🏟️"} {item.tag}
        </span>
      )}
    </div>
  );
};

const FactsTab = ({ matches, standings }) => {
  // Lead with real-time facts: live scores, results, goalscorers and group
  // leaders pulled straight from the tournament data.
  const live = buildLiveFacts(matches, standings);
  const isLive = live.length > 0;

  let combined;
  if (isLive) {
    combined = live.map((f) => ({ fact: f }));
  } else {
    // Pre-tournament / no data yet — fall back to team & general WC facts.
    const allFacts = [];
    if (matches && matches.length > 0) {
      for (const m of matches.slice(0, 3)) {
        const homeName = m.homeTeam?.name;
        const awayName = m.awayTeam?.name;
        if (homeName) {
          const facts = getTeamFacts(homeName);
          if (facts?.[0]) {
            allFacts.push({
              fact: facts[0],
              emoji: "🔵",
              tag: `${m.homeTeam?.shortName || homeName}`,
              flag: m.homeTeam?.flag,
            });
          }
        }
        if (awayName) {
          const facts = getTeamFacts(awayName);
          if (facts?.[0]) {
            allFacts.push({
              fact: facts[0],
              emoji: "🔴",
              tag: `${m.awayTeam?.shortName || awayName}`,
              flag: m.awayTeam?.flag,
            });
          }
        }
      }
    }
    const general = WORLD_CUP_FACTS.slice(0, Math.max(0, 6 - allFacts.length));
    combined = [...allFacts, ...general.map((f) => ({ fact: f, emoji: "⚽" }))];
  }

  return (
    <div>
      <section className="mc-facts-hero">
        <div className="mc-facts-hero-title">
          {isLive ? "📡 Live from the World Cup" : "🏆 World Cup Trivia"}
        </div>
        <p className="mc-facts-hero-sub">
          {isLive
            ? "Real-time scores, results and goals from the tournament."
            : "Learn the history while you follow the tournament."}
        </p>
      </section>
      <div className="mc-facts-list">
        {combined.map((item, i) => (
          <FactCard key={i} item={item} />
        ))}
      </div>
    </div>
  );
};

// ---- Main component ----

const MatchCentre = () => {
  const [tab, setTab] = useState("live");
  const [matches, setMatches] = useState(null);
  const [standings, setStandings] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const refreshRef = useRef(null);

  const loadLive = useCallback(async () => {
    try {
      const data = await api.getMatchesLive();
      setMatches(data.matches || []);
      setRefreshedAt(Date.now());
    } catch {
      setMatches([]);
    }
  }, []);

  const loadStandings = useCallback(async () => {
    try {
      const data = await api.getGroupStandings();
      setStandings(data.standings || []);
    } catch {
      setStandings([]);
    }
  }, []);

  useEffect(() => {
    loadLive();
    loadStandings();
  }, [loadLive, loadStandings]);

  // Auto-refresh every 60s if any match is live.
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    const hasLive = (matches || []).some((m) => LIVE_STATUSES.has(m.status));
    if (hasLive) {
      refreshRef.current = setInterval(loadLive, 60000);
    }
    return () => clearInterval(refreshRef.current);
  }, [matches, loadLive]);

  const tabs = [
    { id: "live", label: "Live" },
    { id: "groups", label: "Groups" },
    { id: "facts", label: "Facts" },
  ];
  const tabIndex = tabs.findIndex((t) => t.id === tab);

  return (
    <div className="mc-screen">
      <div className="mc-wrap">
        <Link to="/" className="mc-back">
          ← Back home
        </Link>

        <header className="mc-header">
          <span className="mc-badge">🏆 World Cup 2026</span>
          <h1 className="mc-title">Match Centre</h1>
          <p className="mc-sub">Live scores • Groups • Tournament facts</p>
        </header>

        <div className="mc-tabs">
          <span
            className="mc-tab-thumb"
            style={{ transform: `translateX(${tabIndex * 100}%)` }}
          />
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`mc-tab ${tab === t.id ? "mc-tab--active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "live" && <LiveTab matches={matches} refreshedAt={refreshedAt} />}
        {tab === "groups" && <GroupsTab standings={standings} />}
        {tab === "facts" && <FactsTab matches={matches} standings={standings} />}
      </div>
    </div>
  );
};

export default MatchCentre;
