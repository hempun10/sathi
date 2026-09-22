# Firecrawl product watch plan

Status: ready for credential-free implementation, blocked for live provider proof

Access date for external sources: 2026-09-21

## Goal

When the sole configured owner sends Photon one exact watch command, create one Firecrawl page monitor for one controlled Shopify product and prime it with a baseline check. Later checks may mark the watch triggered, but they cannot quote, approve, or buy anything.

This slice has one owner, one store, one product URL, one USD variant, quantity one, and one open watch. It stores normalized product fields and provider IDs only. It does not store message bodies, phone numbers, raw sender IDs, credentials, webhook bodies, diffs, or full Firecrawl snapshots.

## Decision summary

- Use deterministic parsing. OpenAI is not needed for one command with fixed fields.
- Use `@firecrawl/firecrawl-convex@0.1.1` for the initial structured scrape.
- Call the Firecrawl Monitor REST API directly for create, run, check, update, and delete. The Convex component does not expose monitor operations.
- Keep Firecrawl judgment as a noise filter. Convex must independently validate the URL, exact variant, USD currency, availability, and integer item price before changing state.
- A Firecrawl event can mark a watch triggered. It can never authorize spending.
- Defer Prava product identity, delivered-total quotes, approval, payment, and checkout. This slice tracks item price only.

## What exists now

- `convex/photon.ts` already receives Spectrum batches, extracts text and sender ID in memory, HMACs the sender, uses `members.onboard`, checks cancellation, and sends replies through the Spectrum outbox.
- `convex/spectrum.ts` already configures collapse mode, batching, pacing, the Photon handler, and the sender.
- `convex/http.ts` registers auth, health, Spectrum, and static-hosting routes in the right order for adding another explicit webhook before the static catch-all.
- `convex/schema.ts` has `members` keyed by HMAC-derived `senderKey`; no plaintext phone number or sender ID is stored.
- `convex/members.ts` returns `holding` for an already-onboarded member whose message is not `settings`. That is the existing command-routing seam.
- `convex/members.test.ts` establishes the test style: `convex-test`, Vitest, indexed reads, and deterministic clocks.
- `convex/convex.config.ts` already declares typed environment variables and mounts components.
- Installed Convex is `1.46.0`. The Firecrawl component declares peer support for `convex ^1.43.0`, so the versions are compatible.

Unrelated landing-page work is already uncommitted. Implementation must touch only the backend and package files listed below and must not reformat or revert frontend work.

## Current provider findings

### Firecrawl Convex component

The package exists. npm reports `@firecrawl/firecrawl-convex` version `0.1.1`, and the package points to the official `firecrawl/firecrawl-convex` repository.

Its current setup is:

1. Install `@firecrawl/firecrawl-convex`.
2. Declare `FIRECRAWL_API_KEY` in `defineApp`.
3. Mount the component with `app.use(firecrawl, { env: { FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY } })`.
4. Construct `new FirecrawlClient(components.firecrawl)` and call it from an app action.
5. Register `@firecrawl/firecrawl-convex/test` in `convex-test` tests.

The client exposes `scrape`, `map`, `search`, and durable crawl methods. It does not expose Monitor create, run, list-checks, get-check, update, or delete methods. Its webhook route is for durable crawl events, not page-monitor events. This plan therefore does not mount the component HTTP route because the first slice uses only `scrape` from the component.

The component returns Firecrawl scrape results at a permissive component boundary. Application code must validate every field before writing normalized values.

### Firecrawl Monitor

Current official docs support these design requirements:

- A `scrape` monitor can watch explicit URLs on a cron or text schedule. The minimum interval is five minutes.
- Monitor scrapes default to `maxAge: 0`, so they are fresh unless overridden.
- JSON-mode `changeTracking` accepts `modes: ["json"]` plus a schema or prompt. It emits field-path diffs and a complete `snapshot.json` in check detail.
- The first retained result for a URL is `new`; later results are `same`, `changed`, `removed`, or `error`.
- A goal enables meaningful-change judging by default. Changed pages can include `judgment.meaningful`, confidence, reason, and meaningful changes.
- Monitor webhooks support `monitor.page` and `monitor.check.completed`.
- Webhook configuration accepts custom headers. The endpoint must return `2xx` within 10 seconds. Firecrawl retries failed deliveries after 1, 5, and 15 minutes.
- `monitor.page` and `monitor.check.completed` payloads contain top-level `type`, `id`, `webhookId`, and a `data` array. Page entries contain `monitorId`, `checkId`, URL, status, judgment, and diff. Check-completed entries contain monitor ID, check ID, status, and summary.
- `GET /v2/monitor/{monitorId}/checks/{checkId}` returns check status, credit fields, and paginated pages. JSON-mode pages can contain `snapshot.json`.
- `POST /v2/monitor/{monitorId}/run` queues a manual check and returns HTTP 200. It returns HTTP 409 when a check is already running.
- Check statuses include `skipped_overlap` and `skipped_no_credits`. A normal no-credit skip has `actualCredits: 0` and resumes after credits return. Ordinary exhausted credits do not pause a monitor. Only revoked partner credits can cause Firecrawl to pause a monitor after three consecutive skips.
- Monitors work on the free plan, but Monitor requires an API key. The free plan has no pay-as-you-go and requests that consume credits return HTTP 402 when its balance is exhausted.
- Monitoring has no separate monitor fee. A scrape monitor costs one credit per URL per check. JSON extraction currently adds four credits per page. Meaningful-change judging adds one credit for each changed page judged. Create Monitor returns `estimatedCreditsPerMonth`.

### Unsupported or stale assumptions in the design

The following statements in `docs/imessage-commerce-agent-design.md` need correction at implementation time. Do not silently code around them.

1. **The Convex component does not manage monitors.** It can perform the baseline scrape, but Monitor calls need direct Firecrawl REST requests or another current client. Adding the Firecrawl JavaScript SDK is unnecessary for five small REST calls.
2. **The component baseline does not prime Monitor history.** The design already says this, and current docs confirm that Monitor owns its own retained snapshots. Create the monitor, call Run Monitor, and wait for the first `new` check before setting the watch to `active`.
3. **Create Monitor does not document an immediate check.** Treat creation and priming as separate operations.
4. **Run Monitor's 409 body is undocumented.** Do not expect a check ID in the 409 response. Read the monitor's documented `currentCheckId`, or list checks, after a 409.
5. **Provider-side idempotent monitor creation is not documented.** Create Monitor has no documented idempotency key, unique tag, or list-by-name filter. A deterministic monitor name helps manual reconciliation but cannot make retries safe. If the create response is lost, stop with `cleanup_required`; do not issue another create automatically.
6. **Webhook authentication is configured by the caller.** Monitor docs show custom headers and do not promise the component's per-crawl token or `X-Firecrawl-Signature` behavior for Monitor events. Use a dedicated random bearer token in the monitor's custom `Authorization` header and verify it in the app HTTP action.
7. **No-credit behavior has two forms.** A one-shot component scrape can fail with HTTP 402. A monitor check can finish as `skipped_no_credits`. Handle and test these separately.
8. **A provider-paused monitor is not the normal exhausted-credit case.** Automatic pausing applies to revoked partner-granted jobs, not an ordinary zero balance.
9. **The proposed stable tag lookup is unsupported.** Monitor has a name, but current List Monitors documents only limit and offset filters.
10. **Firecrawl cannot establish purchase identity or delivered total.** It can observe page fields. Prava must later resolve the exact merchant variant and supply shipping-and-tax-inclusive totals before any purchase flow exists.
11. **The six-proof implementation gate is too broad for this non-spending slice.** Credential-free parsing, persistence, webhook validation, and mocked provider tests can be built safely now. Live monitor activation remains gated on the Firecrawl proof. Prava proofs remain hard gates for any quote or purchase work.

## Required PM inputs

### Required now for the live Firecrawl proof

Supply names and configuration through the deployment environment or the proof checklist. Never place values in this plan, source control, logs, or test snapshots.

| Input | Proposed name | Requirement |
|---|---|---|
| Firecrawl API credential | `FIRECRAWL_API_KEY` | API key for the Firecrawl team used by the demo deployment |
| Monitor webhook bearer token | `FIRECRAWL_MONITOR_WEBHOOK_TOKEN` | Random app-owned token sent as `Authorization: Bearer ...` |
| Controlled product URL | `SHOPIFY_PRODUCT_URL` | Exact public HTTPS product URL, with no credentials, fragment, custom port, or redirect to another host |
| Controlled store host | `SHOPIFY_STORE_HOST` | Exact lowercase host allowed by the URL validator |
| Exact variant label | `SHOPIFY_PRODUCT_VARIANT` | Exact visible option string that the extraction must match |
| Expected starting item price | `SHOPIFY_EXPECTED_PRICE_MINOR` | Integer cents for baseline verification |
| Expected currency | `SHOPIFY_EXPECTED_CURRENCY` | Must be `USD` for this slice |
| Expected starting availability | `SHOPIFY_EXPECTED_AVAILABLE` | `true` or `false` for baseline verification |
| Trigger item price | `WATCH_TRIGGER_PRICE_MINOR` | Integer cents; state triggers only at or below this value |
| Schedule and demo budget | PM decision | Default proposal is every 30 minutes; approve the returned monthly estimate and enough credits for rehearsals |
| Public webhook URL | Derived and PM-confirmed | `https://<deployment>.convex.site/api/webhooks/firecrawl`; it must be reachable by Firecrawl |

The PM must also provide access to change the controlled store's exact variant price or availability and restore it after the proof.

### Firecrawl account and console setup

Required before the live proof:

1. Select the Firecrawl team and create a scoped API key for the demo deployment.
2. Confirm the current balance and whether credits are free-plan, paid, or partner-granted.
3. Confirm that the returned `estimatedCreditsPerMonth` is within the demo budget. At a 30-minute cadence, JSON extraction makes a long-running monitor materially more expensive than a plain one-page monitor. Delete it after the demo unless the PM approves ongoing use.
4. Set the two credential names above in the intended Convex deployment. The monitor webhook itself is configured by the Create Monitor request; no manual global webhook registration is needed.
5. For the no-credit proof, use an isolated Firecrawl team or API key with a safe spend limit. Do not drain the team's shared credits.

No paid plan is technically required. The free plan supports Monitor and currently includes 1,000 monthly credits, but it cannot auto-purchase more credits.

### Later Prava dependencies, not required for this slice

- A Prava-supported merchant/product and exact Prava product and variant identity.
- Saved-address ID and masked label.
- A delivered-total quote contract covering item price, shipping, tax, currency, expiry, and operation-key behavior.
- Hosted payment/passkey session support.
- Browser Harness checkout and status-only reconciliation.
- Proof that repeated checkout keys cannot create a second order or charge.

Until those exist, use the terms `item price` and `watch triggered`, not `delivered total`, `approved`, or `purchase ready`.

## Deterministic Photon command

Use one explicit grammar:

```text
WATCH <exact product URL> | VARIANT <exact variant label> | ITEM PRICE <= $<dollars.cents>
```

Rules:

- Match command keywords case-insensitively and trim outer whitespace.
- Require exactly two decimal places and convert to integer cents without floating-point arithmetic.
- Require the normalized URL to equal `SHOPIFY_PRODUCT_URL` and its host to equal `SHOPIFY_STORE_HOST`.
- Require the variant to equal `SHOPIFY_PRODUCT_VARIANT` after trimming only. Do not fuzzy-match variants.
- Require the parsed threshold to equal the PM-approved `WATCH_TRIGGER_PRICE_MINOR` for the one controlled demo.
- Reject extra fields and malformed commands with an example of the exact grammar.
- Parse in memory. Persist only normalized fields and a SHA-256 request key, never the message text.

This is enough for the first slice and remains the outage fallback described by the larger design. Add OpenAI only when flexible phrasing is a judged requirement and only as an untrusted parser whose output passes these same checks.

## Smallest safe architecture

```text
Photon delivery
  -> Spectrum verifies, deduplicates, and invokes photon.respond
  -> photon.respond HMACs sender and runs existing onboarding
  -> deterministic command parser validates the controlled request
  -> one Convex mutation creates or returns the sole open watch
  -> Firecrawl provisioning action performs component baseline scrape
  -> direct Monitor REST create, save monitor ID, then Run Monitor
  -> Photon replies that the baseline check is queued

Firecrawl monitor webhook
  -> HTTP action verifies bearer token before JSON parsing
  -> bounded envelope validation
  -> one Convex mutation deduplicates, stores minimal IDs/hash, and atomically schedules processing
  -> return 202 within 10 seconds
  -> scheduled action fetches check detail
  -> mutation validates normalized snapshot and moves watch state
  -> delayed watchdog mutation requeues a crashed processor
```

No provider output enters a spending state. No action writes application tables directly; actions call internal mutations.

## Data model

### `productWatches`

| Field | Type | Purpose |
|---|---|---|
| `memberId` | `Id<"members">` | Sole owner derived from the HMAC sender lookup |
| `requestKey` | string | SHA-256 of normalized URL, variant, currency, quantity, and trigger |
| `canonicalUrl` | string | Exact allowlisted product URL |
| `merchantHost` | string | Exact allowlisted host |
| `variantLabel` | string | PM-supplied exact visible variant |
| `quantity` | literal `1` | Fixed MVP quantity |
| `currency` | literal `USD` | Fixed MVP currency |
| `expectedPriceMinor` | number | PM-supplied baseline cents |
| `expectedAvailable` | boolean | PM-supplied baseline availability |
| `triggerPriceMinor` | number | Deterministic item-price threshold |
| `status` | enum | `provisioning`, `priming`, `active`, `triggered`, `cancelled`, `failed`, `cleanup_required` |
| `isOpen` | boolean | Enforces one provisioning, priming, or active watch per member through one indexed transaction |
| `providerMonitorName` | string | Deterministic operator aid such as `convex-all-gas:<watchId>`; not an idempotency guarantee |
| `providerMonitorId` | optional string | Firecrawl monitor ID |
| `baselineCheckId` | optional string | First accepted `new` check |
| `lastCheckId` | optional string | Latest accepted check |
| `baselinePriceMinor` | optional number | Validated baseline only |
| `latestPriceMinor` | optional number | Latest validated observation |
| `latestAvailable` | optional boolean | Latest validated availability |
| `lastObservedAt` | optional number | Server receipt time |
| `failureCode` | optional enum | Sanitized code only |
| `createdAt` / `updatedAt` | number | Server timestamps |

Indexes:

- `by_member_id_and_is_open` on `memberId, isOpen`
- `by_request_key` on `requestKey`
- `by_provider_monitor_id` on `providerMonitorId`

The create mutation reads `by_member_id_and_is_open` and inserts only if no open row exists. Convex transaction serialization prevents two simultaneous commands from creating two open rows. A duplicate request returns the existing watch without another provider call. A different request is rejected while a watch is open.

### `firecrawlEvents`

| Field | Type | Purpose |
|---|---|---|
| `dedupeKey` | string | `<eventType>:<webhookId>` |
| `domainKey` | string | `<monitorId>:<checkId>:<eventType>` for defense against redelivery under a new webhook ID |
| `eventType` | enum | `monitor.page` or `monitor.check.completed` |
| `webhookId` | string | Firecrawl delivery identifier |
| `monitorId` | string | Expected monitor identifier |
| `checkId` | string | Check identifier |
| `eventUrl` | optional string | Must exactly equal the watch URL when present |
| `pageStatus` | optional enum | `same`, `new`, `changed`, `removed`, `error` |
| `checkStatus` | optional enum | Documented check statuses |
| `bodyHash` | string | SHA-256 of the received body, for duplicate diagnostics only |
| `status` | enum | `received`, `processing`, `processed`, `retryable_failed`, `permanent_failed` |
| `attemptCount` | number | Bounded processor attempts |
| `processingLeaseUntil` | optional number | Crash recovery boundary |
| `isMeaningful` | optional boolean | Normalized judgment result |
| `observedPriceMinor` | optional number | Accepted normalized value, not raw snapshot |
| `observedAvailable` | optional boolean | Accepted normalized value |
| `failureCode` | optional enum | Sanitized code only |
| `receivedAt` / `processedAt` | number / optional number | Server times |

Indexes:

- `by_dedupe_key`
- `by_domain_key`
- `by_status_and_processing_lease_until`

Do not add a separate products table, observations table, generalized provider layer, workflow component, cron, or dashboard in this slice. The latest accepted normalized values and minimal event ledger cover the requested behavior.

## Watch state transitions

| Current | Event | Next | Notes |
|---|---|---|---|
| none | Valid unique Photon command | `provisioning` | Insert intent before provider I/O |
| `provisioning` | Baseline component scrape matches all expected fields | `provisioning` | Continue to monitor creation |
| `provisioning` | Monitor create returns ID | `priming` | Persist ID before Run Monitor |
| `priming` | Run Monitor 200 | `priming` | Check is queued |
| `priming` | First complete page result is `new` and matches expected baseline | `active` | Save baseline; `new` can never trigger |
| `active` | `same` | `active` | Update health/check ID only |
| `active` | Meaningful `changed`, exact identity, available, USD, item price above threshold | `active` | Save normalized latest observation |
| `active` | Meaningful `changed`, exact identity, available, USD, item price at or below threshold | `triggered` | Set `isOpen=false`; schedule monitor cleanup; no quote or purchase |
| `active` | `removed`, wrong variant, wrong currency, invalid snapshot, or repeated errors | `failed` | Set `isOpen=false`; delete monitor |
| any open state | Owner cancellation | `cancelled` | Set `isOpen=false` before provider delete |
| `provisioning` | Create response is uncertain | `cleanup_required` | Never create a replacement automatically |
| any | Duplicate or late result | unchanged | Return current state without a second side effect |

A Firecrawl judgment alone never triggers. The deterministic predicate is:

```text
status == changed
and judgment.meaningful == true
and canonical URL == configured URL
and variant == configured exact variant
and currency == USD
and availability == true
and itemPriceMinor is a nonnegative integer
and itemPriceMinor <= triggerPriceMinor
```

## Provisioning and idempotency

1. `photon.respond` keeps the existing onboarding call. When it receives `holding`, it attempts the deterministic watch grammar.
2. Hash and validate the sender exactly as today. `requestWatch` looks up the member by `senderKey`; it never accepts a member ID from Photon input.
3. `requestWatch` computes the normalized request key and transactionally returns one of `created`, `already_exists`, or `conflict`.
4. Only `created` starts provider I/O. Semantic duplicates and Spectrum redeliveries return the existing state.
5. Perform the component baseline JSON scrape. Validate exact URL/host, variant, USD, availability, and expected starting price. A mismatch fails before monitor creation.
6. Create one Monitor with the deterministic name, one `scrape` target, JSON change tracking, explicit schema, `maxAge: 0`, the approved schedule, goal, custom bearer header, both monitor events, and minimum useful retention.
7. Compare `estimatedCreditsPerMonth` to a PM-approved maximum before keeping the monitor. If over budget, delete it and fail with a sanitized code.
8. Persist `providerMonitorId` immediately. Only then call Run Monitor.
9. HTTP 200 stores the returned check ID when present. HTTP 409 does not create another check; read `currentCheckId` from Get Monitor or list the newest running check.
10. Do not automatically retry Create Monitor after a timeout or connection loss. Mark `cleanup_required`, reconcile by deterministic name in the Firecrawl dashboard or paginated List Monitors, attach the one confirmed monitor manually, or delete it before retrying.

## Webhook fast-ack and processing

### HTTP action

Register `POST /api/webhooks/firecrawl` before static hosting.

1. Require an exact `Authorization: Bearer <token>` match using a constant-time byte comparison. Reject missing or wrong credentials with 401 before parsing JSON.
2. Reject a declared or actual body over 64 KiB with 413.
3. Hash the body, parse it as `unknown`, and validate the exact event type, UUID-like nonempty IDs, one bounded `data` item, and documented status fields. Do not log parse errors with body content.
4. Call one internal mutation with only the normalized envelope and body hash.
5. The mutation verifies that the monitor ID belongs to an existing watch, checks the exact URL when supplied, deduplicates by both keys, inserts the event, and atomically schedules the processor action plus a delayed watchdog mutation.
6. Return 202 for accepted and duplicate authenticated events. Return non-2xx if the durable mutation fails so Firecrawl retries.

### Processor

1. Claim the event with a one-minute lease and increment `attemptCount`.
2. Fetch check detail from Firecrawl using the stored monitor and check IDs. Never trust the webhook diff as a complete product state.
3. Follow check-detail pagination only until the single expected URL is found. Reject any unexpected URL and cap pages read.
4. For `monitor.check.completed`, store normalized check status and credit values only. It cannot trigger the watch.
5. For `monitor.page`, validate `snapshot.json` against the strict product shape. Never store the snapshot or diff.
6. Apply the state transition in one mutation that compares monitor ID, check ID, current watch state, and event status.
7. Mark the event processed in the same transaction as the watch update.
8. On retryable Firecrawl errors, store a sanitized code and schedule bounded backoff. After three attempts, mark permanent failure and fail the watch closed.
9. The delayed watchdog does nothing if processed. If the lease expired or the action never claimed the event, it requeues the processor. Scheduled mutations are exactly-once; scheduled actions are at-most-once, so this watchdog is required after a fast webhook acknowledgment.

## URL allowlisting and SSRF controls

Although Firecrawl performs the fetch, incoming URLs remain untrusted.

- Parse with the platform `URL` class.
- Require `https:`.
- Reject usernames, passwords, fragments, and non-default ports.
- Reject IP-literal hosts, `localhost`, `.local`, and any host other than the exact configured Shopify host.
- Normalize the hostname to lowercase and remove only the default HTTPS port.
- Require the whole normalized URL to equal `SHOPIFY_PRODUCT_URL`; do not accept arbitrary paths, subdomains, query parameters, URL shorteners, or redirects supplied by the user.
- Require Firecrawl's returned URL/canonical URL and every check page URL to equal the configured URL.
- During provider proof, confirm the controlled URL does not redirect off-host. If it does, use the final stable Shopify URL as the configured URL.
- Never forward user-supplied headers, cookies, proxy settings, scrape actions, or Firecrawl `extra` options.

This exact-URL rule is smaller and safer than a reusable domain policy for a one-product demo.

## File-by-file implementation plan

Only these files should change during implementation:

### `package.json` and `package-lock.json`

- Add exact-compatible `@firecrawl/firecrawl-convex@^0.1.1`.
- Do not add `@mendable/firecrawl-js`; native `fetch` covers the unsupported Monitor endpoints.

### `convex/convex.config.ts`

- Import the Firecrawl component config.
- Declare `FIRECRAWL_API_KEY`, `FIRECRAWL_MONITOR_WEBHOOK_TOKEN`, controlled Shopify settings, expected baseline fields, trigger cents, and a maximum monthly credit estimate as typed environment variables.
- Mount Firecrawl with the API key passed by reference.
- Do not set `httpPrefix`; durable crawl webhooks are not used.

### `convex/schema.ts`

- Add `productWatches` and `firecrawlEvents` exactly as scoped above.
- Keep all enums as literal unions and add only the three indexes per table listed above.

### `convex/productWatches.ts` (new)

- Add the strict command parser and money parser.
- Add internal mutations for create-or-return, baseline validation, monitor attachment, event claim, event application, retry/watchdog, failure, cancellation, and cleanup completion.
- Reuse the existing `members.by_sender_key` lookup. Accept `senderKey`, not raw sender ID or client-supplied member ID.
- Keep all registered functions internal and give each arguments and return validators.

### `convex/firecrawl.ts` (new)

- Construct `FirecrawlClient(components.firecrawl)` for the baseline scrape.
- Add the smallest direct REST helper around `fetch` for Monitor create, run, get, check detail, and delete. Narrow every response from `unknown`; do not expose a general provider interface.
- Add internal provisioning, event-processing, and cleanup actions.
- Redact provider errors to stable codes. Do not log URLs with query strings, response bodies, snapshots, webhook content, or credentials.

### `convex/photon.ts`

- Preserve current onboarding, sender HMAC, cancellation checks, and `spectrum.send` flow.
- When onboarding returns `holding`, parse the watch command and call the internal create-or-return mutation.
- For a new watch, invoke provisioning and reply with one of: baseline queued, already watching, malformed command, conflict, or sanitized setup failure.
- Never persist `text`, `senderId`, `spaceId`, or `chainId` in app tables.

### `convex/http.ts`

- Add the Firecrawl HTTP action route before `registerStaticRoutes`.
- Keep Spectrum route ownership unchanged.
- Implement only authentication, bounded parsing, durable enqueue, and fast response here. Provider API reads belong in the scheduled processor action.

### `convex/productWatches.test.ts` (new)

- Register the Firecrawl test component.
- Use mocked `fetch` responses for Monitor endpoints.
- Cover the parser, state machine, deduplication, trust checks, credit/error branches, and cleanup behavior listed below.

Do not change `hackathon.md`, frontend files, Prava files, or the larger design document in this implementation.

## Test plan without credentials

Run all existing tests plus the new test file. Tests use fake API keys and never read local secret files.

### Parsing and request safety

- Accept the exact grammar and convert dollars to integer cents.
- Reject missing fields, extra separators, exponent notation, more or fewer than two decimals, negative values, non-USD text, wrong variant, wrong threshold, and trailing instructions.
- Reject HTTP, credentials in URL, fragments, ports, IP literals, localhost, subdomains, wrong paths, and unexpected query strings.
- Confirm the raw command and raw sender ID never appear in either app table.

### One-watch and Photon idempotency

- A valid command for an active member inserts one `provisioning` watch.
- The same command twice returns the same watch and makes one provider create call.
- A different command while open returns conflict.
- Two concurrent create mutations leave one open watch.
- Unknown or onboarding members continue through the existing onboarding behavior.

### Baseline and provisioning

- A valid component JSON scrape matching exact URL, variant, USD, expected cents, and availability allows Monitor creation.
- Wrong URL, variant, currency, price, availability, malformed JSON, Firecrawl 402, timeout, and provider 5xx fail closed before Monitor creation when applicable.
- Create response stores monitor ID before Run Monitor.
- Run 200 stores the returned check ID.
- Run 409 calls Get Monitor or List Checks and does not create another monitor or run.
- A create timeout marks `cleanup_required` and never retries Create Monitor.
- An estimate over budget deletes the just-created monitor and records a sanitized failure.

### Webhook authentication and fast acknowledgment

- Missing and wrong bearer tokens return 401 and write nothing.
- Oversized, malformed, unsupported, and wrong-monitor payloads write nothing.
- A valid event returns 202 after one durable row and scheduled work.
- Redelivery with the same `webhookId` returns 202 and creates no second row.
- A different webhook ID for the same monitor/check/event is harmless through `domainKey` dedupe.

### Snapshot validation and state transitions

- First valid `new` snapshot moves `priming` to `active` and cannot trigger.
- `same` remains active.
- Meaningful changed price above the threshold updates latest fields and remains active.
- Meaningful changed price at or below the threshold moves to `triggered` once and schedules one delete.
- Judgment false or missing does not trigger.
- Wrong URL, variant, currency, noninteger price, negative price, unavailable item, missing snapshot, removed page, and page error never trigger.
- A duplicate or late event cannot repeat cleanup or transition a terminal watch.
- `skipped_overlap` and `skipped_no_credits` update health only.
- A crashed processor is requeued by the watchdog. Retry exhaustion fails closed.

### Commands

```sh
npm test
npm run check
```

No Convex deployment command is required for the credential-free test phase.

## Live Firecrawl provider proof

This proof requires the PM inputs and an explicitly selected non-production Convex deployment.

1. Record the deployed Convex URL, `@firecrawl/firecrawl-convex` version, Convex version, Firecrawl team/plan name, starting credit balance, controlled URL, exact variant, expected baseline, schedule, and returned monthly estimate. Record no credential values.
2. Set the named environment variables in that deployment and deploy the backend.
3. Send the exact deterministic command through Photon.
4. Confirm Spectrum deduplicates delivery and the app stores one watch without raw message or sender data.
5. Confirm the component baseline matches the PM-supplied URL, exact variant, USD, starting cents, and availability.
6. Confirm Create Monitor returns one monitor with one scrape target, JSON change tracking, the expected goal, both webhook events, custom authorization header, and the approved schedule.
7. Confirm Run Monitor returns 200 and one check. Wait for authenticated webhook delivery and check detail. The first page must be `new`, contain `snapshot.json`, and move the watch from `priming` to `active` without triggering.
8. Send a forged webhook with a wrong token. It must return 401 and store nothing.
9. Replay one authenticated payload with the same webhook ID. It must return 202 and produce no second event or state transition. Use a redacted fixture outside application tables; do not copy a real secret into shell history or the repository.
10. Change only the controlled variant's item price or availability. Call Run Monitor. Confirm a `changed` page, field-level JSON diff, complete `snapshot.json`, and meaningful judgment. Confirm Convex stores only normalized fields.
11. Set the controlled item price to the approved threshold or below and run again. Confirm one transition to `triggered`, no purchase state, and monitor deletion/cleanup.
12. For overlap, create a fresh proof monitor or run before the prior check finishes. Confirm the second call returns 409. Confirm code obtains the current check through Get Monitor or List Checks rather than parsing the 409 body.
13. For no-credit behavior, use the PM-approved isolated team/key. First prove a one-shot scrape reports HTTP 402 when blocked. Then, with an existing monitor, prove a check records `skipped_no_credits`, `actualCredits: 0`, no observation, and no trigger. Restore credits and confirm the next check can run without resetting the monitor.
14. Restore the controlled store's starting state. Delete all proof monitors and app watch/event rows. Record final credit usage and sanitized check/monitor IDs in the proof notes.

If any payload or response differs from current docs, stop and update this plan before changing production logic.

## Rollback and cleanup

### Before merge

- Revert only the backend/package files listed in this plan.
- Do not touch unrelated frontend changes.
- Delete any Firecrawl monitors created during manual proof.
- Remove only the new deployment environment variable names if the feature is abandoned.

### After deployment

1. Disable new watch commands by reverting the Photon command branch or deploying it behind no configured controlled URL.
2. Transactionally set any open watch to `cancelled` and `isOpen=false`.
3. Delete the provider monitor by stored ID. A 404 is success for cleanup.
4. For `cleanup_required`, inspect paginated List Monitors for the deterministic name. Because names are not documented as unique, a human must verify URL and creation time before deletion.
5. Delete normalized demo event/watch rows after proof retention is no longer needed.
6. Rotate `FIRECRAWL_MONITOR_WEBHOOK_TOKEN` if it appeared in a debugging tool. Revoke the Firecrawl API key if it was exposed.
7. Restore the Shopify product's original price and availability.

Never retry monitor creation as a rollback step.

## Acceptance criteria

### Credential-free implementation acceptance

- `npm test` passes existing onboarding tests and all new product-watch tests.
- `npm run check` passes TypeScript checks and the existing Vite build.
- The implementation changes only the files listed in this plan and does not modify `hackathon.md` or unrelated uncommitted work.
- One exact command creates at most one open watch for the HMAC-identified member.
- Tests prove no app table stores raw message bodies, plaintext phone numbers, raw sender IDs, credentials, webhook bodies, diffs, or full snapshots.
- Tests prove a forged webhook stores nothing, duplicates are harmless, and a processor crash is recovered.
- Tests prove provider extraction and judgment cannot create a quote, approval, payment, checkout, or purchase state.
- Tests prove exact URL allowlisting and the normalized trigger predicate.

### Live provider acceptance

- Photon receives the exact command and replies that one monitor baseline is queued.
- Exactly one Firecrawl monitor exists for the watch.
- The initial manual check is `new`, exposes `snapshot.json` through check detail, and activates without triggering.
- A controlled field change produces the documented `monitor.page` and `monitor.check.completed` shapes, field-level JSON change tracking, and a meaningful judgment.
- The threshold change produces one `active -> triggered` transition and no spending action.
- Wrong auth returns 401. Same-webhook and same-check redeliveries return 202 with no duplicate transition.
- A second overlapping Run returns 409 and recovery uses documented monitor/check reads.
- The isolated no-credit proof distinguishes baseline HTTP 402 from monitor `skipped_no_credits` and confirms no trigger.
- Firecrawl's returned credit estimate is PM-approved, actual proof usage is recorded, and all proof monitors are deleted afterward.

## Explicitly out of scope

- OpenAI or natural-language parsing.
- Arbitrary URLs, stores, products, currencies, quantities, or multiple owners.
- Prava resolution, shipping, tax, delivered-total quotes, approval codes, payment, checkout, or reconciliation.
- Proactive Photon price-change alerts. The first slice proves watch establishment and durable trigger state; encrypted route storage can be added with the approval slice.
- AgentMail, dashboards, observation history, generic provider adapters, workflows, recovery crons, and long-term retention.

## Sources

All sources were accessed on 2026-09-21.

### Firecrawl primary sources

- Firecrawl Convex package metadata and README: https://www.npmjs.com/package/@firecrawl/firecrawl-convex
- Firecrawl Convex repository: https://github.com/firecrawl/firecrawl-convex
- Current client source, showing no Monitor methods: https://github.com/firecrawl/firecrawl-convex/blob/main/src/client/index.ts
- Monitoring overview, JSON field tracking, judging, webhooks, check detail, skipped checks, and costs: https://docs.firecrawl.dev/features/monitoring
- Page monitoring and fresh-scrape default: https://docs.firecrawl.dev/features/monitoring-page
- Change tracking semantics: https://docs.firecrawl.dev/features/change-tracking
- Create Monitor API: https://docs.firecrawl.dev/api-reference/endpoint/monitor-create
- Run Monitor API and 409: https://docs.firecrawl.dev/api-reference/endpoint/monitor-run
- Get Monitor API and `currentCheckId`: https://docs.firecrawl.dev/api-reference/endpoint/monitor-get
- List Monitor Checks API: https://docs.firecrawl.dev/api-reference/endpoint/monitor-checks-list
- Get Monitor Check API and `snapshot.json`: https://docs.firecrawl.dev/api-reference/endpoint/monitor-check-get
- Monitor page webhook schema: https://docs.firecrawl.dev/api-reference/endpoint/webhook-monitor-page
- Monitor check-completed webhook schema: https://docs.firecrawl.dev/api-reference/endpoint/webhook-monitor-check-completed
- Firecrawl billing and free-plan support: https://docs.firecrawl.dev/billing
- Current plan pricing: https://www.firecrawl.dev/pricing

### Convex primary sources

- HTTP actions and manual request validation: https://docs.convex.dev/functions/http-actions
- Actions for third-party calls: https://docs.convex.dev/functions/actions
- Atomic scheduling, exactly-once scheduled mutations, and at-most-once scheduled actions: https://docs.convex.dev/scheduling/scheduled-functions
- Component installation and route mounting: https://docs.convex.dev/components/using-components
- Typed deployment environment variables and component env passing: https://docs.convex.dev/production/environment-variables
