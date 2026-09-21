import { useEffect, useRef, useState } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type ClaimStatus = "pending" | "success" | "error";

type OnboardingState = "awaiting_name" | "active_unclaimed" | "active_claimed";

const onboardingLabel = (state: OnboardingState) => {
  if (state === "active_claimed") {
    return "Complete";
  }
  if (state === "active_unclaimed") {
    return "Waiting for first dashboard sign-in";
  }
  return "Waiting for your name";
};

/** Pathname routing for three views. No router dependency needed. */
const usePathname = () => {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    setPathname(to);
  };

  return { pathname, navigate };
};

function Landing({ onNavigate }: { onNavigate: (to: string) => void }) {
  const health = useQuery(api.health.get);
  const config = useQuery(api.health.publicConfig);

  return (
    <main className="page">
      <p className="eyebrow">Convex All Gas · Invite-only beta</p>
      <h1>Approved Buy</h1>
      <p className="lede">
        Text a product to your iMessage agent. It watches the price, asks you to
        approve one exact quote, and reports the receipt.
      </p>

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <ol className="steps">
          <li>
            <strong>Text a product.</strong> Send the link and the exact variant
            you want.
          </li>
          <li>
            <strong>Approve an exact quote.</strong> You get the delivered total
            and a one-time approval code.
          </li>
          <li>
            <strong>Receive the receipt.</strong> The agent buys only that
            approved order and confirms it.
          </li>
        </ol>
      </section>

      <section aria-labelledby="access">
        <h2 id="access">Invite-only beta</h2>
        <p>
          Access is limited. Photon Free supports up to 10 allowlisted users, so
          each message number is provisioned one at a time — you can’t start
          texting from an arbitrary phone.
        </p>
        {config === undefined ? (
          <p className="status" role="status">
            Checking message access…
          </p>
        ) : config.messageUrl === null ? (
          <p className="status" role="status">
            Message access is still being configured. The invited number will
            appear here once it is ready.
          </p>
        ) : (
          <p>
            <a className="cta" href={config.messageUrl}>
              Open Messages to start
            </a>
          </p>
        )}
      </section>

      <section aria-labelledby="trust">
        <h2 id="trust">Approval and trust</h2>
        <p>
          Nothing is purchased without your exact approval. A message, a scraped
          page, or a model’s output can never authorize a purchase on its own.
        </p>
        <p className="status">
          Product watching and checkout are not live yet. They ship only after
          all six provider proofs pass.
        </p>
      </section>

      <p className="status" role="status" aria-live="polite">
        {health === undefined
          ? "Connecting to Convex…"
          : health.status === "ok"
            ? "Convex connected."
            : "Convex unavailable."}
      </p>

      <p className="status">
        Already set up?{" "}
        <button
          type="button"
          className="link"
          onClick={() => onNavigate("/dashboard")}
        >
          Open dashboard
        </button>
      </p>
    </main>
  );
}

function Claim({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { signIn } = useAuthActions();
  const [status, setStatus] = useState<ClaimStatus>("pending");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const token = new URLSearchParams(window.location.search).get("token");
    if (token === null) {
      setStatus("error");
      return;
    }
    window.history.replaceState({}, "", "/claim");

    signIn("imessage-claim", { token })
      .then(({ signingIn }) => {
        if (!signingIn) {
          setStatus("error");
          return;
        }
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [signIn]);

  return (
    <main className="page">
      <p className="eyebrow">Private settings link</p>
      <h1>Settings access</h1>

      {status === "pending" && (
        <p className="status" role="status" aria-live="polite">
          Confirming your one-time link…
        </p>
      )}

      {status === "error" && (
        <section aria-labelledby="claim-error">
          <h2 id="claim-error">This link can’t be used</h2>
          <p>
            This settings link is invalid or has expired. Text{" "}
            <code>settings</code> to your iMessage agent to get a fresh one.
            Links work once and expire after 15 minutes.
          </p>
          <button type="button" onClick={() => onNavigate("/")}>
            Back to home
          </button>
        </section>
      )}

      {status === "success" && (
        <section aria-labelledby="claim-success">
          <h2 id="claim-success">You’re signed in</h2>
          <p>Your private dashboard is ready.</p>
          <button type="button" onClick={() => onNavigate("/dashboard")}>
            Continue to dashboard
          </button>
        </section>
      )}
    </main>
  );
}

function Dashboard({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const profile = useQuery(api.members.profile);

  if (isLoading) {
    return (
      <main className="page">
        <p className="status" role="status" aria-live="polite">
          Checking your session…
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="page">
        <p className="eyebrow">Dashboard</p>
        <h1>Sign in required</h1>
        <p>Open the private settings link your iMessage agent sent you.</p>
        <p className="status">
          No link handy? Text <code>settings</code> to your agent for a new one.
        </p>
        <button type="button" onClick={() => onNavigate("/")}>
          Back to home
        </button>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="eyebrow">Dashboard</p>
      <h1>{profile?.displayName ?? "Your account"}</h1>

      {profile === undefined ? (
        <p className="status" role="status" aria-live="polite">
          Loading your profile…
        </p>
      ) : profile === null ? (
        <section aria-labelledby="no-profile">
          <h2 id="no-profile">No profile linked</h2>
          <p>
            This account isn’t connected to an iMessage profile yet. Text your
            agent to get a fresh settings link.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="account">
            <h2 id="account">Account</h2>
            <dl className="facts">
              <div>
                <dt>Display name</dt>
                <dd>{profile.displayName ?? "Not set"}</dd>
              </div>
              <div>
                <dt>iMessage</dt>
                <dd>
                  {profile.iMessageConnected ? "Connected" : "Not connected"}
                </dd>
              </div>
              <div>
                <dt>Onboarding</dt>
                <dd>{onboardingLabel(profile.onboardingState)}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="watches">
            <h2 id="watches">Product watches</h2>
            <p className="empty">
              No watches yet. Product watching isn’t live — it ships after the
              Firecrawl and Prava provider proofs pass.
            </p>
          </section>
        </>
      )}

      <p>
        <button
          type="button"
          onClick={() => {
            void signOut().then(() => onNavigate("/"));
          }}
        >
          Sign out
        </button>
      </p>
    </main>
  );
}

export default function App() {
  const { pathname, navigate } = usePathname();

  if (pathname === "/claim") {
    return <Claim onNavigate={navigate} />;
  }
  if (pathname === "/dashboard") {
    return <Dashboard onNavigate={navigate} />;
  }
  return <Landing onNavigate={navigate} />;
}
