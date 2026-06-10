import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { reportEngagement } from "../lib/engagement";
import "./Leaderboard.css";

const MEDALS = ["🥇", "🥈", "🥉"];

const Avatar = ({ src, name }) => {
  if (src) {
    return (
      <img src={src} alt="" className="lb-avatar" loading="lazy" />
    );
  }
  return (
    <div className="lb-avatar-fallback">
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
};

const PodiumSlot = ({ entry, place }) => {
  if (!entry) {
    return (
      <div className={`lb-pod lb-pod--${place}`} style={{ opacity: 0.4 }}>
        <span className="lb-pod-medal">{MEDALS[place - 1]}</span>
        <span className="lb-pod-name">—</span>
      </div>
    );
  }
  return (
    <div className={`lb-pod lb-pod--${place}`}>
      <span className="lb-pod-medal">{MEDALS[place - 1]}</span>
      <Avatar src={entry.imageUrl} name={entry.username} />
      <span className="lb-pod-name">{entry.username}</span>
      <span className="lb-pod-score">{entry.bestScore}</span>
      <span className="lb-pod-lbl">goals</span>
    </div>
  );
};

const Row = ({ entry, isMe, showDivider = false }) => (
  <>
    {showDivider && (
      <li className="lb-divider" aria-hidden="true">
        Your rank
      </li>
    )}
    <li className={`lb-row ${isMe ? "lb-row--me" : ""}`}>
      <span className="lb-rank">
        {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
      </span>
      <div className="lb-user">
        <Avatar src={entry.imageUrl} name={entry.username} />
        <div className="min-w-0">
          <span className="lb-name">{entry.username}</span>
          {isMe && <span className="lb-you">You</span>}
        </div>
      </div>
      <div className="lb-goals">
        <strong>{entry.bestScore}</strong>
        <span> goals</span>
      </div>
    </li>
  </>
);

const Leaderboard = () => {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [state, setState] = useState({ status: "loading" });

  const fetchLeaderboard = useCallback(async () => {
    const token = isSignedIn ? await getToken() : null;
    return api.getLeaderboard(token);
  }, [getToken, isSignedIn]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await fetchLeaderboard();
      setState({ status: "ready", ...data });
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (!isLoaded) return undefined;
    let cancelled = false;
    fetchLeaderboard()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", ...data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });
    if (isSignedIn) {
      reportEngagement("view_leaderboard", getToken, isSignedIn);
    }
    return () => {
      cancelled = true;
    };
  }, [isLoaded, fetchLeaderboard, getToken, isSignedIn]);

  const { status, leaders = [], players = 0, me } = state;
  const meInTop = me && leaders.some((l) => l.clerkUserId === me.clerkUserId);
  const podium = [leaders[1], leaders[0], leaders[2]];
  const rest = leaders.slice(3);

  return (
    <div className="lb-screen">
      <div className="lb-wrap">
        <Link to="/" className="lb-back">
          ← Back home
        </Link>

        <header className="lb-header">
          <span className="lb-badge">🏆 Global Ranking</span>
          <h1 className="lb-title">Leaderboard</h1>
          <p className="lb-sub">
            Top 3 at the end of the World Cup win a free custom jersey.
          </p>
        </header>

        <div className="lb-prize">
          <span className="lb-prize-ico">🎽</span>
          <div className="lb-prize-text">
            <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#b45309" }}>
              Jersey prize
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#374151" }}>
              <strong>Top 3 players</strong> take home a free custom jersey.
              Winner announced Jul 19, 2026.
            </p>
          </div>
        </div>

        {status === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="lb-skel" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="lb-error">
            <p>Couldn&apos;t load the leaderboard.</p>
            <button type="button" className="lb-refresh" onClick={load}>
              ↻ Try again
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            {leaders.length > 0 && (
              <div className="lb-podium">
                <PodiumSlot entry={podium[0]} place={2} />
                <PodiumSlot entry={podium[1]} place={1} />
                <PodiumSlot entry={podium[2]} place={3} />
              </div>
            )}

            {me && (
              <div className="lb-me">
                <div className="lb-me-tag">You</div>
                <div className="lb-me-rank">Rank #{me.rank}</div>
                <div className="lb-me-stats">
                  <div className="lb-me-stat">
                    <strong>{me.bestScore}</strong>
                    <span>Best score</span>
                  </div>
                  <div className="lb-me-stat">
                    <strong>{players}</strong>
                    <span>Competing</span>
                  </div>
                </div>
              </div>
            )}

            <div className="lb-toolbar">
              <span>
                <strong>{players}</strong>{" "}
                {players === 1 ? "player" : "players"} competing
              </span>
              <button type="button" className="lb-refresh" onClick={load}>
                ↻ Refresh
              </button>
            </div>

            {leaders.length === 0 ? (
              <div className="lb-empty">
                <p style={{ fontSize: "2rem" }}>⚽</p>
                <p>No scores yet — be the first to top the table!</p>
                <Link to="/" className="lb-refresh" style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>
                  Play Free Kick Challenge
                </Link>
              </div>
            ) : (
              <ul className="lb-list">
                {rest.map((entry) => (
                  <Row
                    key={entry.clerkUserId}
                    entry={entry}
                    isMe={me && entry.clerkUserId === me.clerkUserId}
                  />
                ))}
                {me && !meInTop && <Row entry={me} isMe showDivider />}
              </ul>
            )}
          </>
        )}

        {status === "ready" && isLoaded && !isSignedIn && (
          <p className="lb-signin">
            <Link to="/sign-in">Sign in</Link> to record your score and compete
            for a jersey.
          </p>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
