import { useEffect, useRef, useState } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import LandingPage from "@/components/sections/LandingPage";

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

type Locality = {
  searchNearMe: boolean;
  searchRadiusMeters?: number;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
};

/** Smallest existing-form addition for the backend locality settings. */
function LocalitySettings({ locality }: { locality: Locality }) {
  const updateLocality = useMutation(api.members.updateLocality);
  const [searchNearMe, setSearchNearMe] = useState(locality.searchNearMe);
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(
    String(locality.searchRadiusMeters ?? 5000),
  );
  const [city, setCity] = useState(locality.city ?? "");
  const [region, setRegion] = useState(locality.region ?? "");
  const [postalCode, setPostalCode] = useState(locality.postalCode ?? "");
  const [countryCode, setCountryCode] = useState(locality.countryCode ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  // A search locality only needs a city and a country code. Values stay in
  // state while the toggle is off so nothing is lost.
  const locationReady = city.trim().length > 0 && countryCode.trim().length > 0;
  const radiusValue =
    searchRadiusMeters.trim() === ""
      ? undefined
      : Number(searchRadiusMeters);

  return (
    <section aria-labelledby="locality">
      <h2 id="locality">Search locality</h2>
      <p>
        Optional. When on, URL-free searches use the search locality you save
        here. This is not a delivery address, and no street address or
        coordinates are stored.
      </p>
      <p role="status">
        {locationReady
          ? "Search location ready"
          : "Search location incomplete"}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setStatus("saving");
          updateLocality({
            searchNearMe,
            searchRadiusMeters: radiusValue,
            city: city.trim() || undefined,
            region: region.trim() || undefined,
            postalCode: postalCode.trim() || undefined,
            countryCode: countryCode.trim() || undefined,
          })
            .then(() => setStatus("saved"))
            .catch(() => setStatus("error"));
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={searchNearMe}
            onChange={(event) => setSearchNearMe(event.target.checked)}
          />{" "}
          Use my saved city for searches
        </label>
        <label>
          City
          <input
            value={city}
            disabled={!searchNearMe}
            onChange={(event) => setCity(event.target.value)}
          />
        </label>
        <label>
          Region
          <input
            value={region}
            disabled={!searchNearMe}
            onChange={(event) => setRegion(event.target.value)}
          />
        </label>
        <label>
          Postal code
          <input
            value={postalCode}
            disabled={!searchNearMe}
            onChange={(event) => setPostalCode(event.target.value)}
          />
        </label>
        <label>
          Country code
          <input
            value={countryCode}
            maxLength={2}
            disabled={!searchNearMe}
            onChange={(event) => setCountryCode(event.target.value)}
          />
        </label>
        <label>
          Search radius (meters)
          <input
            type="number"
            min={100}
            max={100000}
            step={1}
            value={searchRadiusMeters}
            disabled={!searchNearMe}
            onChange={(event) => setSearchRadiusMeters(event.target.value)}
          />
        </label>
        <p>
          The search radius is approximate. Results may include listings
          somewhat outside it.
        </p>
        <button type="submit" disabled={status === "saving"}>
          Save location
        </button>
        {status === "saved" && <span role="status">Saved.</span>}
        {status === "error" && <span role="alert">Couldn't save. Try again.</span>}
      </form>
    </section>
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

          {profile.locality !== undefined && (
            <LocalitySettings locality={profile.locality} />
          )}

          <section aria-labelledby="watches">
            <h2 id="watches">Product watches</h2>
            <p className="empty">
              Your watches are managed through iMessage. Send a product request
              or link to start one.
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

function LegalShell({
  title,
  children,
  onNavigate,
}: {
  title: string;
  children: React.ReactNode;
  onNavigate: (to: string) => void;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 py-24 font-sans text-foreground antialiased">
      <button
        type="button"
        onClick={() => onNavigate("/")}
        className="text-sm font-semibold text-muted-foreground transition-colors duration-700 hover:text-foreground"
      >
        ← Back to home
      </button>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-8 flex flex-col gap-6 text-base text-pretty text-muted-foreground">
        {children}
      </div>
    </main>
  );
}

function Privacy({ onNavigate }: { onNavigate: (to: string) => void }) {
  return (
    <LegalShell title="Privacy policy" onNavigate={onNavigate}>
      <p>
        Sathi is an invite only beta built for the Convex All Gas
        Hackathon. This page describes what the beta stores, in plain
        language.
      </p>
      <p>
        <strong className="text-foreground">What we store.</strong> Your
        sender identity is kept only as an HMAC, never as a raw phone number.
        We also store the display name you give the agent and your onboarding
        state. Dashboard claim tokens are 256 bit random values kept only as
        SHA 256 hashes. They work once and expire after 15 minutes.
      </p>
      <p>
        <strong className="text-foreground">What we never store.</strong> No
        phone number, message text, or claim token appears in the database,
        application logs, or source code.
      </p>
      <p>
        <strong className="text-foreground">Questions.</strong> Text the word
        settings to your iMessage agent to manage your access.
      </p>
    </LegalShell>
  );
}

function Terms({ onNavigate }: { onNavigate: (to: string) => void }) {
  return (
    <LegalShell title="Terms of service" onNavigate={onNavigate}>
      <p>
        Sathi is a hackathon beta provided as is. Access is invite
        only and limited to a small number of allowlisted testers.
      </p>
      <p>
        <strong className="text-foreground">Purchases.</strong> Sathi finds
        and monitors products, but it does not complete checkout or make
        purchases. Nothing is bought without action outside Sathi.
      </p>
      <p>
        <strong className="text-foreground">Availability.</strong> The beta
        is free, may change at any time, and comes with no uptime guarantee.
      </p>
    </LegalShell>
  );
}

function NotFound({ onNavigate }: { onNavigate: (to: string) => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-24 text-center font-sans text-foreground antialiased">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 max-w-[680px] text-4xl font-semibold tracking-tight text-balance">
        This page went out of stock
      </h1>
      <p className="mt-4 max-w-md text-pretty text-muted-foreground">
        The link you followed does not exist. Your agent is still one text
        away.
      </p>
      <button
        type="button"
        onClick={() => onNavigate("/")}
        className="mt-8 rounded-full bg-primary px-3 py-2 text-base font-semibold text-primary-foreground transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.03] active:scale-[0.98]"
      >
        Back to home
      </button>
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
  if (pathname === "/privacy") {
    return <Privacy onNavigate={navigate} />;
  }
  if (pathname === "/terms") {
    return <Terms onNavigate={navigate} />;
  }
  if (pathname === "/") {
    return <LandingPage />;
  }
  return <NotFound onNavigate={navigate} />;
}
