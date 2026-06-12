import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { resolveRedirect } from "../lib/redirect";
import "../components/Auth.css";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // Clerk caps profile images at ~10MB

const deriveName = (user) =>
  user?.username ||
  user?.firstName ||
  (user?.primaryEmailAddress?.emailAddress || "").split("@")[0] ||
  "";

const CompleteProfile = () => {
  const { isLoaded, isSignedIn, user } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [target] = useState(() => resolveRedirect(location));
  const [username, setUsername] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Seed fields from the freshly-created Clerk account.
  useEffect(() => {
    if (user) {
      setUsername((u) => u || deriveName(user));
      setPreview((p) => p || user.imageUrl || "");
    }
  }, [user]);

  if (!isLoaded) {
    return (
      <div className="page-bg flex min-h-screen items-center justify-center">
        <span className="animate-pulse text-3xl" aria-hidden="true">
          ⚽
        </span>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (f.size > MAX_AVATAR_BYTES) {
      setError("That image is too large (max 10MB).");
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const finish = () => navigate(target, { replace: true });

  const onSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (file) {
        await user.setProfileImage({ file });
      }

      const trimmed = username.trim();
      if (trimmed && trimmed !== user.username) {
        try {
          await user.update({ username: trimmed });
        } catch (usernameErr) {
          // If usernames aren't enabled on the Clerk instance the update is
          // rejected — fall back to a display name so the chosen name still
          // shows everywhere (the backend reads username OR first name).
          // Clear the last name too, otherwise the account's existing surname
          // (e.g. from Google) gets appended to the chosen name.
          const code = usernameErr?.errors?.[0]?.code || "";
          if (code === "form_param_unknown" || code === "form_param_nil") {
            await user.update({ firstName: trimmed, lastName: "" });
          } else {
            throw usernameErr;
          }
        }
      }

      await user.reload();
      finish();
    } catch (err) {
      setError(
        err?.errors?.[0]?.longMessage ||
          err?.errors?.[0]?.message ||
          err?.message ||
          "Could not save your profile. Please try again."
      );
      setBusy(false);
    }
  };

  const initial = (username || "?").charAt(0).toUpperCase();

  return (
    <div className="auth">
      <Link to="/" className="auth-back">
        ← Back to Pitchside
      </Link>

      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand-orb auth-brand-orb--1" />
        <div className="auth-brand-orb auth-brand-orb--2" />
        <div className="auth-brand-inner">
          <span className="auth-brand-badge">🏆 World Cup 2026</span>
          <h2 className="auth-brand-title">You&apos;re in!</h2>
          <p className="auth-brand-tagline">
            Set up how you&apos;ll show up on the leaderboard. Pick a name and a
            photo your rivals will remember.
          </p>
        </div>
      </aside>

      <main className="auth-panel">
        <form className="auth-card" onSubmit={onSave}>
          <span className="auth-card-badge">🎽</span>
          <h1 className="auth-card-title">Complete your profile</h1>
          <p className="auth-card-sub">
            Add a username and avatar so other fans recognise you on the
            leaderboard. You can change these later.
          </p>

          <div className="cp-avatar-row">
            <div className="cp-avatar">
              {preview ? (
                <img src={preview} alt="" className="cp-avatar-img" />
              ) : (
                <span className="cp-avatar-initial">{initial}</span>
              )}
            </div>
            <div className="cp-avatar-actions">
              <button
                type="button"
                className="cp-upload-btn"
                onClick={() => fileRef.current?.click()}
              >
                {preview ? "Change photo" : "Upload photo"}
              </button>
              <span className="cp-upload-hint">JPG or PNG, up to 10MB</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="cp-file-input"
            />
          </div>

          <label className="cp-label" htmlFor="cp-username">
            Username
          </label>
          <input
            id="cp-username"
            type="text"
            className="cp-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. midfield_maestro"
            autoComplete="off"
            maxLength={64}
          />

          {error && <p className="cp-error">{error}</p>}

          <button type="submit" className="cp-save" disabled={busy}>
            {busy ? "Saving…" : "Save & continue"}
          </button>
          <button
            type="button"
            className="cp-skip"
            onClick={finish}
            disabled={busy}
          >
            Skip for now
          </button>
        </form>
      </main>
    </div>
  );
};

export default CompleteProfile;
