import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "react-router-dom";
import PageShell from "./PageShell";
import { api } from "../lib/api";

const MEDALS = ["🥇", "🥈", "🥉"];

const TOP3_ROW_STYLES = {
  1: "border-l-[3px] border-l-brand-gold bg-gradient-to-r from-brand-gold/10 to-transparent",
  2: "border-l-[3px] border-l-neutral-300 bg-gradient-to-r from-neutral-100/80 to-transparent",
  3: "border-l-[3px] border-l-amber-600/50 bg-gradient-to-r from-amber-50/60 to-transparent",
};

const cardShell =
  "overflow-hidden rounded-3xl border border-white/85 bg-white/85 shadow-lg shadow-brand-purple/10 backdrop-blur-md";

const Avatar = ({ src, name }) => {
  const sizeClass = "h-9 w-9 text-sm";

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-2 ring-white`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-purple to-brand-red font-bold text-white ring-2 ring-white`}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
};

const RankBadge = ({ rank }) => {
  if (rank <= 3) {
    return (
      <span
        className="text-base leading-none sm:text-lg"
        aria-label={`Rank ${rank}`}
      >
        {MEDALS[rank - 1]}
      </span>
    );
  }

  return (
    <span className="text-sm font-bold tabular-nums text-neutral-400">
      {rank}
    </span>
  );
};

const Row = ({ entry, isMe, showDivider = false }) => {
  const top3 = entry.rank <= 3;
  const top3Style = top3 ? TOP3_ROW_STYLES[entry.rank] : "";

  return (
    <>
      {showDivider && (
        <li
          className="flex items-center gap-3 px-1 py-2"
          aria-hidden="true"
        >
          <span className="h-px flex-1 bg-brand-purple/10" />
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-neutral-400">
            Your rank
          </span>
          <span className="h-px flex-1 bg-brand-purple/10" />
        </li>
      )}
      <li
        className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-3 py-2.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-3.5 sm:px-3.5 sm:py-3 ${
          isMe
            ? "bg-brand-purple/8 ring-1 ring-inset ring-brand-purple/25"
            : top3Style || "bg-white/60"
        }`}
      >
        <div className="flex items-center justify-center">
          <RankBadge rank={entry.rank} />
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={entry.imageUrl} name={entry.username} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-neutral-800">
                {entry.username}
              </span>
              {isMe && (
                <span className="shrink-0 rounded-full bg-brand-purple px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white">
                  You
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-base font-extrabold tabular-nums text-brand-plum sm:text-lg">
            {entry.bestScore}
          </span>
          <span className="ml-1 text-[0.65rem] font-medium uppercase tracking-wide text-neutral-400">
            goals
          </span>
        </div>
      </li>
    </>
  );
};

const SkeletonRow = () => (
  <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-3 py-2.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-3.5 sm:px-3.5 sm:py-3">
    <div className="mx-auto h-5 w-5 animate-pulse rounded-full bg-brand-purple/10" />
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 animate-pulse rounded-full bg-brand-purple/10" />
      <div className="h-3.5 w-28 animate-pulse rounded-full bg-neutral-200/80" />
    </div>
    <div className="h-4 w-10 animate-pulse rounded-full bg-neutral-200/80" />
  </li>
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
    return () => {
      cancelled = true;
    };
  }, [isLoaded, fetchLeaderboard]);

  const { status, leaders = [], players = 0, me } = state;
  const meInTop = me && leaders.some((l) => l.clerkUserId === me.clerkUserId);

  return (
    <PageShell
      icon="🏆"
      badge="Global ranking"
      title="Leaderboard"
      subtitle="Top 3 at the end of the World Cup win a free custom jersey."
      doodle="trophy"
    >
      <div className={cardShell}>
        {/* Prize banner — integrated card header */}
        <div className="border-b border-brand-gold/20 bg-linear-to-br from-brand-gold/12 via-white/90 to-brand-teal/8 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 text-xl shadow-sm shadow-brand-gold/20 ring-1 ring-brand-gold/25"
              aria-hidden="true"
            >
              🎽
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-brand-teal-ink">
                Jersey prize
              </p>
              <p className="text-sm leading-snug text-neutral-700 sm:text-[0.9375rem]">
                <span className="font-semibold text-brand-plum">
                  Top 3 players
                </span>{" "}
                take home a free custom jersey.
              </p>
              <p className="text-xs text-neutral-500">
                Winner announced after the final on{" "}
                <span className="font-semibold text-neutral-700">
                  Jul 19, 2026
                </span>
                .
              </p>
            </div>
          </div>
        </div>

        {status === "loading" && (
          <div className="border-b border-white/60 px-3 py-3 sm:px-4">
            <ul className="flex flex-col gap-1.5" aria-busy="true" aria-label="Loading leaderboard">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </ul>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center px-6 py-10 text-center sm:py-12">
            <span
              className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-red/8 text-2xl ring-1 ring-brand-red/15"
              aria-hidden="true"
            >
              📡
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral-600">
              Couldn&apos;t load the leaderboard. Make sure the backend is
              running, then try again.
            </p>
            <button
              onClick={load}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-red/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-red/35"
            >
              <span aria-hidden="true">↻</span> Try again
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-white/60 bg-white/40 px-4 py-3 sm:px-5">
              <p className="text-xs text-neutral-500">
                <span className="text-base font-bold tabular-nums text-brand-plum">
                  {players}
                </span>{" "}
                {players === 1 ? "player" : "players"} competing
              </p>
              <button
                onClick={load}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-purple/15 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-purple shadow-sm transition hover:border-brand-purple/30 hover:bg-brand-purple/5"
              >
                <span aria-hidden="true">↻</span> Refresh
              </button>
            </div>

            <div className="px-3 py-3 sm:px-4 sm:py-4">
              {leaders.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-10 text-center sm:py-12">
                  <span
                    className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-teal/10 text-2xl ring-1 ring-brand-teal/15"
                    aria-hidden="true"
                  >
                    ⚽
                  </span>
                  <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral-600">
                    No scores yet — be the first to top the table!
                  </p>
                  <Link
                    to="/"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-red/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-red/35"
                  >
                    Play the Free Kick Challenge
                  </Link>
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {leaders.map((entry) => (
                    <Row
                      key={entry.clerkUserId}
                      entry={entry}
                      isMe={me && entry.clerkUserId === me.clerkUserId}
                    />
                  ))}

                  {me && !meInTop && (
                    <Row entry={me} isMe showDivider />
                  )}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {status === "ready" && isLoaded && !isSignedIn && (
        <p className="mt-5 text-center text-sm text-neutral-500">
          <Link to="/sign-in" className="font-semibold text-brand-purple">
            Sign in
          </Link>{" "}
          to record your score and compete for a jersey.
        </p>
      )}
    </PageShell>
  );
};

export default Leaderboard;
