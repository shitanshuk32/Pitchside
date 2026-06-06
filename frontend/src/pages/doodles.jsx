export const BallDoodle = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="3" />
    <path d="M32 17 l10 7.5 -4 12 h-12 l-4 -12 z" fill="currentColor" />
    <path
      d="M32 17 V8 M42 24.5 l8 -4.5 M38 36.5 l7 8.5 M26 36.5 l-7 8.5 M22 24.5 l-8 -4.5"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
);

export const TrophyDoodle = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path
      d="M20 12 h24 v8 a12 12 0 0 1 -24 0 z"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path
      d="M20 15 h-7 a7 7 0 0 0 9 10 M44 15 h7 a7 7 0 0 1 -9 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M28 33 h8 v8 h-8z M22 50 h20 M30 41 v9 M34 41 v9"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
