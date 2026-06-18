import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { api } from "../lib/api";
import { pickSpotlight } from "../data/tournamentSpotlights";
import "./DailyChallenges.css";

const CHALLENGE_LINKS = {
  create_post: "/create_a_post",
  post_chant: "/create_a_post",
  predict_match: "/predictions",
  // legacy ids (no longer shown as quests, kept for safety)
  play_free_kick: "#free-kick",
  score_goal: "#free-kick",
  react: "/get_all_posts",
  view_leaderboard: "/leaderboard",
};

const DailyChallenges = () => {
  const { isSignedIn, getToken } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = isSignedIn ? await getToken() : null;
      const res = await api.getEngagementToday(token);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onUpdate = () => load();
    window.addEventListener("pitchside:engagement", onUpdate);
    return () => window.removeEventListener("pitchside:engagement", onUpdate);
  }, [load]);

  if (loading) {
    return (
      <section className="daily-challenges daily-challenges--loading">
        <div className="dc-skeleton dc-skeleton--title" />
        <div className="dc-skeleton dc-skeleton--row" />
        <div className="dc-skeleton dc-skeleton--row" />
      </section>
    );
  }

  if (!data) return null;

  const spotlight = pickSpotlight(
    data.tournament?.day || 0,
    data.tournament?.phase || "pre"
  );
  const progress =
    data.dailyXpMax > 0
      ? Math.round((data.dailyXp / data.dailyXpMax) * 100)
      : 0;

  // Onboarding copy (the spotlight + how-it-works boxes) is only useful to
  // newcomers: signed-out visitors and brand-new players who haven't earned
  // any XP yet. Returning players already know the drill, so we hide it.
  const showIntro = !isSignedIn || (data.totalXp || 0) === 0;

  return (
    <section className="daily-challenges" id="daily-challenges">
      <div className="dc-header">
        <div>
          <span className="dc-eyebrow">
            {data.tournament?.label || "World Cup"}
            {data.tournament?.day
              ? ` · Day ${data.tournament.day}`
              : ""}
          </span>
          <h2 className="dc-title">🔥 Daily Quests</h2>
        </div>
        <div className="dc-streak" title="Consecutive active days">
          <span className="dc-streak-flame">🔥</span>
          <strong>{data.streak || 0}</strong>
          <span>day streak</span>
        </div>
      </div>

      {showIntro && (
        <>
          <div className="dc-spotlight">
            <span className="dc-spotlight-emoji" aria-hidden="true">
              {spotlight.emoji}
            </span>
            <div>
              <strong>{spotlight.title}</strong>
              <p>{spotlight.hook}</p>
            </div>
          </div>

          <div className="dc-howto">
            <span className="dc-howto-ico" aria-hidden="true">🏆</span>
            <p>
              Score <a href="#free-kick">goals</a> (they stack up all tournament)
              and complete the quests below to earn <strong>XP</strong>. The more
              you stack, the higher you climb the{" "}
              <Link to="/leaderboard">leaderboard</Link> — top{" "}
              <span className="strike-one">3</span> 1 wins a jersey.
            </p>
          </div>
        </>
      )}

      <div className="dc-progress">
        <div className="dc-progress-meta">
          <span>XP Progress</span>
          <strong>
            {data.dailyXp}/{data.dailyXpMax}
          </strong>
        </div>
        <div className="dc-progress-bar">
          <div
            className="dc-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        {data.allDone && (
          <p className="dc-complete">All challenges done — see you tomorrow ⚡</p>
        )}
      </div>

      <ul className="dc-list">
        <li className="dc-item dc-item--ongoing">
          <a href="#free-kick" className="dc-link">
            <span className="dc-check dc-check--ongoing" aria-hidden="true">
              ⚽
            </span>
            <span className="dc-label">
              Score goals
              <span className="dc-sub">Unlimited — they add up all tournament</span>
            </span>
            <span className="dc-xp">+10 XP each</span>
          </a>
        </li>

        {data.challenges.map((c) => {
          const href = CHALLENGE_LINKS[c.id] || "#free-kick";
          const isHash = href.startsWith("#");
          const inner = (
            <>
              <span className="dc-check" data-done={c.done}>
                {c.done ? "✓" : c.emoji}
              </span>
              <span className="dc-label">{c.label}</span>
              <span className="dc-xp">+{c.xp} XP</span>
            </>
          );

          return (
            <li key={c.id} className={c.done ? "dc-item dc-item--done" : "dc-item"}>
              {isHash ? (
                <a href={href} className="dc-link">
                  {inner}
                </a>
              ) : (
                <Link to={href} className="dc-link">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {!isSignedIn && (
        <p className="dc-signin">
          <Link to="/sign-in">Sign in</Link> to save your streak and XP.
        </p>
      )}

      {isSignedIn && data.totalXp > 0 && (
        <p className="dc-total-xp">Total XP: <strong>{data.totalXp}</strong></p>
      )}
    </section>
  );
};

export default DailyChallenges;
