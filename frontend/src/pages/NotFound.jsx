import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="page-bg flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="text-7xl sm:text-8xl" aria-hidden="true">
        ⚽
      </span>
      <h1 className="text-brand-gradient mt-4 text-5xl font-extrabold tracking-tight sm:text-6xl">
        404
      </h1>
      <p className="mt-2 text-base text-neutral-500 sm:text-lg">
        This one sailed over the bar. The page you want isn&apos;t here.
      </p>
      <Link
        to="/"
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-brand-purple via-brand-red to-brand-gold px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-red/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-red/40"
      >
        Back to Pitchside <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
};

export default NotFound;
