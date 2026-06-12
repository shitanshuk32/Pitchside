import { useState } from "react";
import { SignIn, SignUp } from "@clerk/react";
import { Link, useLocation } from "react-router-dom";
import { resolveRedirect } from "../lib/redirect";
import "./Auth.css";

const BENEFITS = [
  { icon: "🔮", text: "Predict match results & earn XP" },
  { icon: "⚽", text: "Bend free kicks past the keeper" },
  { icon: "🏆", text: "Climb the leaderboard for a free jersey" },
];

// Where to send the user once they're authenticated. Captured once on mount so
// Clerk's internal step navigation (which can drop our query param / router
// state) doesn't reset the destination back to home.
const useRedirectTarget = () => {
  const location = useLocation();
  const [target] = useState(() => resolveRedirect(location));
  return target;
};

// Strip Clerk's own card chrome so its form blends into our branded card.
const clerkAppearance = {
  layout: { socialButtonsPlacement: "top" },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "bg-transparent shadow-none border-0 p-0 w-full",
    header: "hidden",
    footer: "bg-transparent",
    footerAction: "text-sm",
    formButtonPrimary:
      "bg-gradient-to-br from-brand-purple via-brand-red to-brand-gold hover:opacity-95 text-sm normal-case font-semibold",
    footerActionLink: "text-brand-purple hover:text-brand-red font-semibold",
    socialButtonsBlockButton: "border border-neutral-200",
  },
};

const AuthLayout = ({ mode }) => {
  const target = useRedirectTarget();
  const isSignIn = mode === "sign-in";

  // Carry the redirect target across when the user flips between sign in / up.
  const otherHref = `${isSignIn ? "/sign-up" : "/sign-in"}?redirect_url=${encodeURIComponent(
    target
  )}`;

  // New sign-ups first land on a "complete your profile" step (username +
  // avatar), which then continues on to wherever they were headed.
  const signUpTarget = `/complete-profile?redirect_url=${encodeURIComponent(
    target
  )}`;

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
          <h2 className="auth-brand-title">Pitchside</h2>
          <p className="auth-brand-tagline">
            Your daily matchday hub. Predict, play and compete all tournament
            long.
          </p>
          <ul className="auth-brand-list">
            {BENEFITS.map((b) => (
              <li key={b.text}>
                <span className="auth-brand-ico">{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <span className="auth-card-badge">{isSignIn ? "👋" : "✨"}</span>
          <h1 className="auth-card-title">
            {isSignIn ? "Welcome back" : "Create your account"}
          </h1>
          <p className="auth-card-sub">
            {isSignIn
              ? "Sign in to save your XP, streak and leaderboard rank."
              : "Join free to earn XP, climb the ranks and compete for a jersey."}
          </p>

          {isSignIn ? (
            <SignIn
              routing="path"
              path="/sign-in"
              signUpUrl={otherHref}
              forceRedirectUrl={target}
              fallbackRedirectUrl={target}
              appearance={clerkAppearance}
            />
          ) : (
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl={otherHref}
              forceRedirectUrl={signUpTarget}
              fallbackRedirectUrl={signUpTarget}
              appearance={clerkAppearance}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default AuthLayout;
