import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "./PageShell";
import { api } from "../lib/api";

const SkeletonCard = () => (
  <article className="overflow-hidden rounded-2xl border border-white/85 bg-white/85 shadow-md shadow-brand-purple/10">
    <div className="h-44 animate-pulse bg-brand-purple/10" />
    <div className="space-y-2 px-3.5 py-4">
      <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-neutral-200/80" />
      <div className="h-3 w-full animate-pulse rounded-full bg-neutral-200/60" />
    </div>
  </article>
);

const Feed = () => {
  const [state, setState] = useState({ status: "loading" });

  const fetchPosts = useCallback(() => api.getPosts(), []);

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
  }, [fetchPosts]);

  const posts = state.posts ?? [];

  return (
    <PageShell
      icon="⚽"
      badge="Live feed"
      title="The Feed"
      subtitle="See what your friends are cheering for."
      doodle="trophy"
    >
      {state.status === "loading" && (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
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
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-purple/15 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-purple shadow-sm transition hover:border-brand-purple/30 hover:bg-brand-purple/5"
            >
              <span aria-hidden="true">↻</span> Refresh
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post._id}
                className="overflow-hidden rounded-2xl border border-white/85 bg-white/85 shadow-md shadow-brand-purple/10"
              >
                <div className="aspect-4/3 overflow-hidden bg-linear-to-br from-brand-teal/20 to-brand-gold/20">
                  {post.image ? (
                    <img
                      src={post.image}
                      alt={post.caption || "Post image"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full items-center justify-center text-5xl"
                      aria-hidden="true"
                    >
                      ⚽
                    </div>
                  )}
                </div>
                {post.caption && (
                  <div className="px-3.5 pb-4 pt-3 text-sm text-neutral-600">
                    {post.caption}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
};

export default Feed;
