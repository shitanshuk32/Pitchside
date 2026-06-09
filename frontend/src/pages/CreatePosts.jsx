import { useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import PageShell from "./PageShell";
import { api } from "../lib/api";

const MAX_FILE_MB = 8;

const MODES = [
  { id: "photo", label: "📷 Photo" },
  { id: "chant", label: "📣 Chant" },
];

const CreatePosts = () => {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState("photo");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const isChant = mode === "chant";

  const pickFile = (selected) => {
    setError("");
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (selected.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_FILE_MB}MB.`);
      return;
    }
    setFile(selected);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(selected);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (isChant && !caption.trim()) {
      setError("Write your chant first.");
      return;
    }
    if (!isChant && !file) {
      setError("Add a photo to share.");
      return;
    }

    setStatus("submitting");
    try {
      const token = await getToken();
      if (isChant) {
        await api.createTextPost(caption.trim(), token);
      } else {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("caption", caption);
        await api.createPost(formData, token);
      }
      navigate("/get_all_posts");
    } catch (err) {
      setError(err.message || "Could not create post. Try again.");
      setStatus("idle");
    }
  };

  const submitting = status === "submitting";

  return (
    <PageShell
      icon="⚽"
      badge="Matchday post"
      title="Create a post"
      subtitle="Share your World Cup moment with the squad."
      doodle="ball"
    >
      <div className="rounded-3xl border border-white/85 bg-white/85 p-5 shadow-lg shadow-brand-purple/10 backdrop-blur-md sm:p-6">
        {/* Photo vs Chant tabs */}
        <div className="mb-5 inline-flex rounded-full border border-brand-purple/15 bg-brand-purple/5 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id);
                setError("");
              }}
              aria-pressed={mode === m.id}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                mode === m.id
                  ? "bg-linear-to-br from-brand-purple via-brand-red to-brand-gold text-white shadow-sm"
                  : "text-brand-purple hover:bg-brand-purple/10"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {!isChant && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-brand-plum">
                Photo
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand-purple/25 bg-brand-purple/5 transition hover:border-brand-purple/50 hover:bg-brand-purple/10"
              >
                {preview ? (
                  <>
                    <img
                      src={preview}
                      alt="Selected preview"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 py-1.5 text-center text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                      Change photo
                    </span>
                  </>
                ) : (
                  <span className="flex flex-col items-center gap-1.5 text-center">
                    <span className="text-3xl" aria-hidden="true">
                      📷
                    </span>
                    <span className="text-sm font-semibold text-brand-purple">
                      Tap to upload an image
                    </span>
                    <span className="text-xs text-neutral-400">
                      PNG or JPG, up to {MAX_FILE_MB}MB
                    </span>
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                id="image"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="caption"
              className="text-sm font-semibold text-brand-plum"
            >
              {isChant ? "Your chant" : "Caption"}
            </label>
            <textarea
              id="caption"
              placeholder={
                isChant
                  ? "Olé, olé, olé! 🎶 Belt out your matchday chant…"
                  : "What a goal! 🔥 #WorldCup"
              }
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={280}
              className="min-h-28 w-full resize-y rounded-xl border border-brand-purple/20 bg-white px-3.5 py-3 text-neutral-800 transition focus:border-brand-purple focus:outline-none focus:ring-4 focus:ring-brand-purple/15"
            />
            <span className="text-sm text-neutral-400">
              {caption.length}/280
            </span>
          </div>

          {error && (
            <p className="rounded-xl bg-brand-red/8 px-3.5 py-2.5 text-sm text-brand-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-brand-purple via-brand-red to-brand-gold bg-[length:200%_auto] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-red/30 transition enabled:hover:-translate-y-0.5 enabled:hover:bg-right enabled:hover:shadow-xl enabled:hover:shadow-brand-red/40 disabled:opacity-60 sm:w-auto sm:self-start"
          >
            {submitting ? (
              isChant ? (
                "Posting chant…"
              ) : (
                "Posting…"
              )
            ) : (
              <>
                {isChant ? "Post chant" : "Post it"}{" "}
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </form>
      </div>
    </PageShell>
  );
};

export default CreatePosts;
