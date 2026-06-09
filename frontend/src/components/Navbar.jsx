import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import AuthControls from "./AuthControls";

const LINKS = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/get_all_posts", label: "Feed", icon: "⚽" },
  { to: "/leaderboard", label: "Ranks", icon: "🏆" },
  { to: "/create_a_post", label: "Post", icon: "➕" },
];

// Floating top nav that mirrors social apps: it stays out of the way while you
// scroll down through posts, then slides back in the moment you scroll up.
const Navbar = () => {
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) {
        setHidden(false); // always visible near the top
      } else if (y > lastY.current + 4) {
        setHidden(true); // scrolling down → tuck away
      } else if (y < lastY.current - 4) {
        setHidden(false); // scrolling up → reveal
      }
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Home has its own hero header; auth pages stay distraction-free.
  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return null;
  }

  return (
    <header
      className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ${
        hidden ? "translate-y-[150%]" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <nav className="mx-auto mb-2.5 flex w-[min(100%-1rem,32rem)] items-center justify-around gap-1 rounded-full border border-white/70 bg-white/85 px-2 py-1.5 shadow-lg shadow-brand-purple/15 ring-1 ring-black/[0.04] backdrop-blur-md">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[0.65rem] font-bold leading-none transition sm:flex-row sm:gap-1.5 sm:rounded-full sm:text-sm ${
                isActive
                  ? "bg-brand-purple/10 text-brand-purple"
                  : "text-neutral-500 hover:bg-brand-purple/5 hover:text-brand-purple"
              }`
            }
          >
            <span className="text-lg leading-none sm:text-base" aria-hidden="true">
              {l.icon}
            </span>
            <span>{l.label}</span>
          </NavLink>
        ))}

        <div className="flex shrink-0 items-center justify-center px-1">
          <AuthControls />
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
