import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/react";
import PageShell from "./PageShell";
import { api } from "../lib/api";

const STAGES = [
  { key: "ROUND_OF_16", label: "Round of 16" },
  { key: "QUARTER_FINALS", label: "Quarter-finals" },
  { key: "SEMI_FINALS", label: "Semi-finals" },
  { key: "FINAL", label: "Final" },
];

const STATUS_OPEN = new Set(["SCHEDULED", "TIMED"]);
const STATUS_LIVE = new Set(["IN_PLAY", "PAUSED", "HALF_TIME"]);

const fmt = (utcDate) =>
  new Date(utcDate).toLocaleDateString([], { day: "numeric", month: "short" });

const TeamCrest = ({ crest, flag, name, size = "sm" }) => {
  const cls = size === "sm" ? "h-6 w-6 text-[0.55rem]" : "h-8 w-8 text-xs";
  if (flag) return <span className="text-base leading-none">{flag}</span>;
  return crest ? (
    <img src={crest} alt={name} className={`${cls} object-contain`} />
  ) : (
    <div
      className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-brand-purple/10 font-bold text-brand-purple`}
    >
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
};

const MatchSlot = ({ match, myPick, onPick, disabled }) => {
  const isOpen = STATUS_OPEN.has(match?.status || "SCHEDULED");
  const isLive = STATUS_LIVE.has(match?.status || "");
  const isDone = match?.status === "FINISHED";
  const canPick = isOpen && !disabled;

  const homeWon =
    isDone &&
    match.score?.home !== null &&
    match.score?.home > match.score?.away;
  const awayWon =
    isDone &&
    match.score?.away !== null &&
    match.score?.away > match.score?.home;

  const homePickCorrect = isDone && myPick === match?.homeTeam?.name && homeWon;
  const awayPickCorrect = isDone && myPick === match?.awayTeam?.name && awayWon;
  const homePickWrong =
    isDone && myPick === match?.homeTeam?.name && !homeWon;
  const awayPickWrong =
    isDone && myPick === match?.awayTeam?.name && !awayWon;

  if (!match) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-white/40 px-3 py-2.5 text-center">
        <p className="text-[0.65rem] text-neutral-400">TBD</p>
      </div>
    );
  }

  const teamBtn = (team, side) => {
    const picked = myPick === team.name;
    const correct = side === "home" ? homePickCorrect : awayPickCorrect;
    const wrong = side === "home" ? homePickWrong : awayPickWrong;
    const won = side === "home" ? homeWon : awayWon;

    return (
      <button
        key={team.name}
        onClick={() => canPick && onPick(match.matchId, team.name)}
        disabled={!canPick}
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition ${
          correct
            ? "bg-green-50 text-green-700 ring-1 ring-green-300"
            : wrong
              ? "bg-red-50 text-red-600 line-through opacity-60"
              : picked
                ? "bg-brand-purple/10 text-brand-purple ring-1 ring-brand-purple/30"
                : isDone && won
                  ? "bg-white text-neutral-800 font-bold"
                  : isDone
                    ? "bg-white/50 text-neutral-400"
                    : canPick
                      ? "bg-white hover:bg-brand-purple/8 hover:text-brand-purple text-neutral-700"
                      : "bg-white/50 text-neutral-500 cursor-default"
        }`}
      >
        <TeamCrest crest={team.crest} flag={team.flag} name={team.name} />
        <span className="truncate">{team.shortName || team.name}</span>
        {correct && <span className="ml-auto">✓</span>}
        {isDone && won && !correct && !wrong && (
          <span className="ml-auto text-[0.6rem] text-neutral-400">W</span>
        )}
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/80 bg-white/80 shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-100 px-2.5 py-1">
        <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-neutral-400">
          {fmt(match.utcDate)}
        </span>
        {isLive && (
          <span className="text-[0.6rem] font-bold text-green-600">
            {match.minute ?? ""}' Live
          </span>
        )}
        {isDone && (
          <span className="text-[0.6rem] font-semibold text-neutral-400">
            {match.score?.home} – {match.score?.away}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-1.5">
        {teamBtn(match.homeTeam, "home")}
        {teamBtn(match.awayTeam, "away")}
      </div>
    </div>
  );
};

const Bracket = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [data, setData] = useState(null);
  const [myPicks, setMyPicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    try {
      const token = isSignedIn ? await getToken() : null;
      const res = await api.getKnockoutBracket(token);
      setData(res);

      const pm = {};
      for (const p of res.matches || []) {
        if (p.myPick) pm[p.matchId] = p.myPick;
      }
      setMyPicks(pm);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    load();
  }, [isLoaded, load]);

  const onPick = (matchId, teamName) => {
    setMyPicks((prev) => {
      const next = { ...prev };
      if (next[matchId] === teamName) delete next[matchId];
      else next[matchId] = teamName;
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!isSignedIn) {
      showToast("Sign in to save your bracket", false);
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const picks = Object.entries(myPicks).map(([matchId, pick]) => ({
        matchId: Number(matchId),
        pick,
      }));
      await api.saveBracket(picks, token);
      setDirty(false);
      showToast("Bracket saved!");
      window.dispatchEvent(new CustomEvent("pitchside:engagement"));
    } catch (err) {
      showToast(err.message || "Could not save", false);
    } finally {
      setSaving(false);
    }
  };

  const matches = data?.matches || [];
  const hasKnockout = matches.length > 0;

  const byStage = {};
  for (const m of matches) {
    const r = m.round;
    if (!byStage[r]) byStage[r] = [];
    byStage[r].push(m);
  }

  return (
    <PageShell
      icon="🏆"
      badge="World Cup 2026"
      title="Bracket"
      subtitle="Pick the winner of each knockout match. Correct calls earn 20 XP."
    >
      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${
            toast.ok ? "bg-green-600" : "bg-red-500"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
      )}

      {!loading && !hasKnockout && (
        <div className="rounded-2xl border border-white/80 bg-white/70 px-6 py-12 text-center">
          <p className="text-4xl">⏳</p>
          <h2 className="mt-3 text-lg font-bold text-neutral-800">
            Bracket unlocks soon
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            The Round of 16 draw will be confirmed at the end of the group stage.
            Come back then to fill in your full bracket.
          </p>
          <Link
            to="/predictions"
            className="mt-5 inline-block rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white"
          >
            Make daily predictions instead →
          </Link>
        </div>
      )}

      {!loading && hasKnockout && (
        <>
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/80 bg-white/70 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-neutral-800">Your bracket</p>
              <p className="text-xs text-neutral-500">
                Score: <strong className="text-brand-purple">{data?.bracketScore || 0} XP</strong>
              </p>
            </div>
            {dirty && (
              <button
                onClick={save}
                disabled={saving}
                className="rounded-full bg-brand-purple px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save bracket"}
              </button>
            )}
          </div>

          {/* Horizontal scroll container for the bracket columns */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4" style={{ minWidth: "min-content" }}>
              {STAGES.map(({ key, label }) => {
                const stageMatches = byStage[key] || [];
                return (
                  <div
                    key={key}
                    className="flex w-48 shrink-0 flex-col gap-3"
                  >
                    <h3 className="text-center text-[0.7rem] font-bold uppercase tracking-wide text-neutral-500">
                      {label}
                    </h3>
                    <div className="flex flex-col gap-2">
                      {stageMatches.length > 0
                        ? stageMatches.map((m) => (
                            <MatchSlot
                              key={m.matchId}
                              match={m}
                              myPick={myPicks[m.matchId] || null}
                              onPick={onPick}
                              disabled={!isSignedIn}
                            />
                          ))
                        : Array.from({ length: key === "FINAL" ? 1 : key === "SEMI_FINALS" ? 2 : key === "QUARTER_FINALS" ? 4 : 8 }).map(
                            (_, i) => <MatchSlot key={i} match={null} />
                          )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!isSignedIn && (
            <p className="mt-4 text-center text-sm text-neutral-500">
              <Link to="/sign-in" className="font-bold text-brand-purple">
                Sign in
              </Link>{" "}
              to save your bracket picks.
            </p>
          )}
        </>
      )}
    </PageShell>
  );
};

export default Bracket;
