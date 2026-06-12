import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import AuthControls from "./AuthControls";
import "./Navbar.css";

const LINKS = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/get_all_posts", label: "Feed", icon: "📰" },
  { to: "/leaderboard", label: "Ranks", icon: "🏆" },
  { to: "/predictions", label: "Predict", icon: "🔮" },
  { to: "/match-centre", label: "Live", icon: "📡" },
];

const Navbar = () => {
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) {
        setHidden(false);
      } else if (y > lastY.current + 4) {
        setHidden(true);
      } else if (y < lastY.current - 4) {
        setHidden(false);
      }
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/complete-profile")
  ) {
    return null;
  }

  return (
    <header
      className={`nav-shell ${hidden ? "nav-shell--hidden" : ""}`}
    >
      <nav className="nav-bar">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `nav-link ${isActive ? "nav-link--active" : ""}`
            }
          >
            <span className="nav-icon" aria-hidden="true">
              {l.icon}
            </span>
            <span className="nav-label">{l.label}</span>
          </NavLink>
        ))}

        {/* Raised gradient FAB for creating a post */}
        <NavLink
          to="/create_a_post"
          aria-label="Create a post"
          className={({ isActive }) =>
            `nav-fab ${isActive ? "nav-fab--active" : ""}`
          }
        >
          <svg
            className="nav-fab-plus"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
          <span className="nav-fab-label">Post</span>
        </NavLink>

        <div className="nav-auth">
          <AuthControls />
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
