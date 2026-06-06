import { SignUp } from "@clerk/react";
import { Link } from "react-router-dom";

const SignUpPage = () => (
  <div className="page-bg flex min-h-screen flex-col items-center justify-center px-5 py-10">
    <Link
      to="/"
      className="mb-6 text-sm font-semibold text-brand-teal-ink hover:underline"
    >
      ← Back to Pitchside
    </Link>
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      forceRedirectUrl="/leaderboard"
    />
  </div>
);

export default SignUpPage;
