import { useAuth, UserButton } from "@clerk/react";
import { Link, useNavigate } from "react-router-dom";

// Compact auth widget: a "Sign in" pill when logged out, the Clerk user menu
// when logged in. Reused in the Home hero (large) and the inner page header.
const AuthControls = ({ large = false }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  const avatarBox = large
    ? "h-12 w-12 ring-2 ring-brand-purple/40 ring-offset-2 shadow-lg shadow-brand-purple/25"
    : "h-9 w-9";

  if (!isLoaded) {
    return <div className={large ? "h-12 w-12" : "h-9 w-9"} aria-hidden="true" />;
  }

  if (isSignedIn) {
    return (
      <UserButton appearance={{ elements: { userButtonAvatarBox: avatarBox } }}>
        {/* Instagram-style entry point: a "My profile" item in the avatar menu
            that opens the user's posts + XP history (client-side route). */}
        <UserButton.MenuItems>
          <UserButton.Action
            label="My profile"
            labelIcon={<span aria-hidden="true">🏟️</span>}
            onClick={() => navigate("/profile")}
          />
        </UserButton.MenuItems>
      </UserButton>
    );
  }

  return (
    <Link
      to="/sign-in"
      className="home-auth-btn inline-flex items-center justify-center gap-1.5 rounded-full bg-linear-to-br from-brand-purple via-brand-red to-brand-gold px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-red/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-red/35"
    >
      Sign in
    </Link>
  );
};

export default AuthControls;
