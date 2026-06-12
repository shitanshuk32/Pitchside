import { useAuth } from "@clerk/react";
import { Navigate, useLocation } from "react-router-dom";

// Gate routes behind authentication. Signed-out users are sent to /sign-in,
// remembering where they were headed so Clerk can return them after login.
const ProtectedRoute = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="page-bg flex min-h-screen items-center justify-center">
        <span className="animate-pulse text-3xl" aria-hidden="true">
          ⚽
        </span>
      </div>
    );
  }

  if (!isSignedIn) {
    // Remember where they were headed (in the URL so it survives a refresh, and
    // in state as a backup) so the auth screen can return them there on success.
    const from = location.pathname + location.search;
    return (
      <Navigate
        to={`/sign-in?redirect_url=${encodeURIComponent(from)}`}
        replace
        state={{ from }}
      />
    );
  }

  return children;
};

export default ProtectedRoute;
