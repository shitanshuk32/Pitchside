import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "react-router-dom";
import PageShell from "./PageShell";
import { api } from "../lib/api";

// Order matters: this is also the picker order. ❤️ stays first as the default.
const REACTION_EMOJIS = ["❤️", "⚽", "🔥", "😂", "😱", "🐐", "👏"];

// Bold, high-contrast gradients (white text reads on all of them). Each Chant
// post gets a stable one based on its id, so every chant feels distinct.
const CHANT_THEMES = [
  "from-brand-purple via-brand-red to-brand-gold",
  "from-emerald-600 via-green-600 to-teal-600",
  "from-blue-600 via-indigo-600 to-violet-700",
  "from-rose-600 via-red-600 to-orange-500",
  "from-violet-700 via-fuchsia-600 to-pink-600",
  "from-amber-500 via-orange-600 to-rose-600",
  "from-cyan-600 via-sky-600 to-blue-700",
  "from-fuchsia-700 via-purple-700 to-indigo-700",
];

// Deterministic theme pick from a string seed (the post id).
const pickChantTheme = (seed = "") => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CHANT_THEMES[h % CHANT_THEMES.length];
};

// Reveal an element once when it first scrolls into view.
const useInView = () => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      // Positive bottom margin so a card reveals while it's still below the
      // fold — otherwise its (opacity:0) space sits as blank cream until it
      // scrolls well into view, leaving a gap at the bottom of the screen.
      { threshold: 0, rootMargin: "0px 0px 35% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);
  return [ref, inView];
};

const SkeletonCard = () => (
  <article className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-lg shadow-brand-purple/10 ring-1 ring-black/3">
    <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3">
      <div className="h-9 w-9 animate-pulse rounded-full bg-brand-purple/10" />
      <div className="space-y-1.5">
        <div className="h-3 w-24 animate-pulse rounded-full bg-neutral-200/80" />
        <div className="h-2 w-12 animate-pulse rounded-full bg-neutral-200/60" />
      </div>
    </div>
    <div className="mx-2.5 aspect-4/3 animate-pulse rounded-2xl bg-brand-purple/10" />
    <div className="space-y-2 px-4 py-4">
      <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-neutral-200/80" />
      <div className="h-3 w-full animate-pulse rounded-full bg-neutral-200/60" />
    </div>
  </article>
);

const Avatar = ({ src, name, size = "h-9 w-9 text-sm" }) => {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${size} shrink-0 rounded-full object-cover ring-2 ring-white`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-purple to-brand-red font-bold text-white ring-2 ring-white`}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
};

// Short, human relative time ("just now", "3h", "2d") from an ISO string.
const timeAgo = (iso) => {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

// Small brand-coloured verified tick shown next to usernames.
const VerifiedBadge = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5 shrink-0 text-brand-teal"
    aria-label="Verified fan"
  >
    <path
      fill="currentColor"
      d="M12 1.8 14.6 4l3.3-.4 1 3.2 3 1.4-1.4 3 1.4 3-3 1.4-1 3.2-3.3-.4L12 22.2 9.4 20l-3.3.4-1-3.2-3-1.4 1.4-3-1.4-3 3-1.4 1-3.2 3.3.4z"
    />
    <path
      fill="#fff"
      d="m10.6 14.6-2-2-1.2 1.2 3.2 3.2 5.6-5.6-1.2-1.2z"
    />
  </svg>
);

const HeartIcon = ({ filled, className = "h-5 w-5" }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20.5 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z" />
  </svg>
);

const CommentIcon = ({ active }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill={active ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 20.5l1.6-5.4A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);

const DotsIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

const TrashIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12a2 2 0 0 1-2 1.9H8.7a2 2 0 0 1-2-1.9L6 7" />
  </svg>
);

// Ring + particles that fire out of the heart whenever a like lands.
const LikeBurst = () => (
  <span
    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    aria-hidden="true"
  >
    <span className="burst-ring absolute left-1/2 top-1/2 block h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-red" />
    {Array.from({ length: 6 }).map((_, i) => (
      <span
        key={i}
        className="burst-particle absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full bg-brand-gold"
        style={{ "--a": `${i * 60}deg` }}
      />
    ))}
  </span>
);

// A chant (text post) gets a bold gradient panel instead of a photo. The
// gradient is unique per post (seeded by id) and overlaid with a soft dotted
// texture. Longer chants shrink slightly so they stay readable.
const ChantCard = ({ text, seed }) => (
  <div
    className={`chant-animated relative flex aspect-4/3 items-center justify-center overflow-hidden bg-linear-to-br ${pickChantTheme(
      seed
    )} px-5 py-6 text-center`}
  >
    <div
      className="chant-texture pointer-events-none absolute inset-0 opacity-70"
      aria-hidden="true"
    />
    <span
      className="pointer-events-none absolute -left-1 top-0 text-7xl leading-none text-white/25"
      aria-hidden="true"
    >
      &ldquo;
    </span>
    <p
      className={`relative font-extrabold leading-tight tracking-tight text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.25)] ${
        (text || "").length > 120
          ? "text-base sm:text-lg"
          : "text-lg sm:text-xl"
      }`}
    >
      {text}
    </p>
    <span
      className="pointer-events-none absolute -bottom-5 right-2 text-7xl leading-none text-white/25"
      aria-hidden="true"
    >
      &rdquo;
    </span>
  </div>
);

const PostCard = ({ post, isSignedIn, getToken, index = 0, onDeleted }) => {
  const [cardRef, inView] = useInView();
  const isText = post.type === "text";

  // Owner-only options menu (delete).
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const token = await getToken();
      const res = await api.deletePost(post._id, token);
      onDeleted?.(post._id);
      // If deleting this post took XP back, refresh the daily challenges / XP UI.
      if (res?.revokedXp) {
        window.dispatchEvent(new CustomEvent("pitchside:engagement"));
      }
    } catch (err) {
      setDeleting(false);
      setDeleteError(err.message || "Could not delete");
    }
  };
  const [reactions, setReactions] = useState(post.reactions || []);
  const [myReaction, setMyReaction] = useState(post.myReaction || null);
  const [pending, setPending] = useState(false);
  // Bumping these keys remounts the burst / big-heart / bounce elements so
  // their CSS animations replay on each reaction.
  const [burstId, setBurstId] = useState(0);
  const [burstEmoji, setBurstEmoji] = useState("❤️");
  const [bigHeartId, setBigHeartId] = useState(0);
  const lastTap = useRef(0);

  const [comments, setComments] = useState(post.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [commentError, setCommentError] = useState("");

  const countFor = (emoji) =>
    reactions.find((r) => r.emoji === emoji)?.count || 0;

  // Recompute the reaction list locally for an instant, optimistic update.
  const applyLocal = (emoji) => {
    const counts = new Map(reactions.map((r) => [r.emoji, r.count]));
    if (myReaction) counts.set(myReaction, (counts.get(myReaction) || 1) - 1);

    let nextMine;
    if (myReaction === emoji) {
      nextMine = null; // tapping your current emoji clears it
    } else {
      counts.set(emoji, (counts.get(emoji) || 0) + 1);
      nextMine = emoji;
    }
    const next = REACTION_EMOJIS.filter((e) => counts.get(e) > 0).map((e) => ({
      emoji: e,
      count: counts.get(e),
    }));
    return { next, nextMine };
  };

  const react = async (emoji) => {
    if (!isSignedIn || pending) return;
    const { next, nextMine } = applyLocal(emoji);
    setReactions(next);
    setMyReaction(nextMine);
    if (nextMine === emoji) {
      setBurstEmoji(emoji);
      setBurstId((n) => n + 1);
    }
    setPending(true);
    try {
      const token = await getToken();
      const data = await api.reactToPost(post._id, emoji, token);
      setReactions(data.reactions);
      setMyReaction(data.myReaction);
    } catch {
      setReactions(post.reactions || []);
      setMyReaction(post.myReaction || null);
    } finally {
      setPending(false);
    }
  };

  // Double-tap/click the media: always pops the big heart; only adds ❤️ when
  // you have no reaction yet (never silently changes an existing one).
  const handleDoubleTapLike = () => {
    if (!isSignedIn) return;
    setBigHeartId((n) => n + 1);
    if (!myReaction && !pending) {
      react("❤️");
    } else {
      setBurstEmoji(myReaction || "❤️");
      setBurstId((n) => n + 1);
    }
  };

  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      handleDoubleTapLike();
    } else {
      lastTap.current = now;
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || commentPending) return;
    setCommentPending(true);
    setCommentError("");
    try {
      const token = await getToken();
      const data = await api.addComment(post._id, text, token);
      setComments((prev) => [...prev, data.comment]);
      setDraft("");
    } catch (err) {
      setCommentError(err.message || "Could not post comment");
    } finally {
      setCommentPending(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className={`card-reveal ${inView ? "card-reveal--in" : ""}`}
      style={{ transitionDelay: `${Math.min(index, 5) * 70}ms` }}
    >
    <article className="group/card flex flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-lg shadow-brand-purple/10 ring-1 ring-black/3 backdrop-blur-md transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-brand-purple/20">
      <header className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3">
        <span className="shrink-0 rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold p-[2px] shadow-sm shadow-brand-purple/20">
          <Avatar src={post.author?.imageUrl} name={post.author?.username} />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-sm font-bold text-neutral-800">
            <span className="truncate">
              {post.author?.username || "Pitchside fan"}
            </span>
            <VerifiedBadge />
          </p>
          <p className="flex items-center gap-1 text-[0.7rem] text-neutral-400">
            <span className="inline-block h-1 w-1 rounded-full bg-brand-teal/60" />
            {timeAgo(post.createdAt)}
          </p>
        </div>
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ring-1 ${
            isText
              ? "bg-brand-gold/15 text-brand-plum ring-brand-gold/30"
              : "bg-brand-teal/10 text-brand-teal-ink ring-brand-teal/25"
          }`}
        >
          {isText ? "📣 Chant" : "📸 Photo"}
        </span>

        {post.isOwner && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen((o) => !o);
                setConfirming(false);
              }}
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition hover:bg-brand-purple/8 hover:text-brand-purple"
            >
              <DotsIcon />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="comments-in absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-2xl border border-black/5 bg-white p-1.5 shadow-xl shadow-brand-purple/15"
              >
                {!confirming ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirming(true)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-red transition hover:bg-brand-red/8"
                  >
                    <TrashIcon /> Delete {isText ? "chant" : "post"}
                  </button>
                ) : (
                  <div className="px-2 py-1.5">
                    <p className="mb-2 text-xs leading-relaxed text-neutral-500">
                      Delete this {isText ? "chant" : "post"}? This can&apos;t be
                      undone.
                    </p>
                    {post.earnedXp > 0 && (
                      <p className="mb-2 rounded-lg bg-brand-red/8 px-2 py-1.5 text-xs font-semibold leading-relaxed text-brand-red">
                        Heads up: this {isText ? "chant" : "post"} earned you{" "}
                        {post.earnedXp} XP. Deleting it removes those {post.earnedXp}{" "}
                        XP — your other posts and XP stay safe.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 rounded-lg bg-brand-red px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(false);
                          setMenuOpen(false);
                        }}
                        className="flex-1 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-200"
                      >
                        Cancel
                      </button>
                    </div>
                    {deleteError && (
                      <p className="mt-1.5 text-xs text-brand-red">
                        {deleteError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      <div
        className={`relative mx-2.5 select-none overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 ${
          isSignedIn ? "cursor-pointer" : ""
        }`}
        onClick={isSignedIn ? handleMediaTap : undefined}
        aria-label={isSignedIn ? "Double tap to like" : undefined}
      >
        {isText ? (
          <ChantCard text={post.caption} seed={post._id} />
        ) : (
          <div className="aspect-4/3 overflow-hidden bg-linear-to-br from-brand-teal/20 to-brand-gold/20">
            {post.image ? (
              <>
                <img
                  src={post.image}
                  alt={post.caption || "Post image"}
                  className="h-full w-full object-cover transition duration-500 ease-out group-hover/card:scale-105"
                  loading="lazy"
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/20 to-transparent"
                  aria-hidden="true"
                />
              </>
            ) : (
              <div
                className="flex h-full items-center justify-center text-5xl"
                aria-hidden="true"
              >
                ⚽
              </div>
            )}
          </div>
        )}

        {bigHeartId > 0 && (
          <span
            key={bigHeartId}
            className="big-heart pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            aria-hidden="true"
          >
            <HeartIcon
              filled
              className="h-20 w-20 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        {!isText && post.caption && (
          <p className="mb-3 text-sm leading-relaxed text-neutral-600">
            {post.caption}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-0.5 gap-y-1 border-t border-brand-purple/5 pt-2.5">
          {REACTION_EMOJIS.map((e) => {
            const count = countFor(e);
            const mine = myReaction === e;
            const popping = burstId > 0 && burstEmoji === e;
            return (
              <button
                key={e}
                type="button"
                onClick={() => react(e)}
                disabled={!isSignedIn}
                aria-pressed={mine}
                aria-label={`React ${e}${count ? `, ${count} so far` : ""}`}
                className={`group/react relative inline-flex items-center gap-1 rounded-full px-1.5 py-1 transition active:scale-90 ${
                  mine
                    ? "bg-brand-purple/10 ring-1 ring-brand-purple/25"
                    : "hover:-translate-y-0.5 hover:bg-brand-purple/5"
                } ${isSignedIn ? "" : "cursor-not-allowed opacity-70"}`}
              >
                <span
                  key={popping ? `p-${burstId}` : "still"}
                  className={`text-lg leading-none transition-transform duration-200 ease-out group-hover/react:-rotate-12 group-hover/react:scale-125 ${
                    popping ? "react-bounce inline-block" : "inline-block"
                  }`}
                >
                  {e}
                </span>
                {count > 0 && (
                  <span
                    key={count}
                    className={`count-pop text-xs font-bold tabular-nums ${
                      mine ? "text-brand-purple" : "text-neutral-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
                {popping && (
                  <>
                    <LikeBurst key={`b-${burstId}`} />
                    <span
                      key={`f-${burstId}`}
                      className="emoji-float pointer-events-none absolute left-1/2 top-0 text-base"
                      aria-hidden="true"
                    >
                      {e}
                    </span>
                  </>
                )}
              </button>
            );
          })}

          <span
            className="mx-1 h-5 w-px shrink-0 bg-brand-purple/10"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={() => setShowComments((s) => !s)}
            aria-expanded={showComments}
            className={`group inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold transition ${
              showComments
                ? "text-brand-purple"
                : "text-neutral-500 hover:text-brand-purple"
            }`}
          >
            <span className="inline-flex transition-transform group-hover:-rotate-6 group-active:scale-90">
              <CommentIcon active={showComments} />
            </span>
            <span key={comments.length} className="count-pop tabular-nums">
              {comments.length}
            </span>
          </button>
        </div>

        {!isSignedIn && (
          <p className="mt-2 text-[0.7rem] text-neutral-400">
            <Link to="/sign-in" className="font-semibold text-brand-purple">
              Sign in
            </Link>{" "}
            to react.
          </p>
        )}

        {showComments && (
          <div className="comments-in mt-3 space-y-3 border-t border-brand-purple/5 pt-3">
            {comments.length === 0 ? (
              <p className="text-xs text-neutral-400">
                No comments yet — start the conversation.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {comments.map((c) => (
                  <li key={c._id} className="flex items-start gap-2">
                    <Avatar
                      src={c.imageUrl}
                      name={c.username}
                      size="h-7 w-7 text-xs"
                    />
                    <div className="min-w-0 rounded-2xl bg-brand-purple/5 px-3 py-1.5">
                      <p className="text-xs font-semibold text-neutral-700">
                        {c.username}
                      </p>
                      <p className="text-sm leading-snug text-neutral-600">
                        {c.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {isSignedIn ? (
              <form onSubmit={handleComment} className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={280}
                  placeholder="Add a comment…"
                  className="min-w-0 flex-1 rounded-full border border-brand-purple/20 bg-white px-3.5 py-2 text-sm text-neutral-800 transition focus:border-brand-purple focus:outline-none focus:ring-2 focus:ring-brand-purple/15"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || commentPending}
                  className="shrink-0 rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold px-4 py-2 text-xs font-semibold text-white shadow-sm transition enabled:hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {commentPending ? "…" : "Post"}
                </button>
              </form>
            ) : (
              <p className="text-xs text-neutral-400">
                <Link to="/sign-in" className="font-semibold text-brand-purple">
                  Sign in
                </Link>{" "}
                to join the conversation.
              </p>
            )}

            {commentError && (
              <p className="text-xs text-brand-red">{commentError}</p>
            )}
          </div>
        )}
      </div>
    </article>
    </div>
  );
};

const Feed = () => {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [state, setState] = useState({ status: "loading" });

  const fetchPosts = useCallback(async () => {
    const token = isSignedIn ? await getToken() : null;
    return api.getPosts(token);
  }, [getToken, isSignedIn]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await fetchPosts();
      setState({ status: "ready", posts: data.post ?? [] });
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }, [fetchPosts]);

  useEffect(() => {
    if (!isLoaded) return undefined;
    let cancelled = false;
    fetchPosts()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", posts: data.post ?? [] });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, fetchPosts]);

  const handleDeleted = useCallback((id) => {
    setState((s) =>
      s.status === "ready"
        ? { ...s, posts: (s.posts || []).filter((p) => p._id !== id) }
        : s
    );
  }, []);

  const posts = state.posts ?? [];

  // Real social-proof numbers derived from the loaded posts (reactions +
  // comments = "cheers"), plus a few distinct author avatars to stack.
  const totalCheers = posts.reduce((sum, p) => {
    const r = (p.reactions || []).reduce((s, x) => s + (x.count || 0), 0);
    return sum + r + (p.comments?.length || 0);
  }, 0);
  const fanAvatars = posts
    .map((p) => p.author)
    .filter(
      (a, i, arr) =>
        a && arr.findIndex((b) => b?.username === a?.username) === i
    )
    .slice(0, 4);
  const extraFans = Math.max(0, posts.length - fanAvatars.length);

  return (
    <>
    <PageShell
      icon="🔥"
      badge="Live feed"
      title="The Feed"
      subtitle="See what your friends are cheering for."
      doodle="trophy"
    >
      {/* Social proof + quick actions (brand palette to match the rest of the app) */}
      {state.status === "ready" && posts.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <div className="flex -space-x-2.5">
            {fanAvatars.map((a, i) => (
              <span
                key={`${a.username}-${i}`}
                className="rounded-full ring-2 ring-white"
              >
                <Avatar
                  src={a.imageUrl}
                  name={a.username}
                  size="h-8 w-8 text-xs"
                />
              </span>
            ))}
            {extraFans > 0 && (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-purple/10 text-[0.65rem] font-bold text-brand-purple ring-2 ring-white">
                +{extraFans}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            <strong className="font-extrabold text-brand-teal-ink">
              {totalCheers.toLocaleString()}
            </strong>{" "}
            cheers today
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          to="/create_a_post"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-brand-purple via-brand-red to-brand-gold px-4 py-3 text-sm font-bold text-white shadow-md shadow-brand-purple/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-purple/35"
        >
          📣 Create Chant
        </Link>
        <Link
          to="/create_a_post"
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-brand-purple/20 bg-white/85 px-4 py-3 text-sm font-bold text-brand-plum shadow-sm transition hover:-translate-y-0.5 hover:border-brand-purple/35 hover:bg-brand-purple/5 hover:shadow-md"
        >
          📸 Upload Photo
        </Link>
      </div>

      {state.status === "loading" && (
        <div
          className="flex flex-col gap-5"
          aria-busy="true"
          aria-label="Loading posts"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center rounded-3xl border border-white/85 bg-white/85 px-6 py-10 text-center shadow-md shadow-brand-purple/10 sm:py-12">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-red/8 text-2xl ring-1 ring-brand-red/15"
            aria-hidden="true"
          >
            📡
          </span>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral-600">
            Couldn&apos;t load posts. Make sure the backend is running, then try
            again.
          </p>
          <button
            onClick={load}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-red/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-red/35"
          >
            <span aria-hidden="true">↻</span> Try again
          </button>
        </div>
      )}

      {state.status === "ready" && posts.length === 0 && (
        <div className="flex flex-col items-center rounded-3xl border border-white/85 bg-white/85 px-6 py-10 text-center shadow-md shadow-brand-purple/10 sm:py-12">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-teal/10 text-2xl ring-1 ring-brand-teal/15"
            aria-hidden="true"
          >
            ⚽
          </span>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral-600">
            No posts yet — be the first to share a World Cup moment!
          </p>
          <Link
            to="/create_a_post"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-red/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-red/35"
          >
            Create a post
          </Link>
        </div>
      )}

      {state.status === "ready" && posts.length > 0 && (
        <>
          <div className="mb-4 flex justify-end">
            <button
              onClick={load}
              className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-purple/15 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-purple shadow-sm transition hover:-translate-y-0.5 hover:border-brand-purple/30 hover:bg-brand-purple/5 hover:shadow-md active:scale-95"
            >
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-500 group-hover:rotate-360"
              >
                ↻
              </span>{" "}
              Refresh
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {posts.map((post, i) => (
              <PostCard
                key={post._id}
                post={post}
                index={i}
                isSignedIn={isSignedIn}
                getToken={getToken}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        </>
      )}
    </PageShell>

    {/* Floating compose button (brand gradient) */}
    <Link
      to="/create_a_post"
      aria-label="Create a post"
      className="fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold text-2xl font-bold text-white shadow-xl shadow-brand-purple/35 transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-purple/45 active:scale-95 sm:bottom-10 sm:right-10"
    >
      <span aria-hidden="true" className="-mt-0.5">
        +
      </span>
    </Link>
    </>
  );
};

export default Feed;
