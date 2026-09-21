# Landing, iMessage onboarding, and dashboard claim plan

Status: approved for implementation

## Goal

Give an invited user a clear entry point, onboard them through iMessage, and let them securely claim a private settings dashboard without collecting a password.

## Constraints discovered

- The live Photon project is on the Free tier.
- Photon currently documents up to 10 users on Free.
- Free and Pro use managed shared lines. A sender must already be registered as a Photon project user before their message reaches Convex.
- The public landing page therefore cannot offer unrestricted self-service texting. It must describe an invite-only beta and provide the message CTA only for a pre-provisioned user.
- Convex must not store plaintext phone numbers, raw Photon sender IDs, raw messages, claim tokens, or provider credentials in application tables.
- A message, scraped page, or model output can never authorize a purchase.
- Provider proofs 2 through 6 still gate the purchase implementation. This slice may build onboarding and UI, but not claim that product monitoring or purchasing works.

## User flow

```text
Landing page
  -> invited user opens Messages CTA
  -> sends first message
  -> Convex cannot find sender HMAC
  -> agent asks: “What should I call you?”
  -> user replies with a display name
  -> Convex activates the profile
  -> agent sends a 15-minute, one-use settings link
  -> link exchanges its token through Convex Auth
  -> authenticated settings dashboard opens
  -> later messages skip onboarding and enter the normal command flow
```

If a claim link expires, the user can text `settings` to receive a new link. Claim links are bearer credentials, so they are short-lived, stored only as hashes, consumed once, and never logged.

## State model

A member has one of three onboarding states:

- `awaiting_name`: first message received; the next valid text is treated as the display name.
- `active_unclaimed`: name saved; no Convex Auth account has claimed the profile yet.
- `active_claimed`: profile is linked to a Convex Auth user.

State transitions happen in Convex mutations. The Spectrum action performs HMAC and token generation, calls mutations, and sends the resulting reply. Duplicate Photon deliveries remain suppressed by the Spectrum component.

## Data model

### `members`

- `senderKey`: HMAC-SHA256 of the normalized Photon sender ID; unique lookup key.
- `displayName`: optional validated name, 1 to 50 visible characters.
- `onboardingState`: `awaiting_name`, `active_unclaimed`, or `active_claimed`.
- `authUserId`: optional Convex Auth `users` document ID.
- `createdAt`, `updatedAt`: Unix milliseconds.

Indexes: `by_sender_key`, `by_auth_user`.

### `dashboardClaims`

- `tokenHash`: SHA-256 hash of a cryptographically random token.
- `memberId`: target member.
- `expiresAt`: issue time plus 15 minutes.
- `consumedAt`: optional one-use marker.
- `createdAt`: Unix milliseconds.

Index: `by_token_hash`.

Include Convex Auth’s `authTables` in the application schema.

## Authentication design

Use the official `@convex-dev/auth` package with a custom `ConvexCredentials` provider named `imessage-claim`.

1. The claim page reads `token` from the URL and calls `signIn("imessage-claim", { token })`.
2. The provider hashes and validates the token against an unexpired, unconsumed claim.
3. It creates or retrieves one Convex Auth account keyed by the stable member ID.
4. A mutation atomically consumes the claim and links the member to the returned auth user.
5. Authenticated queries derive the auth user from `ctx.auth`; they never accept a member ID from the browser.

A consumed or expired token fails with a generic message. It must not reveal whether a member exists.

## Message handling

Replace the temporary proof reply in `convex/photon.ts` with a small deterministic router:

- Missing sender ID or non-text input: send a safe help response and store no profile.
- Unknown sender: create `awaiting_name`, then ask for a name.
- `awaiting_name`: validate the newest text as a display name, activate the member, issue a claim link, and reply with the link.
- Active sender plus `settings`: issue a fresh claim link.
- Other active messages: return a truthful holding response while the commerce command flow is still gated on provider proofs.

Do not use OpenAI for onboarding or authorization.

## Frontend

Keep the Vite app dependency-light. Do not add a router for three states; select the view from `window.location.pathname`.

### `/`

- Product name and one-sentence value proposition.
- Three-step explanation: text a product, approve an exact quote, receive the receipt.
- Clear “Invite-only beta” label and Free-plan capacity note.
- Messages CTA only when a public message URL is configured; otherwise show setup pending.
- Trust copy: no purchase without exact approval.
- Live Convex connection status.

### `/claim?token=...`

- Automatically exchange the token once.
- Loading, invalid/expired, and success states.
- Remove the token from the visible URL after successful exchange.
- Continue to `/dashboard`.

### `/dashboard`

- Require Convex Auth.
- Show display name, iMessage connection state, and onboarding completion.
- Show a truthful empty state for watches until Firecrawl proof and watch creation ship.
- Sign-out action.

The layout must work at 320 px and desktop widths, expose visible focus styles, use semantic headings, and respect reduced motion.

## Public configuration

Use an optional server-side environment value for the invited user’s public `sms:` URL or assigned message number. Do not hard-code a phone number in source. If absent, the landing page remains usable and shows that access is being configured.

## Security checks

- HMAC sender lookup uses a dedicated environment secret.
- Compare claim hashes through indexed exact lookup and enforce expiry and one-use state transactionally.
- Never log message text, sender IDs, names, tokens, phone numbers, or auth payloads.
- No public query returns sender keys, claim rows, or auth IDs.
- Dashboard queries require Convex Auth and map the auth user to exactly one member.
- Name input is trimmed, length-limited, and stripped of control characters before storage.
- Claim generation uses a cryptographically secure random value with at least 192 bits of entropy.
- All new Convex functions have argument and return validators.

## Implementation slices

### Slice 1: Backend and authentication

1. Install and configure `@convex-dev/auth`.
2. Extend `convex/schema.ts` with auth tables, members, and claims.
3. Add the custom claim credentials provider and mount its HTTP routes without disturbing Spectrum.
4. Add member onboarding mutations, claim validation/consumption, and authenticated profile query.
5. Replace the temporary Photon response with the deterministic onboarding router.
6. Add focused tests for state transitions, token expiry/replay, and unauthorized profile reads where the current toolchain supports them.

### Slice 2: Landing and dashboard

1. Add the Convex Auth React provider.
2. Build landing, claim, and dashboard views.
3. Add responsive, accessible styling without a component library.
4. Keep provider-proof status truthful.
5. Verify typecheck, build, formatting, and mobile layout.

### Slice 3: Cloud configuration and live proof

1. Generate the Convex Auth signing keys without printing them.
2. Set the local/dev `SITE_URL`, sender-HMAC secret, and optional message CTA configuration.
3. Deploy only to the authorized Convex development deployment.
4. Run a new-user onboarding proof, an existing-user proof, an expired-link proof, and a replayed-link proof.
5. Record only sanitized results in `hackathon.md`.

## Acceptance criteria

- An unknown, pre-allowlisted Photon user receives the name question exactly once.
- A valid name creates one member and returns one claim link.
- The claim link signs the member into Convex Auth and opens only their dashboard.
- Reusing or waiting more than 15 minutes invalidates the link.
- `settings` issues a replacement link without creating another member.
- Existing users do not re-enter onboarding.
- The landing page states that the beta is invite-only and never implies arbitrary visitors can text on Photon Free.
- No personal data or secrets appear in source, command output, logs, fixtures, or `hackathon.md`.
- Existing Spectrum webhook and outbound reply proofs still pass.

## Not in scope

- Public phone-number enrollment or automatic Photon user creation.
- More than 10 Photon Free users.
- Team accounts, multiple owners, admin consoles, or role management.
- Email/password, social OAuth, or account recovery outside the iMessage `settings` command.
- Product watches, Firecrawl setup, Prava checkout, or purchase authorization in this slice.
