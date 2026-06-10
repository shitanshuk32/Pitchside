import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import AuthControls from "./AuthControls";
import "./Navbar.css";

const LINKS = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/get_all_posts", label: "Feed", icon: "📰" },
  { to: "/leaderboard", label: "Ranks", icon: "🏆" },
  { to: "/predictions", label: "Predict", icon: "🔮", primary: true },
  { to: "/match-centre", label: "Live", icon: "📡" },
  { to: "/create_a_post", label: "Post", icon: "➕" },
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
    pathname.startsWith("/sign-up")
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
              `nav-link ${l.primary ? "nav-link--predict" : ""} ${
                isActive ? "nav-link--active" : ""
              }`
            }
          >
            <span className="nav-icon" aria-hidden="true">
              {l.icon}
            </span>
            <span>{l.label}</span>
          </NavLink>
        ))}

        <div className="nav-auth">
          <AuthControls />
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
