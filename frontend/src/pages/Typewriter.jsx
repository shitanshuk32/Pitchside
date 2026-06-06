import { useEffect, useState } from "react";
import "./Typewriter.css";

const Typewriter = ({
  lines,
  typingSpeed = 50,
  deletingSpeed = 30,
  pauseBetweenLines = 800,
  loop = false,
}) => {
  const [lineIndex, setLineIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [phase, setPhase] = useState("typing");

  useEffect(() => {
    if (!lines.length || lineIndex >= lines.length || phase === "done") return;

    const currentLine = lines[lineIndex];
    const isLastLine = lineIndex === lines.length - 1;

    if (phase === "pausing") {
      const timeout = setTimeout(() => {
        if (isLastLine && !loop) {
          setPhase("done");
        } else {
          setPhase("deleting");
        }
      }, pauseBetweenLines);

      return () => clearTimeout(timeout);
    }

    if (phase === "typing") {
      const timeout = setTimeout(() => {
        if (displayText.length < currentLine.length) {
          setDisplayText(currentLine.slice(0, displayText.length + 1));
        } else {
          setPhase("pausing");
        }
      }, typingSpeed);

      return () => clearTimeout(timeout);
    }

    if (phase === "deleting") {
      const timeout = setTimeout(() => {
        if (displayText.length > 0) {
          setDisplayText((prev) => prev.slice(0, -1));
        } else {
          setLineIndex((prev) => (prev + 1) % lines.length);
          setPhase("typing");
        }
      }, deletingSpeed);

      return () => clearTimeout(timeout);
    }
  }, [
    displayText,
    lineIndex,
    phase,
    lines,
    typingSpeed,
    deletingSpeed,
    pauseBetweenLines,
    loop,
  ]);

  // Reserve height for the longest line so the card never resizes mid-animation.
  const longestLine = lines.reduce(
    (longest, line) => (line.length >= longest.length ? line : longest),
    ""
  );

  return (
    <div className="typewriter">
      <div className="typewriter-inner">
        <div className="typewriter-dots">
          {lines.map((_, index) => (
            <span
              key={index}
              className={`typewriter-dot ${
                index === lineIndex
                  ? "active"
                  : index < lineIndex || phase === "done"
                    ? "done"
                    : ""
              }`}
            />
          ))}
        </div>

        <div className="typewriter-stage">
          <span className="typewriter-sizer" aria-hidden="true">
            {longestLine}
          </span>
          <p className="typewriter-line">
            <span className="typewriter-text">{displayText}</span>
            <span
              className={`cursor ${phase === "deleting" ? "cursor-delete" : ""}`}
            />
          </p>
        </div>
      </div>
    </div>
  );
};

export default Typewriter;
