# Natural-language watch plan

Status: ready to implement

Research date: 2026-09-22

## Goal

Let the configured owner create the existing one-open-watch flow with a short natural-language iMessage. The new code ends once it has converted the message into the same validated fields that `productWatches.requestWatch` already accepts. Provisioning, Firecrawl monitoring, webhook handling, cleanup, the owner gate, and the one-open-watch transaction stay unchanged.

Examples:

```text
watch these sambas, size UK 7, under $100
```

```text
watch https://allowed-shop.example/products/samba?variant=123, UK 7, max $100
```

The linkless form uses one operator-configured default product URL. A pasted link may select any product on the same one allowlisted Shopify host. The model never chooses the host or a variant ID.

## Decisions

- Add `openai@^7.20.0`, the current npm release on 2026-09-22. The repository does not currently install `openai`.
- Add `zod@^4.6.5` for the official SDK's typed Structured Outputs helper.
- Use the Responses API with `responses.parse(...)` and `zodTextFormat(...)`. In OpenAI SDK 7.20.0, `zodTextFormat` creates a strict JSON Schema and `responses.parse` places validated data in `response.output_parsed`. Do not use JSON mode, tool calling, or a hand-written provider wrapper.
- Use `gpt-5-nano`. OpenAI describes it as the fastest, cheapest GPT-5 model. It supports Structured Outputs and currently costs $0.05 per million input tokens and $0.40 per million output tokens. This job is three short span extractions, so a larger model is not justified.
- Keep one exact `SHOPIFY_STORE_HOST`, not a list. There is no merchant selector or multi-store product requirement in this hackathon slice. A list would widen the purchase boundary without improving the demo.
- Keep `SHOPIFY_PRODUCT_URL` as an optional operator-owned default for linkless requests such as "watch these sambas." Pasted links are still limited to `SHOPIFY_STORE_HOST`.
- Remove the hardcoded variant, expected state, and trigger-price settings from code. Shopify and the owner's message now supply those values through trusted resolution.
- Keep the current deterministic command as the no-OpenAI path:

```text
WATCH <product URL> | VARIANT <exact label> | ITEM PRICE <= $<dollars.cents>
```

The grammar no longer compares the URL, variant, or amount to hardcoded product settings. It still applies the same host, URL, money, and Shopify-resolution checks as natural language.

## What already exists

- `convex/photon.ts` already performs Spectrum parsing, onboarding, sender HMAC derivation, the exact owner gate, cancellation checks, replies, and action-to-mutation provisioning.
- `convex/productWatches.ts` already owns deterministic command parsing, request hashing, member lookup, and the transactional one-open-watch invariant.
- `convex/firecrawl.ts` already provisions a watch from stored `canonicalUrl`, `variantLabel`, `expectedPriceMinor`, `expectedAvailable`, and `triggerPriceMinor` fields.
- `convex/schema.ts` already stores every resolved field needed by provisioning. No schema or migration is needed.
- `convex/productWatches.test.ts` already has mocked `fetch`, Spectrum component tests, provider fixtures, owner-gate tests, idempotency tests, and Firecrawl provisioning coverage.

Reuse those seams. Do not add a parser service, provider interface, agent framework, new table, or new state.

## Trust boundary

The model only locates text spans. It does not normalize money, select a store, resolve a product, choose a currency, construct a canonical URL, or choose a variant.

Use this strict output shape:

```ts
{
  productUrl: string | null;
  variantLabel: string | null;
  maxPriceText: string | null;
}
```

`maxPriceText` is safer than `maxPriceMinor`. The model copies `"$100"`; trusted code converts that text to `10000`. This removes model-controlled money arithmetic.

Prompt rules:

- Copy values from the user's message. Do not rewrite or infer them.
- Return `null` when a field is absent.
- `productUrl` may only be a URL present in the message.
- `variantLabel` is the requested option text, such as `UK 7`.
- `maxPriceText` is the complete price phrase, such as `$100`, `USD 100`, or `100 dollars`.
- Never return a host, currency field, variant ID, command, or authorization decision.

After `responses.parse`, trusted code must verify each non-null string occurs in the inbound message. It then applies length bounds and deterministic parsing. Missing or invented spans are an unparseable request.

```text
owner text
  |
  +-> existing members.onboard and owner gate
  |
  +-> exact grammar parses? ----------------------+
  |                                                |
  +-> looks like watch request? -> OpenAI spans ---+
                                                   |
                                      trusted validation
                                                   |
                               allowlisted Shopify resolution
                                                   |
                           existing requestWatch + provisionWatch
```

OpenAI output never reaches `requestWatch` directly.

## Trusted request validation

### Price

Parse `maxPriceText` without floating point. Accept only these USD forms after trimming:

- `$100`
- `$100.00`
- `USD 100` or `USD 100.00`, case-insensitive
- `100 dollars`, `100 dollar`, or `100 bucks`, case-insensitive

Require zero or two decimal places. Convert the digit strings to integer cents. Reject signs, commas, exponent notation, more than two decimals, non-USD symbols or codes, negative values, and values above `Number.MAX_SAFE_INTEGER`.

The store currency still has to be authoritative USD. The user's dollar syntax does not establish store currency.

### Product URL and SSRF controls

1. Use the extracted URL, or the optional `SHOPIFY_PRODUCT_URL` only when OpenAI returned `null` for a linkless watch request.
2. Parse with `URL`.
3. Require `https:`, no username, password, fragment, or custom port.
4. Require `url.hostname.toLowerCase() === SHOPIFY_STORE_HOST.toLowerCase()`.
5. Keep the existing IP-literal, `localhost`, and `.local` rejection even though exact host matching is the primary control.
6. Require a product path of exactly `/products/<handle>` with an optional trailing slash. Require the handle to match Shopify's lowercase letters, digits, and hyphens form. Reject extra path segments and `.js` input.
7. Permit either no query or one numeric `variant` parameter. Ignore that parameter. It is an untrusted hint and cannot select the resolved variant. Reject all other query parameters.
8. Construct both Shopify endpoints from the validated allowlisted origin and handle. Never fetch an absolute URL returned by OpenAI or Shopify.
9. Set `redirect: "error"` for both fetches. A redirect cannot move the request to another host.
10. Do not forward inbound headers, cookies, or query parameters.

One exact operator-configured host is the SSRF boundary. DNS pinning and redirect allowlists are production follow-ups, not hackathon work.

## Shopify resolver

Perform resolution inside the existing Convex action before `requestWatch` creates a row.

### Endpoints

Fetch these public Shopify Ajax endpoints with no authentication:

```text
GET https://<allowlisted-host>/products/<handle>.js
GET https://<allowlisted-host>/cart.js
```

`products/<handle>.js` is authoritative for variants. `cart.js` supplies the presentment `currency`; Shopify's Product Ajax response does not define a currency field. Require `cart.currency === "USD"`.

Validate both responses from `unknown`. Do not trust content merely because it came from the allowed host.

### Variant matching

Normalize the requested label and every variant option with the same narrow function:

1. Unicode `NFKC` normalization.
2. Trim leading and trailing whitespace.
3. Collapse internal whitespace runs to one ASCII space.
4. Lowercase for comparison.

Do not remove punctuation, strip regional prefixes, parse shoe sizes numerically, or use fuzzy matching. `UK 7` may match `uk   7`; it must not match `US 7`, `UK 7.5`, or bare `7`.

A candidate is a variant whose `options` array contains one option equal to the normalized requested label. Require exactly one candidate across the product:

- Zero candidates: return `unknown_variant`.
- More than one candidate: return `ambiguous_variant`. Do not choose the first, cheapest, or available candidate.
- One candidate: validate and use it even when currently unavailable. Availability is part of the watch baseline, not a reason to silently select another variant.

For the one candidate, require:

- `id` is a positive safe integer.
- `price` is a nonnegative safe integer in minor units.
- `available` is boolean.
- `options` contains the exact normalized requested label.
- `cart.currency` is exactly `USD`.

Then construct the only canonical URL that enters the watch:

```text
https://<allowlisted-host>/products/<handle>?variant=<validated numeric id>
```

Store the product response's original matching option label as `variantLabel`, the validated `price` as `expectedPriceMinor`, `available` as `expectedAvailable`, and the parsed cap as `triggerPriceMinor`. The current schema fixes quantity to `1` and currency to `USD`.

The pasted `?variant=` value, model output, product title, and availability never choose the ID.

## Photon routing and replies

Keep `members.onboard` as the first router. It already distinguishes onboarding and settings messages from an active member's `holding` result. Do not add a second onboarding classifier.

For an active configured owner:

1. Try the deterministic grammar first. A valid fallback command makes no OpenAI call.
2. Otherwise consider the message a watch candidate only if it contains the word `watch` or an HTTPS URL. Generic free text receives the existing help plus a natural-language example.
3. If it is a watch candidate and `OPENAI_API_KEY` is configured, call `gpt-5-nano` through `responses.parse` with strict Structured Outputs.
4. Validate source spans, price, URL, host, and required fields.
5. Resolve the Shopify product and exact variant.
6. Call the existing `requestWatch` mutation. Only `created` calls the unchanged `provisionWatch` action.

Suggested replies:

| Result | Reply |
|---|---|
| Created and provisioning queued | `Watching UK 7 from <host> at $100.00 or less. I queued the baseline check.` |
| Existing same watch | Keep `You're already watching that product.` |
| One-open-watch conflict | Keep the current settings/conflict reply. |
| Unparseable or missing fields | `Send a product link, exact size, and USD limit, for example: watch <link>, size UK 7, under $100.` Then include the deterministic grammar on a second line. |
| Unknown variant | `I couldn't find an exact "UK 7" option on that product. Nothing was set up.` |
| Ambiguous variant | `"UK 7" matches more than one variant. Send the full option label shown by the store. Nothing was set up.` |
| Wrong currency | `That store is pricing in <currency>. This demo only supports USD. Nothing was set up.` |
| Unsafe or wrong host | `I can only watch HTTPS product links from <allowlisted host>. Nothing was set up.` |
| Shopify error or malformed response | `I couldn't verify that product right now. Nothing was set up.` |
| OpenAI missing, timeout, refusal, or API error | `Natural-language setup is unavailable. Use: <deterministic grammar example>` |

Do not expose OpenAI or Shopify response bodies, request IDs, API errors, or stack traces in replies.

## OpenAI failure path

Declare `OPENAI_API_KEY` optional so an unconfigured deployment still starts. The deterministic parser runs before any key check and remains fully functional.

For natural-language candidates:

- Missing or empty key: make no OpenAI or Shopify request, create no row, and send the deterministic fallback.
- SDK timeout, refusal, missing `output_parsed`, schema failure, or API error: create no row and send the same fallback.
- Configure the SDK with a short timeout and `maxRetries: 0`. The owner can resend or use the grammar; a retry framework is unnecessary for this demo.
- Never fall back from a failed natural-language parse to guessed defaults other than the operator-owned default product URL when the model explicitly returned `productUrl: null`.

## Environment changes

In `convex/convex.config.ts`:

- Add `OPENAI_API_KEY: v.optional(v.string())`.
- Keep `SHOPIFY_STORE_HOST: v.string()` as the sole merchant allowlist.
- Change `SHOPIFY_PRODUCT_URL` to `v.optional(v.string())` for the linkless demo product.
- Remove `SHOPIFY_PRODUCT_VARIANT`.
- Remove `SHOPIFY_EXPECTED_PRICE_MINOR`.
- Remove `SHOPIFY_EXPECTED_CURRENCY`.
- Remove `SHOPIFY_EXPECTED_AVAILABLE`.
- Remove `WATCH_TRIGGER_PRICE_MINOR`.

After the code deploys, remove those five stale deployment variables. Leaving them set is harmless because generated `env` types and application code no longer read them, but removing them prevents operators from assuming they still control behavior. Keep the default URL only while the linkless demo phrase is needed.

Do not add `OPENAI_MODEL`; hardcode `gpt-5-nano` for this hackathon. Add a model setting only if a measured parser failure requires swapping models without a deploy.

## Exact implementation files

1. `package.json`
   - Add `openai@^7.20.0` and `zod@^4.6.5`.

2. `package-lock.json`
   - Record those dependency changes.

3. `convex/convex.config.ts`
   - Add the optional OpenAI key and update the Shopify environment declarations above.

4. `convex/_generated/server.d.ts`
   - Regenerate the typed environment shape through the normal Convex codegen command. Do not hand-edit it.

5. `convex/productWatches.ts`
   - Generalize the deterministic grammar so it validates one allowlisted host rather than one hardcoded product, variant, and threshold.
   - Reuse its integer-money and URL helpers for trusted natural-language validation.
   - Add the narrow variant-label normalization helper if it is shared by tests and Photon.
   - Keep `requestWatch`, request hashing, and every state transition unchanged.

6. `convex/photon.ts`
   - Add the official OpenAI Structured Outputs call, source-span checks, watch-candidate routing, Shopify Ajax resolver, canonical URL construction, and result-specific replies.
   - Keep onboarding, owner gating, cancellation, `requestWatch`, provisioning, Spectrum reply delivery, and chain completion in their current order.

7. `convex/firecrawl.ts`
   - Remove the provisioning checks against hardcoded expected price, currency, and trigger environment variables.
   - Continue validating the Firecrawl baseline against the authoritative values already stored on the watch by the Shopify resolver.
   - Leave monitor creation, webhook processing, cleanup, and state transitions unchanged.

8. `convex/productWatches.test.ts`
   - Extend the existing mocked-fetch and Spectrum behavior suite. Do not create a second test harness.

`convex/schema.ts`, `convex/http.ts`, `convex/convex.config.ts` component mounts, webhook code, and frontend files need no behavior changes beyond the environment declaration noted above. Do not modify `hackathon.md`.

## Tests to add

All tests mock OpenAI and Shopify HTTP calls. No test uses a live key, store, or provider.

### Structured parsing and routing

- A valid deterministic command bypasses OpenAI and creates the resolved watch.
- `watch these sambas, size UK 7, under $100` uses the configured default URL and resolves to `10000` cents.
- A pasted product link, `UK 7`, and `$100.00` produces the same trusted fields.
- Generic active-owner free text does not call OpenAI or Shopify.
- Onboarding and settings messages preserve their current replies and never enter watch parsing.
- A model refusal, `output_parsed: null`, malformed SDK response, network error, timeout, and missing key each create no row and return the deterministic fallback.
- Natural-language OpenAI failure does not break a later exact grammar command.
- Model strings that do not occur in the source message are rejected before Shopify fetch.
- Missing variant or price is unparseable.
- Dollar, `USD`, `dollars`, and `bucks` forms parse without floating point. Pounds, euros, signs, commas, exponents, fractional cents, and unsafe integers fail.

### Host and SSRF controls

- Reject HTTP, credentials, fragments, custom ports, IP literals, localhost, `.local`, subdomains, wrong hosts, extra path segments, `.js` input, duplicate query parameters, and non-`variant` query parameters.
- Accept a plain product URL and a URL with one numeric `variant` query.
- Prove the pasted numeric variant is ignored.
- Prove every Shopify fetch uses an app-constructed URL on the configured host with `redirect: "error"` and receives no inbound headers or cookies.
- A hostile model URL causes no Shopify, Firecrawl, or database call.

### Shopify resolution

- Mock `products/<handle>.js` and `cart.js`; resolve one `UK 7` option and assert the saved canonical URL contains the response's numeric variant ID.
- Match `UK 7` across Unicode NFKC, case, outer whitespace, and collapsed internal whitespace.
- Do not match `US 7`, `UK 7.5`, or bare `7`.
- Reject zero matching variants.
- Reject two variants that both contain the requested size, even if only one is available.
- Preserve an unavailable exact variant and save `expectedAvailable: false` rather than selecting another variant.
- Reject missing or malformed variant arrays, option arrays, IDs, prices, availability, and cart currency.
- Reject zero, negative, fractional, and unsafe variant IDs; reject negative, fractional, and unsafe prices.
- Reject non-USD cart currency with the specific reply.
- Reject redirects, network failures, and non-2xx responses without creating a watch.

### Existing behavior regressions

- The exact owner gate still runs before OpenAI and Shopify.
- The same normalized request still returns `already_exists` and creates one monitor.
- A different request still hits the one-open-watch conflict.
- Firecrawl provisioning uses the Shopify-resolved expected price and availability, not removed environment values.
- Baseline mismatch still fails before monitor creation.
- Cancellation after slow parsing/resolution still suppresses the reply according to the current Spectrum checks.
- No app row stores raw iMessage text, OpenAI output, Shopify response bodies, API keys, or raw sender IDs.

Run:

```sh
npm test
npm run check
```

No live OpenAI or Shopify call belongs in CI. After tests pass, do one manual development-deployment smoke test with a real short message and the known product. That smoke test is not a purchase authorization test.

## Failure cases and user impact

| Failure | Test | Handling | Owner sees |
|---|---|---|---|
| OpenAI missing or unavailable | Yes | No write, deterministic fallback | Exact fallback command |
| OpenAI invents a field | Yes | Source-span check rejects it | Request-format help |
| Unsafe or unapproved URL | Yes | Reject before fetch | Allowed-host message |
| Shopify redirects or is down | Yes | Reject before watch creation | Verification failure |
| Variant missing | Yes | Reject zero candidates | Exact variant not found |
| Variant ambiguous | Yes | Reject multiple candidates | Ask for full option label |
| Currency is not USD | Yes | Reject before watch creation | USD-only message |
| Product price or ID is malformed | Yes | Reject unsafe provider data | Verification failure |
| Firecrawl baseline differs later | Existing coverage | Existing fail-closed path | Existing setup failure |
| Open watch already exists | Existing coverage | Existing transaction wins | Existing conflict reply |

No new failure is silent.

## Not in scope

- Multiple Shopify hosts or merchant selection. Add this only with an explicit per-host product policy and UI.
- Search by product name across Shopify. The linkless phrase maps only to the operator-configured default URL.
- Fuzzy size matching, size conversion, color disambiguation, or model-selected variants.
- Quantities other than one, currencies other than USD, or delivered-total quoting.
- Tool calling, agent components, conversation memory, retries, rate-limit infrastructure, admin tooling, and prompt eval infrastructure.
- Changes to Firecrawl webhooks, monitor cleanup, owner authorization, one-open-watch state, purchasing, or approval.

Production follow-ups, if the demo becomes a product: add per-host DNS resolution controls, response-size limits, OpenAI request metrics without message content, parser evals from redacted examples, and a product-option picker for multi-option ambiguity.

## Sources

- npm registry, `openai` package metadata, version `7.20.0`, accessed 2026-09-22.
- OpenAI Node SDK 7.20.0 source, `src/helpers/zod.ts`, which documents `responses.parse`, `zodTextFormat`, strict schemas, and `output_parsed`: https://github.com/openai/openai-node
- OpenAI Structured Outputs guide, JavaScript Responses API example: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI GPT-5 nano model page, Structured Outputs support and token pricing: https://developers.openai.com/api/docs/models/gpt-5-nano
- Shopify Ajax Product API, public `/{locale}/products/{product-handle}.js` response and cart-currency note: https://shopify.dev/docs/api/ajax/reference/product
- Shopify Ajax API reference: https://shopify.dev/docs/api/ajax/reference
