import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Brand-matched look for all Clerk components (sign in, user button, etc.)
const clerkAppearance = {
  variables: {
    colorPrimary: "#833ab4",
    colorText: "#2c2c34",
    colorTextSecondary: "#6b7280",
    colorBackground: "#ffffff",
    borderRadius: "0.9rem",
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
  elements: {
    card: "shadow-xl shadow-brand-purple/10 border border-white/80",
    formButtonPrimary:
      "bg-gradient-to-br from-brand-purple via-brand-red to-brand-gold hover:opacity-95 text-sm normal-case font-semibold",
    headerTitle: "text-brand-plum",
    socialButtonsBlockButton: "border border-neutral-200",
    footerActionLink: "text-brand-purple hover:text-brand-red",
  },
};

const SetupNotice = () => (
  <div className="page-bg flex min-h-screen flex-col items-center justify-center px-6 text-center">
    <span className="text-6xl" aria-hidden="true">
      🔐
    </span>
    <h1 className="text-brand-gradient mt-4 text-3xl font-extrabold">
      Almost there
    </h1>
    <p className="mt-3 max-w-md text-neutral-600">
      Add your Clerk publishable key to{" "}
      <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">
        frontend/.env
      </code>{" "}
      as{" "}
      <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">
        VITE_CLERK_PUBLISHABLE_KEY
      </code>{" "}
      and restart the dev server.
    </p>
  </div>
);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      {PUBLISHABLE_KEY ? (
        <ClerkProvider
          publishableKey={PUBLISHABLE_KEY}
          appearance={clerkAppearance}
          afterSignOutUrl="/"
        >
          <App />
        </ClerkProvider>
      ) : (
        <SetupNotice />
      )}
    </BrowserRouter>
  </StrictMode>
);
