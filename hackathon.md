# Hackathon log

- **Project:** convex-all-gas
- **Event:** Convex All Gas Hackathon
- **What it does:** Accepts owner-only iMessage shopping requests, returns Firecrawl search choices, and monitors a selected product URL for price or availability changes without authorizing a purchase.
- **Live app:** [https://precious-elk-593.convex.site](https://precious-elk-593.convex.site) (convex.site on the cloud development deployment, not production)
- **Repo:** https://github.com/hempun10/convex-all-gas
- **Frontend:** Vite and React, served through the Convex Static Hosting component
- **Convex deployment:** [https://precious-elk-593.convex.cloud](https://precious-elk-593.convex.cloud)
- **Components:** @spectrum-ts/convex, @firecrawl/firecrawl-convex, @convex-dev/static-hosting
- **Convex features:** schema, tables, indexes, queries, mutations, actions, HTTP actions, scheduled functions, realtime queries
- **Auth:** Convex Auth, custom `imessage-claim` credentials provider
- **AI models:** OpenAI gpt-5-nano classifies URL-free owner requests as clarify, search, or unsupported; it has no watch, checkout, payment, or purchase authority
- **Started:** 2026-09-19T15:00:00Z
- **Last updated:** 2026-09-22T19:30:00Z

## Log

### 2026-09-22T19:30:00Z — Messaging-flow correctness and conversation guardrails

A focused review of the owner texting flow, end to end, found one real bug and
several conversation-handling gaps; all were fixed.

`respond` was reading only the last message of a Spectrum "collapse"-mode
batch (`messages.at(-1) ?? carried.at(-1)`), so a quick multi-text burst — or
context carried over from a superseded turn — silently lost every line but
the final one. A new `combineBurst` helper joins `carried` then `messages`
(oldest to newest) into one logical turn instead.

A direct product-link message no longer leaves a stale URL-free clarification
brief behind: `handleDirectUrl` now clears any pending clarification for the
owner before doing scrape or reserve work, so a later unrelated reply can no
longer be merged with an old, different-product brief within its TTL.

`handleOwnerTurn`'s routing is wrapped in a try/catch: an unexpected
exception (as opposed to an already-handled typed failure) now still gets the
owner a reply and completes the chain, instead of leaving them with only the
acknowledgement and a chain that never answers.

Four smaller conversation gaps were closed: the owner texting the literal
word "settings" no longer gets hijacked into a dashboard-link resend (the
onboarding mutation now takes an `isOwner` flag); a bare cancel word
("cancel", "never mind", "stop", "reset") while a clarification is open closes
it deterministically with no model call; a clarification brief now carries a
`rounds` counter and gives up after three consecutive clarify turns instead of
asking forever; and a non-text message (image, tapback) from a known sender —
owner or not — now gets a reply routed through the same owner check instead
of always reading as an anonymous stranger.

Eleven new tests cover the burst-combining fix, the stale-clarification
clear, the exception fallback, the settings exemption, the round cap, the
cancel word, and the non-text routing. The suite is now at 125 passing
tests. `npm run check` (tsc, Convex typecheck and codegen dry run, Vite
build) and `git diff --check` pass. Not yet deployed or proven against the
owner's real handset in this entry.

### 2026-09-22T11:50:43Z — Conversational shopping handoff

The active-owner, URL-free chat flow is now acknowledgement, one-shot typing, GPT clarification/search/unsupported routing, Firecrawl only after the request is search-ready, and one concise picker link. The acknowledgement is short and queued without a `chainId`, so it cannot answer the chain or spend carried messages. A durable scheduled action polls that exact outbox row for up to about 5.5 seconds and enqueues one chain-bound typing event only after the acknowledgement is sent. The final response remains the chain answer. There is no claimed `stopTyping` API or typing heartbeat.

Direct public HTTPS product URLs bypass GPT and retain the deterministic scrape, reserve, and monitor path. URL-free classification uses the OpenAI Responses API with `gpt-5-nano`, native `fetch`, strict JSON Schema, `store: false`, minimal reasoning, a timeout, and bounded output. Request and response bodies, raw output, and provider bodies are neither logged nor persisted. GPT can only return clarify, search, or unsupported; trusted code does not let it create a watch, checkout, payment, or purchase.

At most one clarification projection is stored on the member: subject up to 80 characters, constraints up to 160, a bounded missing-field enum, creation and expiry timestamps, a 10-minute TTL, and a revision compare-and-set. Chat history, the clarification question or answer, the raw owner message, and raw model output are not stored. Purchase and unrelated requests receive concise rejections. Replies no longer repeat Prava, security, payment, or approval paragraphs; the picker remains the source for checkout badges and watch semantics. Untrusted provider titles are bounded before entering iMessage replies or alerts.

The dead app-card runtime and action and the unreferenced `pick-preview.html` were removed. `og-pick.jpg` remains as the live picker preview fallback.

Live synthetic model probes, with no owner data, produced the expected boundaries after the prompt correction: a vague shoes request clarified without inventing gender, style, or budget; a specific black Adidas Samba, size 10, under $100 request searched with exactly those facts; a database joke returned unsupported/unrelated; and a buy-now iPhone request returned unsupported/purchase. A continuation probe returned a bounded clarification. One earlier continuation call failed local validation; that remains evidence that model output is non-deterministic and fails closed, not a hidden success.

The focused suite has 114 passing tests. `npm run check`, the Convex codegen dry-run, and `git diff --check` pass. Development deployment `precious-elk-593` was updated; production was untouched.

The current demo next step is for the owner to send three messages through the real iMessage line: a vague product request, a clarification answer, and an unrelated request. Then inspect actual acknowledgement/typing/reply ordering and the picker link.

### 2026-09-22 - working tree

Real iMessage delivery from the owner's handset was observed, correcting the earlier note that only provider-shaped delivery had been seen. The request reached parsing, Shopify resolution, Firecrawl setup, and the reply path. A later live price edit reached Firecrawl, but the watch failed closed before the trigger transition.

The two follow-up failures exposed a brittle extraction contract. Firecrawl returned a numeric variant ID instead of the option label once, then added a `#MainContent` page fragment to an otherwise matching URL. The schema prompt and URL comparison were corrected, and red-capable regression tests brought the suite to 230 passing tests. There is no active watch or Firecrawl monitor now, and no trigger, approval, purchase, payment, or receipt proof exists.

The watcher has now been replaced with two smaller paths. A URL-free request uses Firecrawl Search with structured result scrapes and returns up to three validated, in-stock USD products within the optional price cap. It stores no selection session. The owner starts a watch by sending one chosen link. A direct URL skips Search, scrapes only that page, and creates a markdown Monitor through the official Firecrawl Node SDK. OpenAI parsing, Shopify-specific variant resolution, custom Monitor REST calls, check-detail pagination, scrape-ID lookup, credit estimation, and processing leases were removed.

The private settings dashboard now has an optional "Search near me" toggle with city, region, postal code, and country fields. Street addresses and coordinates are not stored or sent to Firecrawl. A changed Monitor event must include an explicit meaningful judgment, then Convex freshly scrapes the stored URL before comparing a USD cap or reporting availability. The same transaction records the outcome and queues the iMessage. Every alert states that nothing was purchased and that explicit approval is still required.

The focused suite now has 40 passing tests. TypeScript checks, the Convex typecheck and codegen dry run, the Vite build, and `git diff --check` pass. The owner approved removing the old development-only watcher history, so seven old watches and five old Firecrawl events were cleared before the new schema and functions deployed to development.

Live development proof now covers the new discovery and direct-scrape paths. Search rejected category pages and an over-cap result, then returned one in-stock Samba product at the requested USD cap. Scraping that exact result returned the same title, USD price, and availability. Monitor creation, webhook processing, and the new alert path still need a fresh live proof. No purchase, payment, or approval occurred.

The development dashboard now reports whether the optional search locality has both a city and country, and it accepts an approximate radius from 100 through 100,000 integer meters. Firecrawl does not provide exact distance filtering, so the radius becomes a disclosed search-query preference and is sent only when "Search near me" is on. The backend and development static site were updated; the deployed bundle contains the readiness states, radius input, and approximation notice. The suite now has 43 passing tests.

A real handset query later returned no choices even though a similar manual query worked. Replaying the exact message against the deployed action proved that location was disabled and unrelated. Firecrawl ranked category and social pages first; the first product pages appeared at positions 9 and 10 while the app requested only six results. Search now requests ten scraped results, adds an individual-product-page ranking hint, and allows unknown discovery-time availability unless Firecrawl explicitly reports unavailable. The direct-link scrape remains the authority before monitoring. Three consecutive live runs of the exact query each returned three products within the requested cap.

Discovery now returns up to four choices and blocks common social hosts even if extraction labels them as products. For each merchant, Firecrawl reads only the fixed public UCP profile path and assigns one listing badge: Prava verified, auto-checkout unsupported, or needs Prava verification. Verification requires a valid shopping service, checkout capability, and Shopify card handler at the same non-redirected merchant URL. The profile body is bounded, parsed as untrusted data, never stored, and no advertised endpoint is followed.

Live development proof kept the original Adidas results out of the verified state: two were unsupported for the selected Prava path and one needed verification. A separate query against a documented participating merchant returned one product as Prava verified. These badges do not authorize payment; a future Prava quote and transaction-specific approval remain mandatory. The suite now has 68 passing tests.

Historical, now-retired app-card behavior: live previews established that an iMessage App card opens inside Messages only when the sending app's iMessage extension is installed; without it iOS sends the tap to the App Store. The reply therefore became a plain text link that iMessage can unfurl from the page's Open Graph tags, with no extension required. The card action was temporarily kept as an unused route, then removed with the rest of the dead app-card runtime. The durable outbox reconstructs stored content from JSON and supports only text, so the link remains the primary reply.

The plain product list is now a token-bound picker. A URL-free request mints a single-use 15-minute session, the token travels in the card URL, and the picker page renders the real products as a grid with their photos, prices, and checkout badges. Choosing one opens an inline size field and target price chips, and submitting creates the existing watch through the same reservation and monitor path. The session is stored only as a SHA-256 hash, a new session closes the previous one, a submitted URL must match a candidate in that session, and the endpoints never expose the member, space, or token identifiers. If the card cannot be sent, the reply falls back to the text list.

The picker page is now served by the app itself rather than from a static file, so each link carries its own preview. Opening a link returns the page directly with no redirect, and its Open Graph title, description, and image come from that session's real products, with the image being the first product photo that validated. Product titles reach that HTML from the open web, so every interpolated value is escaped, and a test proves a hostile title cannot break out of an attribute or inject markup. Invalid, used, and expired tokens return an empty 404, and no member, space, or token identifier appears in the served page. Clicking into the size or target price field no longer collapses the form the owner is filling in.

Search extraction copies each product's main photo, validated as a clean HTTPS display-only URL. Verified live: the real search returned three products with working photos, the picker link returned the page with a real product photo and no redirect, bad tokens returned 404, and no identifiers leaked. Two gaps remain. The monitor still watches the product-level price, so a chosen size is stored for checkout and does not drive the trigger. And extraction can misread a price's magnitude; one live result came back as 75 minor units for a listing priced in dollars, so the fresh re-scrape before any trigger claim stays mandatory. The suite now has 87 passing tests.

### 2026-09-21T08:42:00Z — Landing page

Worked on the public landing page. Rebuilt it as a set of sections (hero, stack, benefits, how it works, trust, FAQ, and final CTA), dropped pricing and testimonials, and split each section into its own file under `src/components/landing/` for readability.

### 2026-09-21T04:36:23Z — Landing, iMessage onboarding, and dashboard claim

Added the invite-only entry point, iMessage onboarding, and a private settings dashboard. The landing, claim, and dashboard routes are served from `convex.site` by the official Convex Static Hosting component, mounted as a catch-all after the auth, health, and Spectrum routes so existing URLs did not change.

Onboarding is invite-only because the live Photon project is on the Free tier, which supports up to 10 registered users and only delivers messages from allowlisted senders. The landing page states that limit instead of implying that any visitor can text the agent.

Flow proof on the cloud development deployment used a correctly signed provider-shaped inbound delivery. The flow asked an unknown allowlisted sender for a name, activated the member, delivered a one-time settings link by iMessage, signed the member into Convex Auth, and opened the authenticated dashboard.

Sender identity is stored only as an HMAC. Claim tokens are random 256-bit values stored only as SHA-256 hashes, valid for 15 minutes, single use, and replaced when a new link is issued. No phone number, sender identifier, message text, name, or token appears in source, logs, or this file.

Local checks: five Convex tests pass covering onboarding transitions, replacement-claim invalidation, replay and expiry rejection, and unauthorized profile reads. Typecheck, Convex typecheck, Vite build, Prettier, markdownlint, `git diff --check`, and a source secret scan all pass. The Spectrum webhook proof was re-run after these changes and still returns forged `401`, signed `200`, and duplicate `200`; durable deduplication held.

The Messages CTA stays hidden until the assigned number is deliberately published. Product watching is now active on the development deployment. Prava checkout and receipts remain unimplemented.

### 2026-09-21 - working tree

Created the Vite and Convex baseline. The public health query, health HTTP action, and realtime frontend connection verify locally (`convex/health.ts`, `convex/http.ts`, `src/App.tsx`). Created and selected a five-day Convex cloud development deployment. Mounted the official Spectrum component with durable Photon webhook ingestion, collapse-mode batching, and a Node gRPC outbox sender (`convex/convex.config.ts`, `convex/spectrum.ts`, `convex/sender.ts`).

Provider proof 1 passed against the cloud development deployment. Photon’s dashboard legacy webhook path returned `503`, so the webhook was registered through Photon’s current `normalized-events.v1` API and its one-time signing secret was stored directly in Convex. The internal proof action (`convex/proofs/spectrum.ts`) confirmed forged-signature rejection (`401`), accepted signed delivery (`200`), accepted redelivery (`200`), and durable provider-ID deduplication. A correctly signed provider-shaped inbound delivery invoked the batch handler and returned the temporary reply through the Spectrum gRPC outbox. No message text, phone number, sender identifier, credential, or application record was recorded in this log.

Added owner-only product watches with a one-open-watch transaction, Firecrawl provisioning, authenticated and deduplicated webhook processing, fail-closed state changes, and bounded monitor cleanup. Those paths keep the existing owner gate and Spectrum cancellation checks (`convex/productWatches.ts`, `convex/firecrawl.ts`, `convex/http.ts`, `convex/schema.ts`).

The backend now accepts free-text watch requests containing a product link, exact size, and USD limit. The deterministic grammar runs first as an offline fallback. Otherwise, OpenAI `gpt-5-nano` uses the Responses API with Structured Outputs to copy only spans found in the message. Trusted code verifies every span, does all money arithmetic, and prevents the model from choosing the merchant, currency, canonical URL, or variant ID. The request sets `store: false`, so OpenAI keeps no copy of the message. Deterministic Shopify resolution reads public product JSON and cart currency, selects exactly one matching variant, and builds its canonical variant URL. This replaced the hardcoded single-product settings (`convex/photon.ts`, `convex/productWatches.ts`, `convex/productWatches.test.ts`).

Live diagnosis found and fixed four defects. The OpenAI timeout was 8 seconds while a response took about 9.9 seconds, so every natural-language request fell back; it is now 20 seconds. Full reasoning took 8 to 10 seconds; minimal reasoning reduced extraction to about 1 to 3 seconds. The extraction prompt returned surrounding prose instead of the isolated amount required by the anchored USD parser, so the prompt now asks for the amount alone. Literal null-like values are now absent fields, while every real value still has to pass the verbatim source check. Sanitized diagnostics now report OpenAI failures and Firecrawl baseline mismatches without logging the message or credentials.

A live watch now works end to end on the cloud development deployment. The owner's natural-language request passed signed Spectrum webhook intake and the owner gate, then completed OpenAI span extraction, deterministic Shopify variant resolution, canonical variant URL construction, and Firecrawl baseline validation. Firecrawl created the monitor, the app started a manual run, and the returned check was processed. This proof used a correctly signed provider-shaped delivery, not a message from the owner's own phone, because inbound delivery from the owner's handset has not been observed.

Driving the live provider found four more defects. Check detail reports extracted JSON by `currentScrapeId` instead of populating the documented inline snapshot, so the processor now reads the scrape document through a locally reconstructed path that cannot forward the API key elsewhere. An unfinished check with no pages and a scrape document that is not queryable yet now retry; a finished check with no pages still fails closed. Goal judging is disabled for the demo to remove per-check latency and credit use. An absent verdict now leaves the deterministic price, variant, currency, and availability gate in charge, while an explicit not-meaningful verdict still blocks (`convex/firecrawl.ts`, `convex/productWatches.ts`, `convex/productWatches.test.ts`).

After these fixes, the watch reached `active`. The monitor was created and run, its check completed with one `new` page, and the accepted snapshot contained the store's real item price and availability. The event ledger recorded processed `monitor.page` and `monitor.check.completed` deliveries.

This proves watch creation and activation, not a price-change trigger. No real product price has been changed, no watch has been observed entering `triggered`, and no change webhook with a qualifying price has been processed. The app has no purchase, payment, approval, or receipt behavior.

Automated tests pass with 228 tests across 2 files. TypeScript checks, the Vite build, `git diff --check`, and the Convex codegen dry-run pass.

### 2026-09-20T08:53:54Z — Design hardened after adversarial review

- Ran two independent adversarial reviews (judging, Convex, Firecrawl) and closed every identified approval blocker.
- The design required complete extracted JSON from monitor check detail rather than trusting webhook diffs. Live provider work later showed that the extraction must be fetched by scrape ID. Monitors are primed with a `new` check before any trigger evaluation.
- Added a replayable webhook envelope, transition contract, durable watch provisioning, owner-resolved approval lookup, checkout readiness polling, operator resolution evidence, an integration-health projection, and a function/authorization matrix.
- Rewrote the demo to use natural language OpenAI must parse, an auth-aware owner action, and a truthful 2:35 cut.
- Independent re-review returned approve with no remaining design blockers. At that point, no app code, deployment, or publication existed.

### 2026-09-20T08:31:21Z — Design revised against official judging criteria

- Made Firecrawl page monitoring, structured field diffs, meaningful-change judging, webhooks, and on-demand runs the product's watch engine.
- Added Convex Auth, authenticated and public realtime surfaces, auth-aware functions, scheduled recovery work, and production roles for the Firecrawl, AgentMail, and Static Hosting components.
- Added a judging-alignment matrix and expanded the implementation gate to six provider proofs.
- At this design-only point, implementation was blocked until the provider proofs passed. No app code, deployment, or publication had been created.
