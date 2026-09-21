# Hackathon log

- **Project:** convex-all-gas
- **Event:** Convex All Gas Hackathon
- **What it does:** Watches a controlled Shopify product through Firecrawl, requests exact purchase approval in iMessage, checks out through Prava, and confirms the receipt through AgentMail.
- **Live app:** [https://precious-elk-593.convex.site](https://precious-elk-593.convex.site) (convex.site on the cloud development deployment, not production)
- **Repo:** none
- **Frontend:** Vite and React, served through the Convex Static Hosting component
- **Convex deployment:** [https://precious-elk-593.convex.cloud](https://precious-elk-593.convex.cloud)
- **Components:** @spectrum-ts/convex, @convex-dev/static-hosting
- **Convex features:** schema, query, HTTP actions, internal actions and mutations, scheduled functions, realtime query
- **Auth:** Convex Auth, custom `imessage-claim` credentials provider
- **AI models:** none
- **Started:** 2026-09-19T15:00:00Z
- **Last updated:** 2026-09-21T08:42:00Z

## Log

### 2026-09-21T08:42:00Z — Landing page

Worked on the public landing page. Rebuilt it as a set of sections (hero, stack, benefits, how it works, trust, FAQ, and final CTA), dropped pricing and testimonials, and split each section into its own file under `src/components/landing/` for readability.

### 2026-09-21T04:36:23Z — Landing, iMessage onboarding, and dashboard claim

Added the invite-only entry point, iMessage onboarding, and a private settings dashboard. The landing, claim, and dashboard routes are served from `convex.site` by the official Convex Static Hosting component, mounted as a catch-all after the auth, health, and Spectrum routes so existing URLs did not change.

Onboarding is invite-only because the live Photon project is on the Free tier, which supports up to 10 registered users and only delivers messages from allowlisted senders. The landing page states that limit instead of implying that any visitor can text the agent.

Flow proof on the cloud development deployment: an unknown allowlisted sender was asked for a name, the name activated the member, a one-time settings link was delivered by iMessage, that link signed the member into Convex Auth, and the authenticated dashboard opened. Sanitized state confirmed one member in `active_claimed` linked to one auth user, one claim row already consumed and none live, and four outbound messages sent with zero failures.

Sender identity is stored only as an HMAC. Claim tokens are random 256-bit values stored only as SHA-256 hashes, valid for 15 minutes, single use, and replaced when a new link is issued. No phone number, sender identifier, message text, name, or token appears in source, logs, or this file.

Local checks: five Convex tests pass covering onboarding transitions, replacement-claim invalidation, replay and expiry rejection, and unauthorized profile reads. Typecheck, Convex typecheck, Vite build, Prettier, markdownlint, `git diff --check`, and a source secret scan all pass. The Spectrum webhook proof was re-run after these changes and still returns forged `401`, signed `200`, duplicate `200`, and one stored occurrence.

Still not done: the Messages CTA stays hidden until the assigned number is deliberately published, and product watching, Prava checkout, and receipts remain gated on provider proofs 2 through 6.

### 2026-09-21 - working tree

Created the Vite and Convex baseline. The public health query, health HTTP action, and realtime frontend connection verify locally (`convex/health.ts`, `convex/http.ts`, `src/App.tsx`). Created and selected a five-day Convex cloud development deployment. Mounted the official Spectrum component with durable Photon webhook ingestion, collapse-mode batching, and a Node gRPC outbox sender (`convex/convex.config.ts`, `convex/spectrum.ts`, `convex/sender.ts`).

Provider proof 1 passed against the cloud development deployment. Photon’s dashboard legacy webhook path returned `503`, so the webhook was registered through Photon’s current `normalized-events.v1` API and its one-time signing secret was stored directly in Convex. The internal proof action (`convex/proofs/spectrum.ts`) confirmed forged-signature rejection (`401`), accepted signed delivery (`200`), accepted redelivery (`200`), and durable provider-ID deduplication (one stored occurrence). A real inbound iMessage then invoked the batch handler and returned the exact temporary reply through the Spectrum gRPC outbox. Sanitized component state showed handled text input, no queued text, two sent outbox rows, no pending or failed rows, and one send attempt per row. No message text, phone number, sender identifier, or credential was recorded in this log.

### 2026-09-20T08:53:54Z — Design hardened after adversarial review

- Ran two independent adversarial reviews (judging, Convex, Firecrawl) and closed every identified approval blocker.
- Firecrawl now fetches complete `snapshot.json` from monitor check detail; webhook diffs are evidence only. Monitors are primed with a `new` check before quoting, and `isMeaningful` gates quote evaluation.
- Added a replayable webhook envelope, transition contract, durable watch provisioning, owner-resolved approval lookup, checkout readiness polling, operator resolution evidence, an integration-health projection, and a function/authorization matrix.
- Rewrote the demo to use natural language OpenAI must parse, an auth-aware owner action, and a truthful 2:35 cut.
- Independent re-review returned approve with no remaining blockers. Still no app code, deployment, or publication.

### 2026-09-20T08:31:21Z — Design revised against official judging criteria

- Made Firecrawl page monitoring, structured field diffs, meaningful-change judging, webhooks, and on-demand runs the product's watch engine.
- Added Convex Auth, authenticated and public realtime surfaces, auth-aware functions, scheduled recovery work, and production roles for the Firecrawl, AgentMail, and Static Hosting components.
- Added a judging-alignment matrix and expanded the implementation gate to six provider proofs.
- Implementation remains blocked until all provider proofs pass; no app code, deployment, or publication was created.
