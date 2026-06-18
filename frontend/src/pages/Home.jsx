import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Typewriter from "./Typewriter";
import FreeKickGame from "./FreeKickGame";
import DailyChallenges from "../components/DailyChallenges";
import OnboardingTour from "../components/OnboardingTour";
import AuthControls from "../components/AuthControls";
import { WORLD_CUP_FACTS } from "./facts";
import { api } from "../lib/api";
import { flagFor } from "../lib/flags";
import { buildLiveFacts } from "../lib/matchFacts";
import "./Home.css";

const BallDoodle = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="3" />
    <path
      d="M32 17 l10 7.5 -4 12 h-12 l-4 -12 z"
      fill="currentColor"
    />
    <path
      d="M32 17 V8 M42 24.5 l8 -4.5 M38 36.5 l7 8.5 M26 36.5 l-7 8.5 M22 24.5 l-8 -4.5"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
);

const TrophyDoodle = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path
      d="M20 12 h24 v8 a12 12 0 0 1 -24 0 z"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path
      d="M20 15 h-7 a7 7 0 0 0 9 10 M44 15 h7 a7 7 0 0 1 -9 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M28 33 h8 v8 h-8z M22 50 h20 M30 41 v9 M34 41 v9"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StarDoodle = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path
      d="M32 10 l6 14 15 1 -11.5 9.5 4 14.5 -13.5 -8 -13.5 8 4 -14.5 -11.5 -9.5 15 -1 z"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinejoin="round"
    />
  </svg>
);

const WhistleDoodle = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path
      d="M14 30 h22 a10 10 0 1 1 -10 12 v-4 h-12 a4 4 0 0 1 -4 -4 z"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path d="M36 22 l5 -5 M44 24 l6 -3 M45 32 h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// Stickman runs up and curls the ball into the top corner of the goal.
const KickScene = () => (
  <div className="kick-scene" aria-hidden="true">
    <svg viewBox="0 0 400 120" className="kick-svg" fill="none">
      <line className="ks-ground" x1="0" y1="104" x2="400" y2="104" />

      {/* Goal */}
      <g className="ks-goal">
        <path className="ks-frame" d="M312 104 V44 H392 V104" />
        <path
          className="ks-net"
          d="M312 44 H392 M312 58 H392 M312 72 H392 M312 88 H392 M326 44 V104 M342 44 V104 M358 44 V104 M374 44 V104"
        />
      </g>

      {/* Stickman */}
      <g className="ks-stick">
        <circle className="ks-stroke" cx="44" cy="38" r="9" />
        <line className="ks-stroke" x1="44" y1="47" x2="44" y2="74" />
        <line className="ks-stroke" x1="44" y1="55" x2="30" y2="66" />
        <line className="ks-stroke" x1="44" y1="55" x2="58" y2="62" />
        <line className="ks-stroke" x1="44" y1="74" x2="34" y2="98" />
        <g className="ks-kick-leg">
          <line className="ks-stroke" x1="44" y1="74" x2="62" y2="94" />
        </g>
      </g>

      {/* Ball */}
      <g className="ks-ball">
        <circle className="ks-stroke" cx="0" cy="0" r="7" />
        <path
          className="ks-ball-fill"
          d="M0 -4 l3.8 2.8 -1.5 4.5 h-4.6 l-1.5 -4.5 z"
        />
      </g>

      <text className="ks-goal-text" x="300" y="30">
        GOAL!
      </text>
    </svg>
  </div>
);

// Opening match of the 2026 FIFA World Cup — Mexico City, June 11, 2026.
// Kick-off is 1:00 PM local (CST, UTC-6) = 19:00 UTC.
const KICKOFF = new Date("2026-06-11T19:00:00Z");

const pad = (n) => String(n).padStart(2, "0");

const DONE_STATUSES = new Set(["FINISHED"]);

const matchCountdown = (utcDate) => {
  const diff = new Date(utcDate).getTime() - Date.now();
  if (diff <= 0) return "Kicking off soon";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `Starts in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${h}h`;
};

const kickoffClock = (utcDate) =>
  new Date(utcDate).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const Countdown = () => {
  const [diff, setDiff] = useState(() => KICKOFF.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(
      () => setDiff(KICKOFF.getTime() - Date.now()),
      1000
    );
    return () => clearInterval(id);
  }, []);

  if (diff <= 0) {
    return (
      <section className="home-hero home-hero--live">
        <div className="home-hero-bg" aria-hidden="true" />
        <span className="home-hero-badge">🏆 FIFA WORLD CUP 2026</span>
        <h2 className="home-hero-live-title">
          <span className="live-dot" /> The World Cup is underway
        </h2>
        <p className="home-hero-live-text">Let the matches begin ⚽</p>
      </section>
    );
  }

  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const units = [
    [days, "Days"],
    [Math.floor((total % 86400) / 3600), "Hrs"],
    [Math.floor((total % 3600) / 60), "Min"],
    [total % 60, "Sec"],
  ];

  return (
    <section className="home-hero">
      <div className="home-hero-bg" aria-hidden="true" />
      <span className="home-hero-badge">🏆 FIFA WORLD CUP 2026</span>
      <h2 className="home-hero-days">
        {days} {days === 1 ? "DAY" : "DAYS"} TO GO
      </h2>
      <p className="home-hero-venue">Mexico City · June 11</p>
      <div className="home-countdown-grid">
        {units.map(([v, l]) => (
          <div className="cd-unit" key={l}>
            <strong>{pad(v)}</strong>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED", "HALF_TIME"]);

const Flag = ({ flag, name }) => {
  const emoji = flag || flagFor(name);
  if (emoji) return <span className="home-match-flag">{emoji}</span>;
  return (
    <span className="home-match-flag-fallback">
      {(name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
};

const TodayMatch = () => {
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    api.getMatchesToday(null)
      .then((d) => {
        setMatches((d.matches || []).slice(0, 2));
      })
      .catch(() => setMatches([]));
  }, []);

  if (!matches || matches.length === 0) return null;

  return (
    <section className="home-today-matches" data-tour="matches">
      <div className="home-today-header">
        <span className="home-today-label">📡 Today&apos;s Matches</span>
        <Link to="/match-centre" className="home-today-link">
          Match Centre →
        </Link>
      </div>
      <div className="home-today-list">
        {matches.map((m) => {
          const isLive = LIVE_STATUSES.has(m.status);
          const isDone = DONE_STATUSES.has(m.status);
          const hasScore = m.score?.home !== null;
          return (
            <Link
              key={m.matchId}
              to="/predictions"
              className={`home-today-card ${isLive ? "home-today-card--live" : ""}`}
            >
              {isLive && (
                <span className="home-today-live-badge">
                  <span className="home-today-live-dot" /> LIVE
                  {m.minute != null ? ` ${m.minute}'` : ""}
                </span>
              )}
              <div className="home-today-teams">
                <div className="home-today-team-col">
                  <Flag flag={m.homeTeam?.flag} name={m.homeTeam?.name} />
                  <span className="home-today-team">
                    {m.homeTeam?.shortName || m.homeTeam?.name}
                  </span>
                </div>
                <div className="home-today-center">
                  {hasScore ? (
                    <span
                      className={`home-today-score ${isLive ? "home-today-score--live" : ""}`}
                    >
                      {m.score.home} — {m.score.away}
                    </span>
                  ) : (
                    <span className="home-today-vs">VS</span>
                  )}
                  {isDone ? (
                    hasScore && <span className="home-today-ft">Full time</span>
                  ) : isLive ? null : (
                    <span className="home-today-time">
                      <strong className="home-today-time-clock">
                        {kickoffClock(m.utcDate)}
                      </strong>
                      <span className="home-today-time-count">
                        ⏰ {matchCountdown(m.utcDate)}
                      </span>
                    </span>
                  )}
                </div>
                <div className="home-today-team-col">
                  <Flag flag={m.awayTeam?.flag} name={m.awayTeam?.name} />
                  <span className="home-today-team home-today-team--right">
                    {m.awayTeam?.shortName || m.awayTeam?.name}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const Home = () => {
  // Start with a fresh, random order of the evergreen trivia so the carousel
  // always has something, then replace/lead with real-time facts (live scores,
  // results, goalscorers) once today's match data loads.
  const [lines, setLines] = useState(() => shuffle(WORLD_CUP_FACTS).slice(0, 6));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getMatchesLive().catch(() => null),
      api.getGroupStandings().catch(() => null),
    ])
      .then(([matchData, standingsData]) => {
        if (cancelled) return;
        const live = buildLiveFacts(
          matchData?.matches || [],
          standingsData?.standings || []
        );
        if (live.length > 0) {
          // Lead with real, live facts; only top up with evergreen trivia if
          // we don't have enough live ones to keep the ticker full.
          setLines([...live, ...shuffle(WORLD_CUP_FACTS)].slice(0, 10));
        }
      })
      .catch(() => {
        // No live data (tournament not started / backend down) — keep trivia.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Replay the stickman goal celebration every 30s by remounting it.
  const [kickKey, setKickKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setKickKey((k) => k + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="home">
      {/* Hand-drawn World Cup doodles */}
      <div className="home-doodles" aria-hidden="true">
        <BallDoodle className="doodle doodle--ball-1" />
        <BallDoodle className="doodle doodle--ball-2" />
        <TrophyDoodle className="doodle doodle--trophy" />
        <StarDoodle className="doodle doodle--star-1" />
        <StarDoodle className="doodle doodle--star-2" />
        <WhistleDoodle className="doodle doodle--whistle" />
      </div>

      <div className="home-orb home-orb--1" />
      <div className="home-orb home-orb--2" />

      <div className="home-content">
        <div className="home-header">
          <span className="home-badge">
            <span className="home-badge-ball" aria-hidden="true">
              🏆
            </span>
            Pitchside · World Cup 2026
          </span>
          <AuthControls large />
        </div>

        {/* Immersive World Cup hero */}
        <Countdown />

        <h1 className="home-title">
          <span className="home-title-eyebrow">Your daily</span>
          <span className="home-title-brand">Matchday Hub</span>
        </h1>
        <span className="home-title-accent" aria-hidden="true" />
        <p className="home-subtitle">
          <strong>Predict. Play. Compete. All tournament long.</strong>
        </p>

        <TodayMatch />

        <div data-tour="challenges">
          <DailyChallenges />
        </div>

        <span className="home-fact-label">🏆 Did you know?</span>
        <div className="home-facts-carousel">
          <div className="home-facts-card">
            <Typewriter
              key={lines[0]}
              lines={lines}
              typingSpeed={70}
              deletingSpeed={45}
              pauseBetweenLines={5500}
              loop
            />
            <div className="home-facts-dots" aria-hidden="true">
              {lines.slice(0, 4).map((_, i) => (
                <span key={i} className={`home-facts-dot ${i === 0 ? "home-facts-dot--active" : ""}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="home-actions">
          <Link to="/create_a_post" className="home-btn home-btn--primary">
            <span>Create a post</span>
            <span className="home-btn-arrow">→</span>
          </Link>
          <Link to="/get_all_posts" className="home-btn home-btn--ghost">
            Explore feed
          </Link>
          <Link to="/leaderboard" className="home-btn home-btn--ghost">
            🏆 Leaderboard
          </Link>
        </div>

        <div className="home-stats">
          <div className="home-stat">
            <strong>48</strong>
            <span>Teams</span>
          </div>
          <div className="home-stat-divider" />
          <div className="home-stat">
            <strong>104</strong>
            <span>Matches</span>
          </div>
          <div className="home-stat-divider" />
          <div className="home-stat">
            <strong>16</strong>
            <span>Host cities</span>
          </div>
          <div className="home-stat-divider" />
          <div className="home-stat">
            <strong>39</strong>
            <span>Days</span>
          </div>
        </div>

        <section className="home-game" id="free-kick" data-tour="freekick">
          <div className="home-game-head">
            <span className="home-game-badge">⚽ Penalty Shootout</span>
            <h2 className="home-game-title">Free Kick Challenge</h2>
            <p className="home-game-sub">
              3 shots. Bend it past the keeper, climb the global leaderboard —
              top <span className="strike-one">3</span> 1 wins a free custom
              jersey 🎽
            </p>
          </div>
          <FreeKickGame />
        </section>

        <button
          type="button"
          className="home-replay-tour"
          onClick={() => window.dispatchEvent(new CustomEvent("pitchside:start-tour"))}
        >
          ↻ Replay intro tour
        </button>
      </div>

      {/* Stickman curls the ball into the goal (replays every 30s) */}
      <KickScene key={kickKey} />

      <OnboardingTour />
    </div>
  );
};

export default Home;
