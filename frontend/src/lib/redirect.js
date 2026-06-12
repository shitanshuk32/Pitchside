// Only accept same-origin paths so a crafted ?redirect_url can't bounce the
// user off to an external site after they authenticate.
export const sanitizePath = (p) => {
  if (!p || typeof p !== "string") return null;
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  return p;
};

// Work out where to send the user once they're authenticated:
//   1. the page they were trying to reach (ProtectedRoute sets location.state.from)
//   2. an explicit ?redirect_url= on the sign-in/up link
//   3. fall back to home
export const resolveRedirect = (location) => {
  const fromState = sanitizePath(location.state?.from);
  const fromQuery = sanitizePath(
    new URLSearchParams(location.search).get("redirect_url")
  );
  return fromState || fromQuery || "/";
};
