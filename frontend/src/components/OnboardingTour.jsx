import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import "./OnboardingTour.css";

const STORAGE_KEY = "pitchside_onboarded_v1";

// Each step either targets a DOM element (via data-tour) or is centered.
const STEPS = [
  {
    target: null,
    emoji: "⚽",
    title: "Welcome to Pitchside",
    body: "Your home for the 2026 World Cup — play, predict, and climb the leaderboard. Here's a quick 30-second tour.",
  },
  {
    target: "matches",
    emoji: "📡",
    title: "Today's matches",
    body: "Follow live scores and tap any match to predict the winner. Correct calls earn you XP.",
  },
  {
    target: "challenges",
    emoji: "🔥",
    title: "Daily challenges & streak",
    body: "Complete a few quick tasks every day to earn XP and keep your streak alive. Miss a day and it resets!",
  },
  {
    target: "freekick",
    emoji: "🥅",
    title: "Free Kick Challenge",
    body: "Drag to aim, curve your shot, and beat the keeper. The top 3 scorers win a free custom jersey.",
  },
  {
    target: null,
    emoji: "🏆",
    title: "Explore more",
    body: "Use the bottom menu to open Predictions 🔮, the Match Centre 📡, and your tournament Bracket. You're all set — enjoy!",
  },
];

const PADDING = 8;

const OnboardingTour = () => {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  // Decide whether to run on first mount.
  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Small delay so the page has rendered its widgets.
      const id = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(id);
    }
  }, []);

  // Allow other UI (e.g. a "Replay tour" button) to start it on demand.
  useEffect(() => {
    const start = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("pitchside:start-tour", start);
    return () => window.removeEventListener("pitchside:start-tour", start);
  }, []);

  const current = STEPS[step];

  const measure = useCallback(() => {
    if (!current?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });
  }, [current]);

  // Scroll the target into view, then measure it.
  useLayoutEffect(() => {
    if (!active) return;
    if (current?.target) {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const id = setTimeout(measure, 350);
    return () => clearTimeout(id);
  }, [active, step, current, measure]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setActive(false);
  };

  const next = () => {
    if (step >= STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  if (!active || !current) return null;

  // Position the tooltip: below the target if there's room, else above; centered when no target.
  let cardStyle = {};
  if (rect) {
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const below = spaceBelow > 220;
    cardStyle = below
      ? { top: rect.top + rect.height + 14 }
      : { bottom: window.innerHeight - rect.top + 14 };
  }

  const isCentered = !rect;

  return (
    <div className="tour-root" role="dialog" aria-modal="true">
      {rect ? (
        <div
          className="tour-hole"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div
        className={`tour-card ${isCentered ? "tour-card--center" : ""}`}
        style={cardStyle}
      >
        <button className="tour-skip" onClick={finish} aria-label="Skip tour">
          Skip
        </button>

        <span className="tour-emoji" aria-hidden="true">
          {current.emoji}
        </span>
        <h3 className="tour-title">{current.title}</h3>
        <p className="tour-body">{current.body}</p>

        <div className="tour-dots">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`tour-dot ${i === step ? "tour-dot--active" : ""}`}
            />
          ))}
        </div>

        <div className="tour-actions">
          {step > 0 ? (
            <button className="tour-btn tour-btn--ghost" onClick={back}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button className="tour-btn tour-btn--primary" onClick={next}>
            {step >= STEPS.length - 1 ? "Let's go!" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
