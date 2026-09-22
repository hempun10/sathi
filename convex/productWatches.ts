import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { sha256Hex } from "./crypto";
import schema, {
  checkoutSupport,
  eventType,
  failureCode,
  pageStatus,
  pickerCandidate,
  watchStatus,
} from "./schema";
import { spectrum } from "./spectrum";

const MAX_URL_LENGTH = 2_048;
const MAX_TITLE_LENGTH = 300;
/** Titles are untrusted provider text, so bound what reaches an iMessage. */
export const MAX_MESSAGE_TITLE_LENGTH = 120;
const MAX_NOTIFICATION_LENGTH = 1_000;

export const titleForMessage = (title: string) =>
  title.slice(0, MAX_MESSAGE_TITLE_LENGTH);
export const MAX_UCP_BODY_LENGTH = 512_000;

/**
 * Social and content hosts are never product pages, even when a model
 * extraction labels them as one. Matched on the whole hostname or a dot
 * suffix, never a substring, so `notyoutube.com` is not mistaken for YouTube.
 */
export const SOCIAL_HOSTS = [
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "reddit.com",
  "pinterest.com",
  "pin.it",
  "x.com",
  "twitter.com",
] as const;

export const isSocialHost = (host: string) => {
  const normalized = host.toLowerCase();
  return SOCIAL_HOSTS.some(
    (blocked) =>
      normalized === blocked || normalized.endsWith(`.${blocked}`),
  );
};

// ---------------------------------------------------------------------------
// Deterministic parsing (pure, testable)
// ---------------------------------------------------------------------------

const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

/**
 * Compare a scraped page URL with the canonical URL for identity. Fragments
 * carry no identity, so compare origin + path + query only.
 */
export const samePageUrl = (left: string, right: string) => {
  const identity = (value: string) => {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  };
  const a = identity(left);
  return a !== null && a === identity(right);
};

/**
 * Parse one optional USD cap from free text. Deterministic: only a documented
 * comparison word or a bare `$`/`USD` amount counts. Returns integer cents, or
 * undefined when the message carries no cap.
 */
export const parseCapText = (raw: string): number | undefined => {
  for (const pattern of CAP_PATTERNS) {
    const match = pattern.exec(raw);
    if (match === null) continue;
    const dollars = Number(match[1]);
    const cents = match[2] === undefined ? 0 : Number(match[2]);
    if (!Number.isSafeInteger(dollars)) return undefined;
    const minor = dollars * 100 + cents;
    return Number.isSafeInteger(minor) ? minor : undefined;
  }
  return undefined;
};

const CAP_PATTERNS = [
  /(?:under|below|less than|max(?:imum)?|at most|<=|≤)\s*(?:\$|usd\s*)\s*(\d+)(?:\.(\d{2}))?(?![\d.])/i,
  /(?:\$|usd\s*)\s*(\d+)(?:\.(\d{2}))?(?![\d.])/i,
];

const URL_PATTERN = /https:\/\/[^\s<>"']+/i;

const stripTrailingPunctuation = (value: string) =>
  value.replace(/[.,;:!?)\]}'"]+$/, "");

/** Split one owner message into an optional product URL and an optional cap. */
export const parseWatchMessage = (text: string) => {
  const match = URL_PATTERN.exec(text);
  const rawUrl =
    match === null ? undefined : stripTrailingPunctuation(match[0]);
  const withoutUrl = match === null ? text : text.replace(match[0], " ");
  return { rawUrl, capPriceMinor: parseCapText(withoutUrl) };
};

/**
 * Referral/analytics query params known to carry no page identity. A
 * merchant's own scraped/canonical URL never includes these, so leaving them
 * in the stored URL breaks the later exact-URL identity check
 * (`samePageUrl`) even though it is the same product page.
 */
const TRACKING_PARAM_PREFIXES = ["utm_", "srsltid", "gclid", "fbclid", "msclkid", "mc_", "_ga", "ref", "igshid"];

const isTrackingParam = (name: string) => {
  const lower = name.toLowerCase();
  return TRACKING_PARAM_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(prefix),
  );
};

/** Drop known tracking params; keep every other query param, in order. */
const stripTrackingParams = (search: string) => {
  const params = new URLSearchParams(search);
  for (const name of [...params.keys()]) {
    if (isTrackingParam(name)) params.delete(name);
  }
  const cleaned = params.toString();
  return cleaned.length === 0 ? "" : `?${cleaned}`;
};

/**
 * Validate one public HTTPS product URL. Rejects credentials, fragments,
 * non-default ports, IP literals, localhost, and `.local` hosts.
 */
export const parseProductUrl = (
  raw: string,
): { productUrl: string; merchantHost: string } | null => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.hash !== "") return null;
  if (url.port !== "") return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "" ||
    host === "localhost" ||
    host.endsWith(".local") ||
    isSocialHost(host)
  ) {
    return null;
  }
  if (host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return null;
  }
  const productUrl = `${url.origin}${url.pathname}${stripTrackingParams(url.search)}`;
  if (productUrl.length > MAX_URL_LENGTH) return null;
  return { productUrl, merchantHost: host };
};

/**
 * The one extraction shape for both the upfront scrape and every fresh
 * re-scrape. `additionalProperties: false` rejects extra or ambiguous fields.
 */
export const PRODUCT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    url: {
      type: "string",
      description: "The final page URL exactly as scraped, including any query string.",
    },
    title: {
      type: "string",
      description: "The product name exactly as the page displays it.",
    },
    priceMinor: {
      type: "integer",
      description:
        "Item price as a whole number of US cents. $12.00 is 1200, not 12 or 12.0.",
    },
    currency: {
      type: "string",
      description: "ISO 4217 currency code of the item price, for example USD.",
    },
    available: {
      type: "boolean",
      description: "Whether the item is currently in stock and purchasable.",
    },
  },
  required: ["url", "title", "priceMinor", "currency", "available"],
};

const SNAPSHOT_KEYS = [
  "url",
  "title",
  "priceMinor",
  "currency",
  "available",
] as const;

export type ProductFacts = {
  url: string;
  title: string;
  priceMinor: number;
  currency: string;
  available: boolean;
};

/** Validate untrusted provider JSON into trusted product facts. */
export const normalizeProductFacts = (
  json: unknown,
  expectedUrl: string,
): ProductFacts | null => {
  const record = asRecord(json);
  if (record === null) return null;
  const keys = Object.keys(record);
  if (
    keys.length !== SNAPSHOT_KEYS.length ||
    !keys.every((key) => (SNAPSHOT_KEYS as readonly string[]).includes(key))
  ) {
    return null;
  }
  const url = asString(record.url);
  const title = asString(record.title);
  const currency = asString(record.currency);
  const priceMinor = record.priceMinor;
  const available = record.available;
  if (
    url === undefined ||
    title === undefined ||
    currency === undefined ||
    typeof available !== "boolean" ||
    typeof priceMinor !== "number" ||
    !Number.isInteger(priceMinor) ||
    priceMinor < 0 ||
    title.trim().length === 0 ||
    title.length > MAX_TITLE_LENGTH ||
    !samePageUrl(url, expectedUrl)
  ) {
    return null;
  }
  return { url, title, priceMinor, currency, available };
};

/**
 * Search-result extraction shape. Search returns one document per hit; the
 * model must classify each hit so category, collection, and editorial pages
 * are not mistaken for a single purchasable product.
 */
export const SEARCH_PRODUCT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    isProductPage: {
      type: "boolean",
      description:
        "True only for a single product detail page where one item can be bought. " +
        "False for category, collection, search-result, listing, blog, review, or editorial pages.",
    },
    title: {
      type: "string",
      description: "The product name exactly as the page displays it.",
    },
    priceMinor: {
      type: ["integer", "null"],
      description:
        "The item's price as a whole number of US cents ($12.00 is 1200), or null when the page shows no single price.",
    },
    currency: {
      type: ["string", "null"],
      description: "ISO 4217 currency code of the item price, for example USD, or null.",
    },
    available: {
      type: ["boolean", "null"],
      description:
        "Whether this exact item is currently in stock and purchasable, or null when unknown.",
    },
    imageUrl: {
      type: ["string", "null"],
      description:
        "Absolute URL of the main product photo, copied from the page. Use the largest available product image, not a logo, icon, badge, or tracking pixel. Null when the page shows no product photo.",
    },
  },
  required: [
    "isProductPage",
    "title",
    "priceMinor",
    "currency",
    "available",
    "imageUrl",
  ],
};

const MAX_IMAGE_URL_LENGTH = 2_048;

/**
 * Validate an extracted product photo URL. Display-only: the picker page
 * renders it, the backend never fetches it. Rejects non-HTTPS, credentials,
 * and oversized values so a hostile page cannot smuggle a data: or file: URL
 * into the picker.
 */
export const parseImageUrl = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IMAGE_URL_LENGTH) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  return `${url.origin}${url.pathname}${url.search}`;
};

export type ProductCandidate = {
  url: string;
  title: string;
  priceMinor: number;
  /** Display-only product photo. Absent when the page had no usable image. */
  imageUrl?: string;
  merchantHost: string;
};

/** Whether a merchant's UCP profile allows automated checkout. */
export type CheckoutSupport =
  | "verified"
  | "unsupported"
  | "needs_verification";

/** A registry entry must be a plain object, never an array or null. */
const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const MAX_UCP_FIELD_LENGTH = 2_048;

/** Bounded, nonempty string: the only shape trusted for UCP scalar fields. */
const isBoundedString = (value: unknown) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= MAX_UCP_FIELD_LENGTH;

const hasBoundedFields = (
  entry: Record<string, unknown>,
  fields: readonly string[],
) => fields.every((field) => isBoundedString(entry[field]));

// Current UCP profile shape: the shopping service carries version/spec/
// transport plus an endpoint or schema; the checkout capability and the
// Shopify card handler each carry their own version/spec/schema. Endpoint and
// schema strings are treated as opaque data and never followed.
const isShoppingService = (entry: Record<string, unknown>) =>
  hasBoundedFields(entry, ["version", "spec", "transport"]) &&
  (isBoundedString(entry.endpoint) || isBoundedString(entry.schema));

const isCheckoutCapability = (entry: Record<string, unknown>) =>
  hasBoundedFields(entry, ["version", "spec", "schema"]);

const isCardHandler = (entry: Record<string, unknown>) =>
  hasBoundedFields(entry, ["id", "version", "spec", "schema"]);

/**
 * `valid` means the registry advertises the required capability; `missing`
 * means the profile is well-formed but does not; `malformed` means a wrong
 * type or an entry that fails validation, which is never trusted.
 */
type RegistryState = "valid" | "missing" | "malformed";

const assessRegistry = (
  profile: Record<string, unknown>,
  registryName: string,
  capabilityName: string,
  isValidEntry: (entry: Record<string, unknown>) => boolean,
): RegistryState => {
  const registry = profile[registryName];
  if (registry === undefined) return "missing";
  const registryObject = asObject(registry);
  if (registryObject === null) return "malformed";
  const entries = registryObject[capabilityName];
  if (entries === undefined) return "missing";
  if (!Array.isArray(entries)) return "malformed";
  if (entries.length === 0) return "missing";
  return entries.every((entry) => {
    const record = asObject(entry);
    return record !== null && isValidEntry(record);
  })
    ? "valid"
    : "malformed";
};

/**
 * Evaluate a merchant's published UCP profile as checkout-discovery evidence
 * only. Both the outer profile and every registry entry are untrusted JSON
 * with hard size bounds, the response must have arrived at the exact expected
 * well-known URL, and no endpoint the profile names is ever followed. Never
 * authorizes payment: a future quote or checkout must re-verify through Prava
 * and still require explicit approval.
 */
export const evaluateCheckoutSupport = (
  statusCode: unknown,
  rawHtml: unknown,
  finalUrl: unknown,
  expectedUrl: string,
): CheckoutSupport => {
  // A missing or redirected final URL means the response did not come from the
  // well-known path we asked for, so no status can be trusted. Never trust a
  // cross-host profile.
  if (typeof finalUrl !== "string" || !samePageUrl(finalUrl, expectedUrl)) {
    return "needs_verification";
  }
  if (statusCode === 404 || statusCode === 410) return "unsupported";
  if (statusCode !== 200) return "needs_verification";
  if (typeof rawHtml !== "string" || rawHtml.length > MAX_UCP_BODY_LENGTH) {
    return "needs_verification";
  }
  let document: unknown;
  try {
    document = JSON.parse(rawHtml);
  } catch {
    return "needs_verification";
  }
  const ucp = asObject(asObject(document)?.ucp);
  if (ucp === null) return "needs_verification";
  if (!isBoundedString(ucp.version)) return "needs_verification";
  const states = [
    assessRegistry(ucp, "services", "dev.ucp.shopping", isShoppingService),
    assessRegistry(
      ucp,
      "capabilities",
      "dev.ucp.shopping.checkout",
      isCheckoutCapability,
    ),
    assessRegistry(
      ucp,
      "payment_handlers",
      "dev.shopify.card",
      isCardHandler,
    ),
  ];
  // Any malformed registry is ambiguous; a missing or empty required registry
  // is a well-formed profile without checkout support.
  if (states.includes("malformed")) return "needs_verification";
  return states.includes("missing") ? "unsupported" : "verified";
};

const entryUrl = (entry: Record<string, unknown>): string | undefined => {
  const metadata = asRecord(entry.metadata);
  return (
    asString(entry.url) ??
    asString(metadata?.url) ??
    asString(metadata?.sourceURL)
  );
};

/**
 * Validate untrusted search hits into at most four unique USD product pages.
 * Category and editorial hits, social/content hosts, missing prices, other
 * currencies, explicitly unavailable items, and over-cap prices are dropped.
 * Unknown availability is allowed during discovery; the direct-link path
 * freshly verifies it before creating a monitor.
 */
export const parseProductSearchResults = (
  results: unknown,
  maxPriceMinor?: number,
): ProductCandidate[] => {
  const web = asRecord(results)?.web;
  if (!Array.isArray(web)) return [];
  const seen = new Set<string>();
  const products: ProductCandidate[] = [];
  for (const entry of web) {
    const record = asRecord(entry);
    if (record === null) continue;
    const rawUrl = entryUrl(record);
    if (rawUrl === undefined) continue;
    const parsed = parseProductUrl(rawUrl);
    if (parsed === null || seen.has(parsed.productUrl)) continue;
    const json = asRecord(record.json);
    if (json === null) continue;
    const title = asString(json.title);
    const priceMinor = json.priceMinor;
    if (
      json.isProductPage !== true ||
      title === undefined ||
      title.trim().length === 0 ||
      title.length > MAX_TITLE_LENGTH ||
      json.currency !== "USD" ||
      json.available === false ||
      (json.available !== true && json.available !== null) ||
      typeof priceMinor !== "number" ||
      !Number.isSafeInteger(priceMinor) ||
      priceMinor < 0 ||
      (maxPriceMinor !== undefined && priceMinor > maxPriceMinor)
    ) {
      continue;
    }
    seen.add(parsed.productUrl);
    const imageUrl = parseImageUrl(asString(json.imageUrl));
    products.push({
      url: parsed.productUrl,
      title,
      priceMinor,
      merchantHost: parsed.merchantHost,
      ...(imageUrl === undefined ? {} : { imageUrl }),
    });
    if (products.length >= 4) break;
  }
  return products;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const getWatch = internalQuery({
  args: { watchId: v.id("productWatches") },
  returns: v.union(v.null(), schema.doc("productWatches")),
  handler: async (ctx, args) => await ctx.db.get(args.watchId),
});

export const getMemberLocality = internalQuery({
  args: { senderKey: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      searchNearMe: v.optional(v.boolean()),
      searchRadiusMeters: v.optional(v.number()),
      city: v.optional(v.string()),
      region: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      countryCode: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", args.senderKey))
      .unique();
    if (member === null) return null;
    return {
      searchNearMe: member.searchNearMe,
      // Only pass the radius along when the owner opted into near-me search.
      searchRadiusMeters:
        member.searchNearMe === true ? member.searchRadiusMeters : undefined,
      city: member.city,
      region: member.region,
      postalCode: member.postalCode,
      countryCode: member.countryCode,
    };
  },
});

// ---------------------------------------------------------------------------
// Create or return the one open watch
// ---------------------------------------------------------------------------

const requestWatchResult = v.union(
  v.object({ kind: v.literal("created"), watchId: v.id("productWatches") }),
  v.object({
    kind: v.literal("already_exists"),
    watchId: v.id("productWatches"),
  }),
  v.object({ kind: v.literal("conflict") }),
  v.object({ kind: v.literal("unknown_member") }),
  v.object({ kind: v.literal("not_owner") }),
);

type ReserveWatchArgs = {
  productUrl: string;
  merchantHost: string;
  capPriceMinor?: number;
  sizeLabel?: string;
  notifySpaceId: string;
  now: number;
};

/**
 * The one enforcement point for the one-open-watch invariant. Both the
 * iMessage direct-link path and the picker submit path reserve through here,
 * so the invariant cannot drift between them.
 */
const reserveWatch = async (
  ctx: MutationCtx,
  memberId: Id<"members">,
  args: ReserveWatchArgs,
) => {
  const requestKey = await sha256Hex(
    [args.productUrl, args.capPriceMinor ?? "none"].join("\n"),
  );

  const pendingCleanup = await ctx.db
    .query("productWatches")
    .withIndex("by_cleanup_pending", (q) => q.eq("cleanupPending", true))
    .first();
  if (pendingCleanup !== null) {
    return { kind: "conflict" as const };
  }

  // Multiple concurrent watches are allowed. An exact duplicate request
  // (same URL + cap) still reuses the existing open watch instead of
  // creating a second redundant monitor for the identical page.
  const duplicate = await ctx.db
    .query("productWatches")
    .withIndex("by_request_key", (q) => q.eq("requestKey", requestKey))
    .filter((q) => q.eq(q.field("isOpen"), true))
    .first();
  if (duplicate !== null) {
    return { kind: "already_exists" as const, watchId: duplicate._id };
  }

  const watchId = await ctx.db.insert("productWatches", {
    memberId,
    requestKey,
    productUrl: args.productUrl,
    merchantHost: args.merchantHost,
    capPriceMinor: args.capPriceMinor,
    sizeLabel: args.sizeLabel,
    status: "provisioning",
    isOpen: true,
    notifySpaceId: args.notifySpaceId,
    providerMonitorName: `convex-all-gas:${requestKey.slice(0, 16)}`,
    cleanupPending: false,
    createdAt: args.now,
    updatedAt: args.now,
  });
  return { kind: "created" as const, watchId };
};

/**
 * Create the sole open watch. The caller's HMAC-derived sender key must match
 * the configured owner, and the one-open-watch invariant is global, enforced
 * inside this transaction. Raw sender IDs never reach this function.
 */
export const requestWatch = internalMutation({
  args: {
    senderKey: v.string(),
    productUrl: v.string(),
    merchantHost: v.string(),
    capPriceMinor: v.optional(v.number()),
    notifySpaceId: v.string(),
    now: v.number(),
  },
  returns: requestWatchResult,
  handler: async (ctx, args) => {
    const ownerKey = env.OWNER_SENDER_KEY;
    if (
      typeof ownerKey !== "string" ||
      ownerKey.length === 0 ||
      args.senderKey !== ownerKey
    ) {
      return { kind: "not_owner" as const };
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", args.senderKey))
      .unique();
    if (member === null) {
      return { kind: "unknown_member" as const };
    }

    return await reserveWatch(ctx, member._id, args);
  },
});

// ---------------------------------------------------------------------------
// Picker sessions
// ---------------------------------------------------------------------------

/** Match a submitted size label; bounded, whitespace-collapsed, metadata only. */
export const MAX_SIZE_LABEL_LENGTH = 40;

const pickerSessionView = v.object({ candidates: v.array(pickerCandidate) });

/** The fields a search hit exposes; merchantHost is derived server-side. */
const pickerCandidateInput = pickerCandidate.omit("merchantHost");

const mintPickerResult = v.union(
  v.object({ kind: v.literal("ok") }),
  v.object({ kind: v.literal("unknown_member") }),
);

/**
 * Mint the owner's single open picker session. A new session closes any
 * previous open one, and only the token hash is persisted.
 */
export const mintPickerSession = internalMutation({
  args: {
    senderKey: v.string(),
    notifySpaceId: v.string(),
    tokenHash: v.string(),
    candidates: v.array(pickerCandidateInput),
    expiresAt: v.number(),
    now: v.number(),
  },
  returns: mintPickerResult,
  handler: async (ctx, args) => {
    const ownerKey = env.OWNER_SENDER_KEY;
    if (
      typeof ownerKey !== "string" ||
      ownerKey.length === 0 ||
      args.senderKey !== ownerKey
    ) {
      return { kind: "unknown_member" as const };
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", args.senderKey))
      .unique();
    if (member === null) {
      return { kind: "unknown_member" as const };
    }

    const prior = await ctx.db
      .query("pickerSessions")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();
    for (const session of prior) {
      if (session.status === "open") {
        await ctx.db.patch(session._id, {
          status: "used",
          usedAt: args.now,
        });
      }
    }

    const candidates: ((typeof args.candidates)[number] & {
      merchantHost: string;
    })[] = [];
    for (const candidate of args.candidates) {
      const parsed = parseProductUrl(candidate.url);
      if (parsed === null) continue;
      candidates.push({
        url: parsed.productUrl,
        title: candidate.title,
        priceMinor: candidate.priceMinor,
        merchantHost: parsed.merchantHost,
        checkoutSupport: candidate.checkoutSupport,
        // Carry the display photo through; it is optional and never fetched.
        ...(candidate.imageUrl === undefined
          ? {}
          : { imageUrl: candidate.imageUrl }),
      });
    }

    await ctx.db.insert("pickerSessions", {
      tokenHash: args.tokenHash,
      memberId: member._id,
      notifySpaceId: args.notifySpaceId,
      candidates,
      status: "open",
      expiresAt: args.expiresAt,
      createdAt: args.now,
    });
    return { kind: "ok" as const };
  },
});

/**
 * Read one open, unexpired session by token hash. Returns only candidates so
 * the HTTP layer can never leak the member, space, or token identifiers.
 */
export const getPickerSessionForToken = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  returns: v.union(v.null(), pickerSessionView),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("pickerSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      session === null ||
      session.status !== "open" ||
      session.expiresAt <= args.now
    ) {
      return null;
    }
    return { candidates: session.candidates };
  },
});

const pickerClaimResult = v.union(
  v.object({ kind: v.literal("invalid") }),
  v.object({ kind: v.literal("bad_url") }),
  v.object({ kind: v.literal("bad_cap") }),
  v.object({ kind: v.literal("bad_size") }),
  v.object({ kind: v.literal("conflict") }),
  v.object({
    kind: v.literal("created"),
    watchId: v.id("productWatches"),
    notifySpaceId: v.string(),
    productUrl: v.string(),
    merchantHost: v.string(),
    title: v.string(),
    priceMinor: v.number(),
    sizeLabel: v.optional(v.string()),
    capPriceMinor: v.optional(v.number()),
  }),
);

/**
 * Consume one picker token and reserve its watch in a single transaction. The
 * token match, candidate match, and reservation are atomic, so a double submit
 * cannot mint a second watch. Validation is duplicated here rather than trusted
 * from the HTTP body.
 */
export const claimPickerChoice = internalMutation({
  args: {
    tokenHash: v.string(),
    productUrl: v.string(),
    sizeLabel: v.optional(v.string()),
    capPriceMinor: v.optional(v.number()),
    now: v.number(),
  },
  returns: pickerClaimResult,
  handler: async (ctx, args) => {
    if (
      args.capPriceMinor !== undefined &&
      (!Number.isSafeInteger(args.capPriceMinor) || args.capPriceMinor < 0)
    ) {
      return { kind: "bad_cap" as const };
    }

    let sizeLabel: string | undefined;
    if (args.sizeLabel !== undefined) {
      if (typeof args.sizeLabel !== "string") {
        return { kind: "bad_size" as const };
      }
      const cleaned = args.sizeLabel.replace(/\s+/g, " ").trim();
      if (cleaned.length > MAX_SIZE_LABEL_LENGTH) {
        return { kind: "bad_size" as const };
      }
      sizeLabel = cleaned.length === 0 ? undefined : cleaned;
    }

    const session = await ctx.db
      .query("pickerSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      session === null ||
      session.status !== "open" ||
      session.expiresAt <= args.now
    ) {
      return { kind: "invalid" as const };
    }

    const parsed = parseProductUrl(args.productUrl);
    if (parsed === null) {
      return { kind: "bad_url" as const };
    }
    const candidate = session.candidates.find(
      (item) => item.url === parsed.productUrl,
    );
    if (candidate === undefined) {
      return { kind: "bad_url" as const };
    }

    await ctx.db.patch(session._id, { status: "used", usedAt: args.now });

    const reserved = await reserveWatch(ctx, session.memberId, {
      productUrl: candidate.url,
      merchantHost: candidate.merchantHost,
      capPriceMinor: args.capPriceMinor,
      sizeLabel,
      notifySpaceId: session.notifySpaceId,
      now: args.now,
    });
    if (reserved.kind === "already_exists") {
      return { kind: "conflict" as const };
    }
    if (reserved.kind === "conflict") {
      return { kind: "conflict" as const };
    }

    return {
      kind: "created" as const,
      watchId: reserved.watchId,
      notifySpaceId: session.notifySpaceId,
      productUrl: candidate.url,
      merchantHost: candidate.merchantHost,
      title: candidate.title,
      priceMinor: candidate.priceMinor,
      sizeLabel,
      capPriceMinor: args.capPriceMinor,
    };
  },
});

// ---------------------------------------------------------------------------
// Provisioning state
// ---------------------------------------------------------------------------

const attachMonitorResult = v.union(
  v.literal("activated"),
  v.literal("not_attached"),
);

/**
 * Persist the created monitor and mark the watch active in one compare-and-set.
 * Only a watch still `provisioning` may take the monitor id.
 */
export const activateWatch = internalMutation({
  args: {
    watchId: v.id("productWatches"),
    providerMonitorId: v.string(),
    priceMinor: v.number(),
    available: v.boolean(),
    now: v.number(),
  },
  returns: attachMonitorResult,
  handler: async (ctx, args) => {
    const watch = await ctx.db.get(args.watchId);
    if (
      watch === null ||
      watch.status !== "provisioning" ||
      watch.providerMonitorId !== undefined
    ) {
      return "not_attached" as const;
    }
    await ctx.db.patch(args.watchId, {
      providerMonitorId: args.providerMonitorId,
      status: "active",
      lastPriceMinor: args.priceMinor,
      lastAvailable: args.available,
      lastObservedAt: args.now,
      updatedAt: args.now,
    });
    return "activated" as const;
  },
});

export const failWatch = internalMutation({
  args: {
    watchId: v.id("productWatches"),
    failureCode,
    now: v.number(),
    cleanup: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const watch = await ctx.db.get(args.watchId);
    if (watch === null || !watch.isOpen) return null;
    const needsCleanup =
      args.cleanup === true && watch.providerMonitorId !== undefined;
    await ctx.db.patch(args.watchId, {
      status: "failed",
      isOpen: false,
      failureCode: args.failureCode,
      ...(needsCleanup ? { cleanupPending: true } : {}),
      updatedAt: args.now,
    });
    if (needsCleanup) {
      await ctx.scheduler.runAfter(0, internal.firecrawl.cleanupWatch, {
        watchId: args.watchId,
      });
    }
    return null;
  },
});

export const cancelWatch = internalMutation({
  args: { watchId: v.id("productWatches"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const watch = await ctx.db.get(args.watchId);
    if (watch === null || !watch.isOpen) return null;
    const needsCleanup = watch.providerMonitorId !== undefined;
    await ctx.db.patch(args.watchId, {
      status: "cancelled",
      isOpen: false,
      ...(needsCleanup ? { cleanupPending: true } : {}),
      updatedAt: args.now,
    });
    if (needsCleanup) {
      await ctx.scheduler.runAfter(0, internal.firecrawl.cleanupWatch, {
        watchId: args.watchId,
      });
    }
    return null;
  },
});

/** Record a failed provider delete and report whether a bounded retry may run. */
export const recordCleanupFailure = internalMutation({
  args: {
    watchId: v.id("productWatches"),
    now: v.number(),
  },
  returns: v.object({ retry: v.boolean() }),
  handler: async (ctx, args) => {
    const watch = await ctx.db.get(args.watchId);
    if (watch === null) return { retry: false };
    const attemptCount = (watch.cleanupAttemptCount ?? 0) + 1;
    await ctx.db.patch(args.watchId, {
      cleanupPending: true,
      failureCode: "cleanup_failed",
      cleanupAttemptCount: attemptCount,
      isOpen: false,
      updatedAt: args.now,
    });
    return { retry: attemptCount < 3 };
  },
});

export const completeCleanup = internalMutation({
  args: { watchId: v.id("productWatches"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const watch = await ctx.db.get(args.watchId);
    if (watch === null) return null;
    await ctx.db.patch(args.watchId, {
      cleanupPending: false,
      cleanupAttemptCount: undefined,
      updatedAt: args.now,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Webhook enqueue and processing
// ---------------------------------------------------------------------------

const claimEventResult = v.union(
  v.object({
    kind: v.literal("accepted"),
    eventId: v.id("firecrawlEvents"),
  }),
  v.object({ kind: v.literal("duplicate") }),
  v.object({ kind: v.literal("ignored") }),
);

export const claimEvent = internalMutation({
  args: {
    dedupeKey: v.string(),
    domainKey: v.string(),
    eventType,
    webhookId: v.string(),
    monitorId: v.string(),
    checkId: v.string(),
    eventUrl: v.optional(v.string()),
    pageStatus: v.optional(pageStatus),
    isMeaningful: v.optional(v.boolean()),
    bodyHash: v.string(),
    now: v.number(),
  },
  returns: claimEventResult,
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("firecrawlEvents")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
      .first();
    if (duplicate !== null) {
      return { kind: "duplicate" as const };
    }
    const sameDomain = await ctx.db
      .query("firecrawlEvents")
      .withIndex("by_domain_key", (q) => q.eq("domainKey", args.domainKey))
      .first();
    if (sameDomain !== null) {
      return { kind: "duplicate" as const };
    }

    const watch = await ctx.db
      .query("productWatches")
      .withIndex("by_provider_monitor_id", (q) =>
        q.eq("providerMonitorId", args.monitorId),
      )
      .first();
    if (watch === null) {
      return { kind: "ignored" as const };
    }
    if (
      args.eventUrl !== undefined &&
      !samePageUrl(args.eventUrl, watch.productUrl)
    ) {
      return { kind: "ignored" as const };
    }

    const eventId = await ctx.db.insert("firecrawlEvents", {
      dedupeKey: args.dedupeKey,
      domainKey: args.domainKey,
      eventType: args.eventType,
      webhookId: args.webhookId,
      monitorId: args.monitorId,
      checkId: args.checkId,
      eventUrl: args.eventUrl,
      pageStatus: args.pageStatus,
      isMeaningful: args.isMeaningful,
      bodyHash: args.bodyHash,
      status: "received",
      receivedAt: args.now,
    });
    await ctx.scheduler.runAfter(0, internal.firecrawl.processEvent, {
      eventId,
    });
    return { kind: "accepted" as const, eventId };
  },
});

const beginEventResult = v.union(
  v.null(),
  v.object({
    eventId: v.id("firecrawlEvents"),
    checkId: v.string(),
    pageStatus: v.optional(pageStatus),
    isMeaningful: v.optional(v.boolean()),
    watchId: v.id("productWatches"),
    productUrl: v.string(),
    capPriceMinor: v.optional(v.number()),
    notifySpaceId: v.string(),
    watchStatus,
    lastPriceMinor: v.optional(v.number()),
    lastAvailable: v.optional(v.boolean()),
  }),
);

/**
 * Claim one received event for processing. A processed, failed, or
 * already-processing event is skipped, so duplicate scheduling is harmless.
 */
export const beginEvent = internalMutation({
  args: { eventId: v.id("firecrawlEvents"), now: v.number() },
  returns: beginEventResult,
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null || event.status !== "received") return null;
    const watch = await ctx.db
      .query("productWatches")
      .withIndex("by_provider_monitor_id", (q) =>
        q.eq("providerMonitorId", event.monitorId),
      )
      .first();
    if (watch === null) {
      await ctx.db.patch(event._id, {
        status: "failed",
        processedAt: args.now,
      });
      return null;
    }
    await ctx.db.patch(event._id, { status: "processing" });
    return {
      eventId: event._id,
      checkId: event.checkId,
      pageStatus: event.pageStatus,
      isMeaningful: event.isMeaningful,
      watchId: watch._id,
      productUrl: watch.productUrl,
      capPriceMinor: watch.capPriceMinor,
      notifySpaceId: watch.notifySpaceId,
      watchStatus: watch.status,
      lastPriceMinor: watch.lastPriceMinor,
      lastAvailable: watch.lastAvailable,
    };
  },
});

const outcomeKind = v.union(
  v.literal("no_change"),
  v.literal("observed"),
  v.literal("failed"),
);

/**
 * Apply one processed event in a single transaction. Notification text is
 * composed by the caller; this mutation only records durable state.
 */
export const recordEventOutcome = internalMutation({
  args: {
    eventId: v.id("firecrawlEvents"),
    checkId: v.string(),
    kind: outcomeKind,
    observed: v.optional(
      v.object({ priceMinor: v.number(), available: v.boolean() }),
    ),
    /** Present text is validated and enqueued in this same transaction. */
    notificationText: v.optional(v.string()),
    shouldTrigger: v.boolean(),
    failureCode: v.optional(failureCode),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null || event.checkId !== args.checkId) return null;
    // Only an event claimed by beginEvent may be finalized.
    if (event.status !== "processing") return null;

    if (args.notificationText !== undefined) {
      const text = args.notificationText;
      if (text.trim().length === 0 || text.length > MAX_NOTIFICATION_LENGTH) {
        throw new Error("invalid notificationText");
      }
    }

    const watch = await ctx.db
      .query("productWatches")
      .withIndex("by_provider_monitor_id", (q) =>
        q.eq("providerMonitorId", event.monitorId),
      )
      .first();

    if (args.kind === "failed") {
      await ctx.db.patch(event._id, {
        status: "failed",
        failureCode: args.failureCode,
        processedAt: args.now,
      });
      return null;
    }

    if (watch !== null && args.kind === "observed" && args.observed !== undefined) {
      const shouldTrigger =
        args.shouldTrigger && watch.status === "active" && watch.isOpen;
      const nextStatus = shouldTrigger ? "triggered" : watch.status;
      await ctx.db.patch(watch._id, {
        status: nextStatus,
        isOpen: shouldTrigger ? false : watch.isOpen,
        lastPriceMinor: args.observed.priceMinor,
        lastAvailable: args.observed.available,
        lastObservedAt: args.now,
        ...(args.notificationText !== undefined
          ? { lastNotifiedAt: args.now }
          : {}),
        ...(shouldTrigger ? { cleanupPending: true } : {}),
        updatedAt: args.now,
      });
      if (args.notificationText !== undefined) {
        // Same transaction as the event/watch outcome: a rejected or failed
        // enqueue throws, so nothing is falsely marked processed/triggered.
        const queued = await spectrum.send(ctx, {
          spaceId: watch.notifySpaceId,
          content: { type: "text", text: args.notificationText },
        });
        if (!queued.queued) {
          throw new Error(
            `spectrum enqueue rejected: ${queued.reason ?? "unknown"}`,
          );
        }
      }
      if (shouldTrigger && watch.providerMonitorId !== undefined) {
        await ctx.scheduler.runAfter(0, internal.firecrawl.cleanupWatch, {
          watchId: watch._id,
        });
      }
    }

    await ctx.db.patch(event._id, {
      status: "processed",
      processedAt: args.now,
      observedPriceMinor: args.observed?.priceMinor,
      observedAvailable: args.observed?.available,
    });
    return null;
  },
});

/** Minimal failure helper for the processor action. */
export const failEvent = internalMutation({
  args: {
    eventId: v.id("firecrawlEvents"),
    failureCode,
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null) return null;
    if (event.status === "processed" || event.status === "failed") return null;
    await ctx.db.patch(event._id, {
      status: "failed",
      failureCode: args.failureCode,
      processedAt: args.now,
    });
    return null;
  },
});
