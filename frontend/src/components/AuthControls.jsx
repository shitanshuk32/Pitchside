import { useAuth, UserButton } from "@clerk/react";
import { Link } from "react-router-dom";

// Compact auth widget: a "Sign in" pill when logged out, the Clerk user menu
// when logged in. Reused in the Home hero and the inner page header.
const AuthControls = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <div className="h-9 w-9" aria-hidden="true" />;
  }

  if (isSignedIn) {
    return (
      <UserButton
        appearance={{ elements: { userButtonAvatarBox: "h-9 w-9" } }}
      />
    );
  }

  return (
    <Link
      to="/sign-in"
      className="home-auth-btn inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-brand-purple via-brand-red to-brand-gold px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-red/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-red/35"
    >
      Sign in
    </Link>
  );
};

export default AuthControls;
