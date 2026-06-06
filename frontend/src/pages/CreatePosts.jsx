import { useState } from "react";
import PageShell from "./PageShell";

const CreatePosts = () => {
  const [caption, setCaption] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Wiring to the backend can go here later.
  };

  return (
    <PageShell
      icon="⚽"
      badge="Matchday post"
      title="Create a post"
      subtitle="Share your World Cup moment with the squad."
      doodle="ball"
    >
      <div className="rounded-3xl border border-white/85 bg-white/85 p-5 shadow-lg shadow-brand-purple/10 backdrop-blur-md sm:p-6">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="image"
              className="text-sm font-semibold text-brand-plum"
            >
              Image URL
            </label>
            <input
              id="image"
              type="url"
              placeholder="https://your-photo-link.jpg"
              className="w-full rounded-xl border border-brand-purple/20 bg-white px-3.5 py-3 text-neutral-800 transition focus:border-brand-purple focus:outline-none focus:ring-4 focus:ring-brand-purple/15"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="caption"
              className="text-sm font-semibold text-brand-plum"
            >
              Caption
            </label>
            <textarea
              id="caption"
              placeholder="What a goal! 🔥 #WorldCup"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={280}
              className="min-h-28 w-full resize-y rounded-xl border border-brand-purple/20 bg-white px-3.5 py-3 text-neutral-800 transition focus:border-brand-purple focus:outline-none focus:ring-4 focus:ring-brand-purple/15"
            />
            <span className="text-sm text-neutral-400">
              {caption.length}/280
            </span>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-brand-purple via-brand-red to-brand-gold bg-[length:200%_auto] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-red/30 transition hover:-translate-y-0.5 hover:bg-right hover:shadow-xl hover:shadow-brand-red/40 sm:w-auto sm:self-start"
          >
            Post it <span aria-hidden="true">→</span>
          </button>
        </form>
      </div>

      <p className="mt-5 text-sm text-neutral-400">
        Heads up: this form is a themed preview — hook it to your backend to go
        live.
      </p>
    </PageShell>
  );
};

export default CreatePosts;
