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
    return (
      <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
    );
  }

  return children;
};

export default ProtectedRoute;
