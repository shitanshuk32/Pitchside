import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useUser } from "@clerk/react";
import { api } from "../lib/api";
import PageShell from "./PageShell";
import "./Profile.css";

const fmtDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const reactionTotal = (post) =>
  (post.reactions || []).reduce((s, r) => s + (r.count || 0), 0);

const TABS = [
  { id: "posts", label: "Posts" },
  { id: "chants", label: "Chants" },
  { id: "xp", label: "XP history" },
];

// Photo tile in the grid.
const PhotoTile = ({ post, onOpen }) => (
  <button type="button" className="pf-tile" onClick={() => onOpen(post)}>
    <img src={post.image} alt={post.caption || "post"} loading="lazy" />
    <span className="pf-tile-meta">
      <span>❤️ {reactionTotal(post)}</span>
      <span>💬 {post.commentCount || 0}</span>
    </span>
    {post.earnedXp > 0 && <span className="pf-tile-xp">+{post.earnedXp} XP</span>}
  </button>
);

// Text "chant" card.
const ChantCard = ({ post, onOpen }) => (
  <button type="button" className="pf-chant" onClick={() => onOpen(post)}>
    <p className="pf-chant-quote">“{post.caption}”</p>
    <span className="pf-chant-foot">
      <span>❤️ {reactionTotal(post)}</span>
      <span>💬 {post.commentCount || 0}</span>
      {post.earnedXp > 0 && (
        <span className="pf-chant-xp">+{post.earnedXp} XP</span>
      )}
      <span className="pf-chant-date">{fmtDate(post.createdAt)}</span>
    </span>
  </button>
);

const XpEvent = ({ ev }) => (
  <li className="pf-event">
    <span className="pf-event-ico">{ev.emoji || "✨"}</span>
    <div className="pf-event-main">
      <p className="pf-event-label">{ev.label}</p>
      {ev.detail && <p className="pf-event-detail">{ev.detail}</p>}
    </div>
    <div className="pf-event-right">
      <span className="pf-event-amt">+{ev.amount}</span>
      <p className="pf-event-date">{fmtDate(ev.date)}</p>
    </div>
  </li>
);

const PostModal = ({ post, onClose, onDelete, deleting }) => {
  if (!post) return null;
  return (
    <div className="pf-overlay" onClick={onClose}>
      <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
        {post.type === "text" ? (
          <div className="pf-modal-chant">“{post.caption}”</div>
        ) : (
          <img className="pf-modal-media" src={post.image} alt="" />
        )}
        <div className="pf-modal-body">
          {post.type !== "text" && post.caption && (
            <p className="pf-modal-cap">{post.caption}</p>
          )}
          <div className="pf-modal-stats">
            <span>❤️ {reactionTotal(post)}</span>
            <span>💬 {post.commentCount || 0}</span>
            {post.earnedXp > 0 && (
              <span className="pf-modal-xp">+{post.earnedXp} XP</span>
            )}
            <span className="pf-modal-date">{fmtDate(post.createdAt)}</span>
          </div>
          <div className="pf-modal-actions">
            <button type="button" className="pf-btn" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="pf-btn pf-btn--danger"
              onClick={() => onDelete(post)}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Profile = () => {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [xp, setXp] = useState(null);
  const [posts, setPosts] = useState(null);
  const [tab, setTab] = useState("posts");
  const [active, setActive] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const [xpData, postData] = await Promise.all([
        api.getMyXp(token),
        api.getMyPosts(token),
      ]);
      setXp(xpData);
      setPosts(postData.posts || []);
      setError(false);
    } catch {
      setError(true);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (post) => {
    setDeleting(true);
    try {
      const token = await getToken();
      await api.deletePost(post._id, token);
      setActive(null);
      await load();
      window.dispatchEvent(new CustomEvent("pitchside:engagement"));
    } catch {
      /* keep modal open on failure */
    } finally {
      setDeleting(false);
    }
  };

  const name =
    user?.username ||
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "Player";

  const photoPosts = (posts || []).filter((p) => p.type !== "text");
  const chantPosts = (posts || []).filter((p) => p.type === "text");

  const xpProgress = xp
    ? Math.round((xp.xpInLevel / (xp.levelSize || 1000)) * 100)
    : 0;
  const accuracy =
    xp && xp.counts.totalPredictions > 0
      ? Math.round(
          (xp.counts.correctPredictions / xp.counts.totalPredictions) * 100
        )
      : null;

  const tabIndex = TABS.findIndex((t) => t.id === tab);

  return (
    <PageShell
      badge="World Cup 2026"
      icon="🏆"
      title="Your profile"
      subtitle="Your posts, chants and every XP you've earned."
      doodle="trophy"
    >
      <div className="pf">
        {error ? (
          <div className="pf-empty">
            <p className="pf-empty-emoji">⚠️</p>
            <p className="pf-empty-title">Couldn't load your profile</p>
            <button type="button" className="pf-cta" onClick={load}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* ---- Hero ---- */}
            <section className="pf-hero">
              <div className="pf-hero-top">
                {user?.imageUrl ? (
                  <img className="pf-avatar" src={user.imageUrl} alt="" />
                ) : (
                  <div className="pf-avatar-fallback">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="pf-id">
                  <h2 className="pf-name">{name}</h2>
                  <div className="pf-chips">
                    <span className="pf-chip pf-chip--level">
                      🏆 Level {xp?.level ?? "—"}
                    </span>
                    {xp?.rank != null && (
                      <span className="pf-chip pf-chip--rank">
                        🥇 Rank #{xp.rank}
                      </span>
                    )}
                    {xp?.streak > 0 && (
                      <span className="pf-chip pf-chip--streak">
                        🔥 {xp.streak} day{xp.streak === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <Link to="/complete-profile" className="pf-edit">
                    Edit profile
                  </Link>
                </div>
              </div>

              <div className="pf-xp">
                <div className="pf-xp-row">
                  <span>
                    <strong>{(xp?.total ?? 0).toLocaleString()}</strong> total XP
                  </span>
                  <span>
                    {xp
                      ? `${(xp.levelSize - xp.xpInLevel).toLocaleString()} XP to level ${
                          xp.level + 1
                        }`
                      : ""}
                  </span>
                </div>
                <div className="pf-xp-track">
                  <div className="pf-xp-fill" style={{ width: `${xpProgress}%` }} />
                </div>
              </div>

              <div className="pf-stats">
                <div className="pf-stat">
                  <span className="pf-stat-val">{photoPosts.length}</span>
                  <span className="pf-stat-lbl">Posts</span>
                </div>
                <div className="pf-stat">
                  <span className="pf-stat-val">{chantPosts.length}</span>
                  <span className="pf-stat-lbl">Chants</span>
                </div>
                <div className="pf-stat pf-stat--red">
                  <span className="pf-stat-val">{xp?.counts.goals ?? "—"}</span>
                  <span className="pf-stat-lbl">Goals</span>
                </div>
                <div className="pf-stat pf-stat--gold">
                  <span className="pf-stat-val">
                    {accuracy != null ? `${accuracy}%` : "—"}
                  </span>
                  <span className="pf-stat-lbl">Accuracy</span>
                </div>
              </div>
            </section>

            {/* ---- Tabs ---- */}
            <div className="pf-tabs">
              <span
                className="pf-tab-thumb"
                style={{ transform: `translateX(${tabIndex * 100}%)` }}
              />
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`pf-tab ${tab === t.id ? "pf-tab--active" : ""}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ---- Posts (photos) ---- */}
            {tab === "posts" &&
              (posts === null ? (
                <div className="pf-skel-grid">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="pf-skel" />
                  ))}
                </div>
              ) : photoPosts.length > 0 ? (
                <div className="pf-grid">
                  {photoPosts.map((p) => (
                    <PhotoTile key={p._id} post={p} onOpen={setActive} />
                  ))}
                </div>
              ) : (
                <div className="pf-empty">
                  <p className="pf-empty-emoji">📸</p>
                  <p className="pf-empty-title">No photo posts yet</p>
                  <p className="pf-empty-sub">Share a match-day moment.</p>
                  <Link to="/create_a_post" className="pf-cta">
                    Create a post
                  </Link>
                </div>
              ))}

            {/* ---- Chants (text) ---- */}
            {tab === "chants" &&
              (posts === null ? (
                <div className="pf-chants">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="pf-skel pf-skel--row" />
                  ))}
                </div>
              ) : chantPosts.length > 0 ? (
                <div className="pf-chants">
                  {chantPosts.map((p) => (
                    <ChantCard key={p._id} post={p} onOpen={setActive} />
                  ))}
                </div>
              ) : (
                <div className="pf-empty">
                  <p className="pf-empty-emoji">📣</p>
                  <p className="pf-empty-title">No chants yet</p>
                  <p className="pf-empty-sub">
                    Post a quick World Cup chant — no photo needed.
                  </p>
                  <Link to="/create_a_post" className="pf-cta">
                    Share a chant
                  </Link>
                </div>
              ))}

            {/* ---- XP history ---- */}
            {tab === "xp" &&
              (xp === null ? (
                <div className="pf-xplist">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="pf-skel pf-skel--row" />
                  ))}
                </div>
              ) : xp.events.length > 0 ? (
                <ul className="pf-xplist">
                  {xp.events.map((ev, i) => (
                    <XpEvent key={`${ev.source}-${i}`} ev={ev} />
                  ))}
                </ul>
              ) : (
                <div className="pf-empty">
                  <p className="pf-empty-emoji">⚡</p>
                  <p className="pf-empty-title">No XP yet</p>
                  <p className="pf-empty-sub">
                    Post, predict matches and score free kicks to start earning.
                  </p>
                </div>
              ))}
          </>
        )}
      </div>

      <PostModal
        post={active}
        onClose={() => setActive(null)}
        onDelete={handleDelete}
        deleting={deleting}
      />
    </PageShell>
  );
};

export default Profile;
