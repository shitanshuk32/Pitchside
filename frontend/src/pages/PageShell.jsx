import { Link } from "react-router-dom";
import { BallDoodle, TrophyDoodle } from "./doodles";

// Shared chrome for the inner pages: gradient backdrop, floating doodles,
// back link, badge, title and subtitle. Keeps pages consistent + responsive.
const PageShell = ({ badge, icon, title, subtitle, doodle = "ball", children }) => {
  const TopDoodle = doodle === "trophy" ? TrophyDoodle : BallDoodle;
  const BottomDoodle = doodle === "trophy" ? BallDoodle : TrophyDoodle;

  return (
    <div className="page-bg relative min-h-screen overflow-hidden px-5 pb-28 pt-7 sm:px-6 sm:pb-32 sm:pt-8">
      {/* Subtle decorative doodles, tucked into the corners so they never sit
          behind content cards. */}
      <TopDoodle className="animate-float pointer-events-none absolute right-[4%] top-[5%] w-12 text-ink/[0.06] sm:w-16" />
      <BottomDoodle className="animate-float pointer-events-none absolute bottom-[8%] left-[5%] w-10 text-brand-gold/15 [animation-delay:0.6s] sm:w-12" />

      <div className="animate-page-in relative z-10 mx-auto w-full max-w-2xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-brand-teal/25 bg-white/70 px-3.5 py-1.5 text-sm font-semibold text-brand-teal-ink shadow-sm shadow-brand-teal/5 transition hover:-translate-x-0.5 hover:shadow-lg hover:shadow-brand-teal/15"
        >
          ← Back home
        </Link>

        {badge && (
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-teal/20 bg-brand-teal/10 py-1.5 pl-3 pr-3.5 text-xs font-bold uppercase tracking-[0.08em] text-brand-teal-ink">
            {icon && (
              <span aria-hidden="true" className="text-sm leading-none">
                {icon}
              </span>
            )}
            {badge}
          </span>
        )}

        <h1 className="text-brand-gradient mb-2 text-[clamp(1.9rem,5vw,2.6rem)] font-bold leading-tight tracking-tight">
          {title}
        </h1>

        {subtitle && (
          <p className="mb-7 italic text-neutral-500">{subtitle}</p>
        )}

        {children}
      </div>
    </div>
  );
};

export default PageShell;
