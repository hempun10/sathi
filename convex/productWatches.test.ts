/// <reference types="vite/client" />
import firecrawlTest from "@firecrawl/firecrawl-convex/test";
import spectrumTest from "@spectrum-ts/convex/test";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { hmacSenderKey, sha256Hex } from "./crypto";
import { combineBurst } from "./photon";
import {
  MAX_MESSAGE_TITLE_LENGTH,
  MAX_UCP_BODY_LENGTH,
  evaluateCheckoutSupport,
  normalizeProductFacts,
  parseCapText,
  parseImageUrl,
  parseProductSearchResults,
  parseProductUrl,
  parseWatchMessage,
  titleForMessage,
} from "./productWatches";
import schema from "./schema";
import {
  FALLBACK_QUESTION,
  MAX_CONSTRAINTS_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_SUBJECT_LENGTH,
  OPENAI_TIMEOUT_MS,
  callShoppingModel,
  parseShoppingPlan,
} from "./shopping";
import { spectrum } from "./spectrum";
import * as spectrumModule from "./spectrum";

// The cloud transport is replaced with a recording double so the sender action
// can be driven without a live iMessage line.
const cloudDeliver = vi.hoisted(() => vi.fn());
vi.mock("@spectrum-ts/convex/sender", () => ({
  createCloudSender: () => ({
    deliver: cloudDeliver,
    close: async () => {},
  }),
}));

// The Monitor SDK runs over axios in Node; tests replace it with a small mock.
const sdkCreateMonitor = vi.hoisted(() => vi.fn());
const sdkDeleteMonitor = vi.hoisted(() => vi.fn());
const sdkOptions = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("firecrawl", () => ({
  default: class MockFirecrawl {
    constructor(options: Record<string, unknown>) {
      sdkOptions.push(options);
    }

    createMonitor = sdkCreateMonitor;
    deleteMonitor = sdkDeleteMonitor;
  },
}));

const modules = import.meta.glob("./**/*.ts");

const SENDER_ID = "owner-1";
const SENDER_SECRET = "test-hmac-secret";
const PRODUCT_URL = "https://shop.example.com/products/thing";
const MERCHANT_HOST = "shop.example.com";
const UCP_URL = `https://${MERCHANT_HOST}/.well-known/ucp`;
const MONITOR_ID = "mon-1";
const WEBHOOK_TOKEN = "test-webhook-token";
const SPACE_ID = "space-1";

process.env.SENDER_HMAC_SECRET = SENDER_SECRET;
process.env.FIRECRAWL_API_KEY = "fc-test-key";
process.env.FIRECRAWL_MONITOR_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
process.env.CONVEX_SITE_URL = "https://example.convex.site";
process.env.SITE_URL = "https://app.example.com";
process.env.SPECTRUM_WEBHOOK_SECRET = "spectrum-secret";
process.env.SPECTRUM_PROJECT_ID = "project";
process.env.SPECTRUM_PROJECT_SECRET = "project-secret";
process.env.OPENAI_API_KEY = "openai-test-key";

let ownerKey = "";

beforeAll(async () => {
  ownerKey = await hmacSenderKey(SENDER_SECRET, SENDER_ID);
});

const setup = () => {
  process.env.OWNER_SENDER_KEY = ownerKey;
  const t = convexTest(schema, modules);
  spectrumTest.register(t);
  firecrawlTest.register(t);
  return t;
};

const seedOwner = async (t: ReturnType<typeof setup>) => {
  await t.run((ctx) =>
    ctx.db.insert("members", {
      senderKey: ownerKey,
      onboardingState: "active_unclaimed",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
};

const seedActiveWatch = async (
  t: ReturnType<typeof setup>,
  overrides: {
    capPriceMinor?: number;
    lastPriceMinor?: number;
    lastAvailable?: boolean;
  } = {},
) => {
  await seedOwner(t);
  const reserved = await t.mutation(internal.productWatches.requestWatch, {
    senderKey: ownerKey,
    productUrl: PRODUCT_URL,
    merchantHost: MERCHANT_HOST,
    capPriceMinor: overrides.capPriceMinor,
    notifySpaceId: SPACE_ID,
    now: 1,
  });
  if (reserved.kind !== "created") throw new Error("watch not created");
  await t.mutation(internal.productWatches.activateWatch, {
    watchId: reserved.watchId,
    providerMonitorId: MONITOR_ID,
    priceMinor: overrides.lastPriceMinor ?? 1_000,
    available: overrides.lastAvailable ?? true,
    now: 1,
  });
  return reserved.watchId;
};

const insertEvent = async (
  t: ReturnType<typeof setup>,
  overrides: {
    pageStatus?: "same" | "new" | "changed" | "removed" | "error";
    // `null` means the field is absent from the event entirely.
    isMeaningful?: boolean | null;
    webhookId?: string;
  } = {},
) => {
  const webhookId = overrides.webhookId ?? "w-1";
  return await t.run((ctx) =>
    ctx.db.insert("firecrawlEvents", {
      dedupeKey: `monitor.page:${webhookId}`,
      domainKey: `${MONITOR_ID}:chk-1:monitor.page`,
      eventType: "monitor.page",
      webhookId,
      monitorId: MONITOR_ID,
      checkId: "chk-1",
      eventUrl: PRODUCT_URL,
      pageStatus: overrides.pageStatus ?? "changed",
      ...(overrides.isMeaningful === null
        ? {}
        : { isMeaningful: overrides.isMeaningful ?? true }),
      bodyHash: "hash",
      status: "received",
      receivedAt: 2,
    }),
  );
};

const say = (t: ReturnType<typeof setup>, text: string) =>
  t.action(internal.photon.respond, {
    spaceId: SPACE_ID,
    chainId: "chain-1",
    messages: [
      {
        messageId: "m-1",
        senderId: SENDER_ID,
        content: { type: "text", text },
      },
    ],
    carried: [],
  });

const textMessage = (id: string, text: string) => ({
  messageId: id,
  senderId: SENDER_ID,
  content: { type: "text", text },
});

/** Drive one turn with a whole burst — multiple `messages`, plus `carried`. */
const sayBurst = (
  t: ReturnType<typeof setup>,
  texts: string[],
  carriedTexts: string[] = [],
) =>
  t.action(internal.photon.respond, {
    spaceId: SPACE_ID,
    chainId: "chain-1",
    messages: texts.map((text, i) => textMessage(`m-${i}`, text)),
    carried: carriedTexts.map((text, i) => textMessage(`c-${i}`, text)),
  });

// ---------------------------------------------------------------------------
// Minimal fetch router for the Firecrawl component's HTTP calls
// ---------------------------------------------------------------------------

type MockResponse = { status?: number; body?: unknown };
type Route = {
  match: (url: string, body: unknown) => boolean;
  respond:
    | MockResponse
    | ((body: unknown, url: string) => MockResponse | Promise<MockResponse>);
};

type RecordedCall = { url: string; method: string; body: unknown };

/** The raw owner message echoed inside the OpenAI request body. */
const modelMessageFromBody = (body: unknown): string => {
  const input = (body as { input?: unknown } | undefined)?.input;
  if (!Array.isArray(input)) return "";
  for (let index = input.length - 1; index >= 0; index--) {
    const item = input[index] as {
      role?: string;
      content?: { type?: string; text?: string }[];
    };
    if (item?.role !== "user" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === "input_text" && typeof part.text === "string") {
        try {
          const parsed = JSON.parse(part.text) as { message?: unknown };
          return typeof parsed.message === "string" ? parsed.message : "";
        } catch {
          return part.text;
        }
      }
    }
  }
  return "";
};

const searchPlan = (query: string) => ({
  action: "search",
  query,
  question: null,
  continuation: null,
  unsupportedReason: "none",
});

/** A strict-valid clarify plan. */
const clarifyPlan = (
  question: string,
  continuation: Record<string, unknown>,
) => ({
  action: "clarify",
  query: null,
  question,
  continuation,
  unsupportedReason: "none",
});

const unsupportedPlan = (reason: "purchase" | "unrelated") => ({
  action: "unsupported",
  query: null,
  question: null,
  continuation: null,
  unsupportedReason: reason,
});

/** An OpenAI route returning one fixed plan. */
const openAiRoute = (plan: unknown): Route => ({
  match: (url) => url.startsWith("https://api.openai.com/"),
  respond: { status: 200, body: openAiBody(plan) },
});

const openAiBody = (plan: unknown) => ({
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(plan) }],
    },
  ],
});

/** Default model behavior: echo the owner message as a search query. */
const defaultOpenAiRoute = (): Route => ({
  match: (url) => url.startsWith("https://api.openai.com/"),
  respond: (body) => ({
    status: 200,
    body: openAiBody(searchPlan(modelMessageFromBody(body))),
  }),
});

const installFetch = (routes: Route[]) => {
  const calls: RecordedCall[] = [];
  const allRoutes = [...routes, defaultOpenAiRoute()];
  const fetchMock = async (
    input: unknown,
    init?: { method?: string; body?: string },
  ) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const route = allRoutes.find((candidate) => candidate.match(url, body));
    if (route === undefined) {
      throw new Error(`unmatched fetch: ${method} ${url}`);
    }
    calls.push({ url, method, body });
    const response =
      typeof route.respond === "function"
        ? await route.respond(body, url)
        : route.respond;
    return new Response(JSON.stringify(response.body ?? {}), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  vi.stubGlobal("fetch", fetchMock);
  return calls;
};

const scrapeTarget = (body: unknown) => {
  const url = (body as { url?: unknown } | undefined)?.url;
  return typeof url === "string" ? url : "";
};

const scrapeRoute = (json: unknown): Route => ({
  match: (url, body) =>
    url.endsWith("/v2/scrape") &&
    !scrapeTarget(body).endsWith("/.well-known/ucp"),
  respond: { status: 200, body: { success: true, data: { json } } },
});

const UCP_VERSION = "2026-01";

/** A complete UCP profile in the current known shape. */
const ucpJson = (ucp: Record<string, unknown> = {}) => ({
  ucp: {
    version: UCP_VERSION,
    services: {
      "dev.ucp.shopping": [
        {
          version: UCP_VERSION,
          spec: "https://ucp.dev/specification/shopping",
          transport: "https",
          endpoint: "https://shop.example.com/api/ucp",
        },
      ],
    },
    capabilities: {
      "dev.ucp.shopping.checkout": [
        {
          version: UCP_VERSION,
          spec: "https://ucp.dev/specification/checkout",
          schema: "https://ucp.dev/schemas/checkout.json",
        },
      ],
    },
    payment_handlers: {
      "dev.shopify.card": [
        {
          id: "shopify.card",
          version: UCP_VERSION,
          spec: "https://shopify.dev/ucp/card",
          schema: "https://shopify.dev/schemas/card.json",
        },
      ],
    },
    ...ucp,
  },
});

/**
 * A UCP scrape response. `statusCode` is the target's HTTP status as reported
 * in Firecrawl metadata, and `rawHtml` is the untrusted profile body.
 */
const ucpRoute = (
  options: {
    host?: string;
    rawHtml?: string;
    statusCode?: number;
    /** `null` omits the final URL; a string simulates a redirected fetch. */
    finalUrl?: string | null;
  } = {},
): Route => ({
  match: (url, body) => {
    const target = scrapeTarget(body);
    return (
      url.endsWith("/v2/scrape") &&
      target.endsWith("/.well-known/ucp") &&
      (options.host === undefined ||
        target === `https://${options.host}/.well-known/ucp`)
    );
  },
  respond: (body) => {
    const target = scrapeTarget(body);
    const finalUrl =
      options.finalUrl === null ? undefined : (options.finalUrl ?? target);
    return {
      status: 200,
      body: {
        success: true,
        data: {
          rawHtml: options.rawHtml ?? JSON.stringify(ucpJson()),
          metadata: {
            statusCode: options.statusCode ?? 200,
            ...(finalUrl === undefined ? {} : { url: finalUrl }),
          },
        },
      },
    };
  },
});

type SearchEntry = {
  url: string;
  json?: unknown;
};

/** A well-formed in-stock USD product hit for a mocked search response. */
const productEntry = (
  url: string,
  overrides: Record<string, unknown> = {},
): SearchEntry => ({
  url,
  json: {
    isProductPage: true,
    title: "Samba OG Shoes",
    priceMinor: 10_000,
    currency: "USD",
    available: true,
    ...overrides,
  },
});

const searchRoute = (web: SearchEntry[]): Route => ({
  match: (url) => url.endsWith("/v2/search"),
  respond: { status: 200, body: { success: true, data: { web } } },
});

const validFacts = {
  url: PRODUCT_URL,
  title: "Thing",
  priceMinor: 1_000,
  currency: "USD",
  available: true,
};

const sentMessages: string[] = [];
const sentChainIds: (string | undefined)[] = [];
const typingEnqueues: { spaceId: string; chainId: string }[] = [];

/** Every sent message is a real reply now — there is no text acknowledgement. */
const replies = () => sentMessages;

/**
 * `failSendAtCount`: the nth `spectrum.send` call (1-indexed) throws instead
 * of sending, to exercise the unexpected-exception fallback.
 */
const spySpectrum = (options: { failSendAtCount?: number } = {}) => {
  sentMessages.length = 0;
  sentChainIds.length = 0;
  typingEnqueues.length = 0;
  let seq = 0;
  let sendCallCount = 0;
  vi.spyOn(spectrum, "isCancelled").mockResolvedValue(false);
  vi.spyOn(spectrum, "send").mockImplementation(async (_ctx, args) => {
    sendCallCount += 1;
    if (sendCallCount === options.failSendAtCount) {
      throw new Error("simulated send failure");
    }
    const content = args.content as { type?: string; text?: string };
    if (typeof content?.text === "string") sentMessages.push(content.text);
    sentChainIds.push(args.chainId);
    seq += 1;
    const clientGuid =
      args.chainId === undefined
        ? `${args.spaceId}:${Date.now()}#${seq}`
        : `${args.chainId}#${seq}`;
    return { queued: true, clientGuid };
  });
  vi.spyOn(spectrumModule.typingEnqueuer, "enqueue").mockImplementation(
    async (_ctx, args) => {
      typingEnqueues.push(args);
      return { queued: true, clientGuid: "typing-guid" };
    },
  );
  vi.spyOn(spectrum, "completeChain").mockResolvedValue();
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sdkCreateMonitor.mockReset();
  sdkDeleteMonitor.mockReset();
  sdkOptions.length = 0;
  cloudDeliver.mockReset();
});

// ---------------------------------------------------------------------------
// Deterministic parsing and URL safety
// ---------------------------------------------------------------------------

test("splits a message into an optional URL and optional USD cap", () => {
  expect(parseWatchMessage(`watch ${PRODUCT_URL} under $50`)).toEqual({
    rawUrl: PRODUCT_URL,
    capPriceMinor: 5_000,
  });
  expect(parseWatchMessage("wireless earbuds under $50")).toEqual({
    rawUrl: undefined,
    capPriceMinor: 5_000,
  });
  expect(parseWatchMessage(`watch ${PRODUCT_URL}`)).toEqual({
    rawUrl: PRODUCT_URL,
    capPriceMinor: undefined,
  });
});

test("strips trailing punctuation from a pasted URL", () => {
  expect(parseWatchMessage(`see ${PRODUCT_URL}.`).rawUrl).toBe(PRODUCT_URL);
  expect(parseWatchMessage(`see ${PRODUCT_URL}, ok`).rawUrl).toBe(PRODUCT_URL);
});

test("rejects malformed caps and accepts documented forms", () => {
  expect(parseCapText("under $12.34")).toBe(1_234);
  expect(parseCapText("$12.34")).toBe(1_234);
  expect(parseCapText("USD 12.34")).toBe(1_234);
  expect(parseCapText("at most $12.34")).toBe(1_234);
  expect(parseCapText("$12.0")).toBeUndefined();
  expect(parseCapText("$12.345")).toBeUndefined();
  expect(parseCapText("no cap here")).toBeUndefined();
});

test.each([
  [PRODUCT_URL, { productUrl: PRODUCT_URL, merchantHost: MERCHANT_HOST }],
  ["http://shop.example.com/products/thing", null],
  ["https://user:pass@shop.example.com/products/thing", null],
  [`${PRODUCT_URL}#main`, null],
  ["https://shop.example.com:8443/products/thing", null],
  ["https://127.0.0.1/products/thing", null],
  ["https://localhost/products/thing", null],
  ["https://printer.local/products/thing", null],
  ["https://youtube.com/watch?v=1", null],
  ["https://www.youtube.com/watch?v=1", null],
  ["https://youtu.be/abc", null],
  ["https://facebook.com/marketplace/item/1", null],
  ["https://m.facebook.com/marketplace/item/1", null],
  ["https://instagram.com/p/abc", null],
  ["https://tiktok.com/@shop/video/1", null],
  ["https://reddit.com/r/deals/comments/1", null],
  ["https://pinterest.com/pin/1", null],
  ["https://pin.it/abc", null],
  ["https://x.com/shop/status/1", null],
  ["https://twitter.com/shop/status/1", null],
  // Whole-host matching: a substring is not a social host.
  [
    "https://notyoutube.com/products/thing",
    {
      productUrl: "https://notyoutube.com/products/thing",
      merchantHost: "notyoutube.com",
    },
  ],
  // Tracking params carry no page identity and a merchant's own scraped URL
  // never includes them, so they are stripped before the URL is stored —
  // otherwise a real, valid scrape fails the later identity check solely
  // because the tapped link came from a Google/social click-through.
  [
    `${PRODUCT_URL}?srsltid=AU7gw4XVPe_5B1Eqqd28sjXB2sUPk5HOINaB_q0I`,
    { productUrl: PRODUCT_URL, merchantHost: MERCHANT_HOST },
  ],
  [
    `${PRODUCT_URL}?utm_source=google&utm_medium=cpc&gclid=abc123`,
    { productUrl: PRODUCT_URL, merchantHost: MERCHANT_HOST },
  ],
  // A real, non-tracking param survives stripping.
  [
    `${PRODUCT_URL}?variant=123&utm_source=x`,
    {
      productUrl: `${PRODUCT_URL}?variant=123`,
      merchantHost: MERCHANT_HOST,
    },
  ],
])("parseProductUrl(%s)", (raw, expected) => {
  expect(parseProductUrl(raw)).toEqual(expected);
});

test("normalizeProductFacts rejects wrong identity, currency, and prices", () => {
  expect(normalizeProductFacts(validFacts, PRODUCT_URL)).toMatchObject({
    title: "Thing",
    priceMinor: 1_000,
  });
  expect(
    normalizeProductFacts(
      { ...validFacts, url: "https://evil.example/x" },
      PRODUCT_URL,
    ),
  ).toBeNull();
  expect(
    normalizeProductFacts({ ...validFacts, priceMinor: -1 }, PRODUCT_URL),
  ).toBeNull();
  expect(
    normalizeProductFacts({ ...validFacts, priceMinor: 1.5 }, PRODUCT_URL),
  ).toBeNull();
  expect(
    normalizeProductFacts({ ...validFacts, extra: "x" }, PRODUCT_URL),
  ).toBeNull();
});

test("parseProductSearchResults drops category pages, non-USD, explicitly unavailable, and over-cap hits", () => {
  const results = {
    web: [
      // Category page: not a product detail page.
      productEntry("https://shop.example/collections/samba", {
        isProductPage: false,
      }),
      // Product page above the cap.
      productEntry("https://shop.example/products/samba-generic", {
        priceMinor: 19_700,
      }),
      // Product page exactly at the cap.
      productEntry("https://shop.example/products/samba-og", {
        priceMinor: 10_000,
      }),
      // Wrong currency.
      productEntry("https://shop.example/products/samba-eu", {
        currency: "EUR",
      }),
      // Out of stock.
      productEntry("https://shop.example/products/samba-out", {
        available: false,
      }),
      // Unknown availability is acceptable for discovery. The direct-link
      // scrape verifies it before monitoring.
      productEntry("https://shop.example/products/samba-unknown", {
        available: null,
        priceMinor: 9_000,
      }),
      // Duplicate of the in-cap product.
      productEntry("https://shop.example/products/samba-og"),
      // A second over-cap product page.
      productEntry("https://shop.example/products/samba-extra", {
        priceMinor: 20_000,
      }),
    ],
  };

  expect(parseProductSearchResults(results, 10_000)).toEqual([
    {
      url: "https://shop.example/products/samba-og",
      title: "Samba OG Shoes",
      priceMinor: 10_000,
      merchantHost: "shop.example",
    },
    {
      url: "https://shop.example/products/samba-unknown",
      title: "Samba OG Shoes",
      priceMinor: 9_000,
      merchantHost: "shop.example",
    },
  ]);
  // Without a cap, the first four distinct eligible products are returned.
  expect(parseProductSearchResults(results)).toHaveLength(4);
});

test("parseProductSearchResults returns at most four distinct products", () => {
  const results = {
    web: Array.from({ length: 6 }, (_, index) =>
      productEntry(`https://shop${index}.example/products/item-${index}`, {
        title: `Item ${index}`,
        priceMinor: 1_000 + index,
      }),
    ),
  };
  const products = parseProductSearchResults(results);
  expect(products).toHaveLength(4);
  expect(products.map((product) => product.title)).toEqual([
    "Item 0",
    "Item 1",
    "Item 2",
    "Item 3",
  ]);
});

test("parseProductSearchResults drops social hosts even when extracted as products", () => {
  const results = {
    web: [
      productEntry("https://www.youtube.com/watch?v=1"),
      productEntry("https://facebook.com/marketplace/item/1"),
      productEntry("https://instagram.com/p/abc"),
      productEntry("https://tiktok.com/@shop/video/1"),
      productEntry("https://reddit.com/r/deals/comments/1"),
      productEntry("https://pinterest.com/pin/1"),
      productEntry("https://x.com/shop/status/1"),
      productEntry("https://shop.example/products/real"),
    ],
  };
  expect(parseProductSearchResults(results)).toEqual([
    {
      url: "https://shop.example/products/real",
      title: "Samba OG Shoes",
      priceMinor: 10_000,
      merchantHost: "shop.example",
    },
  ]);
});

test("parseImageUrl accepts only clean HTTPS product photos", () => {
  expect(parseImageUrl("https://cdn.example.com/a.jpg?v=1")).toBe(
    "https://cdn.example.com/a.jpg?v=1",
  );
  expect(parseImageUrl("  https://cdn.example.com/a.jpg  ")).toBe(
    "https://cdn.example.com/a.jpg",
  );
  // Display-only, so anything that is not a plain remote HTTPS image is dropped.
  expect(parseImageUrl(undefined)).toBeUndefined();
  expect(parseImageUrl("")).toBeUndefined();
  expect(parseImageUrl("http://cdn.example.com/a.jpg")).toBeUndefined();
  expect(parseImageUrl("data:image/png;base64,AAAA")).toBeUndefined();
  expect(parseImageUrl("file:///etc/passwd")).toBeUndefined();
  expect(
    parseImageUrl("https://user:pw@cdn.example.com/a.jpg"),
  ).toBeUndefined();
  expect(
    parseImageUrl("https://cdn.example.com/" + "a".repeat(2_100)),
  ).toBeUndefined();
});

test("parseProductSearchResults carries a usable product photo and drops a bad one", () => {
  const results = {
    web: [
      productEntry("https://shop.example/products/with-image", {
        imageUrl: "https://cdn.example.com/samba.jpg",
      }),
      productEntry("https://shop.example/products/bad-image", {
        imageUrl: "http://cdn.example.com/insecure.jpg",
      }),
      productEntry("https://shop.example/products/no-image", {
        imageUrl: null,
      }),
    ],
  };
  const products = parseProductSearchResults(results);
  expect(products[0].imageUrl).toBe("https://cdn.example.com/samba.jpg");
  // A bad or missing photo never drops the product, it only loses the image.
  expect(products[1].imageUrl).toBeUndefined();
  expect(products[2].imageUrl).toBeUndefined();
  expect(products).toHaveLength(3);
});

const evaluate = (
  statusCode: unknown,
  rawHtml: unknown,
  overrides: { finalUrl?: unknown; expectedUrl?: string } = {},
) =>
  evaluateCheckoutSupport(
    statusCode,
    rawHtml,
    overrides.finalUrl === undefined ? UCP_URL : overrides.finalUrl,
    overrides.expectedUrl ?? UCP_URL,
  );

test("evaluateCheckoutSupport verifies a complete Shopify UCP profile", () => {
  expect(evaluate(200, JSON.stringify(ucpJson()))).toBe("verified");
});

test("evaluateCheckoutSupport marks a well-formed profile missing a required registry as unsupported", () => {
  expect(evaluate(200, JSON.stringify(ucpJson({ services: {} })))).toBe(
    "unsupported",
  );
  expect(evaluate(200, JSON.stringify(ucpJson({ capabilities: {} })))).toBe(
    "unsupported",
  );
  expect(evaluate(200, JSON.stringify(ucpJson({ payment_handlers: {} })))).toBe(
    "unsupported",
  );
  // Empty capability arrays are equally unsupported.
  expect(
    evaluate(
      200,
      JSON.stringify(ucpJson({ services: { "dev.ucp.shopping": [] } })),
    ),
  ).toBe("unsupported");
  // The registries themselves may be absent from the profile.
  expect(evaluate(200, JSON.stringify({ ucp: { version: UCP_VERSION } }))).toBe(
    "unsupported",
  );
});

test("evaluateCheckoutSupport defers on malformed registry types and entries", () => {
  // Wrong registry types.
  expect(evaluate(200, JSON.stringify(ucpJson({ services: "nope" })))).toBe(
    "needs_verification",
  );
  expect(evaluate(200, JSON.stringify(ucpJson({ capabilities: 42 })))).toBe(
    "needs_verification",
  );
  expect(
    evaluate(200, JSON.stringify(ucpJson({ payment_handlers: true }))),
  ).toBe("needs_verification");
  // A non-array capability value is malformed, unlike an empty array.
  expect(
    evaluate(
      200,
      JSON.stringify(ucpJson({ services: { "dev.ucp.shopping": {} } })),
    ),
  ).toBe("needs_verification");
  // Malformed service entries: null, empty, missing endpoint/schema, empty
  // fields, wrong field types, and over-long fields.
  for (const entry of [
    null,
    {},
    { version: UCP_VERSION, spec: "spec", transport: "https" },
    { version: "", spec: "spec", transport: "https", endpoint: "endpoint" },
    { version: 1, spec: "spec", transport: "https", endpoint: "endpoint" },
    {
      version: "x".repeat(MAX_UCP_BODY_LENGTH + 1),
      spec: "spec",
      transport: "https",
      endpoint: "endpoint",
    },
  ]) {
    expect(
      evaluate(
        200,
        JSON.stringify(ucpJson({ services: { "dev.ucp.shopping": [entry] } })),
      ),
    ).toBe("needs_verification");
  }
  expect(
    evaluate(
      200,
      JSON.stringify(
        ucpJson({ capabilities: { "dev.ucp.shopping.checkout": [{}] } }),
      ),
    ),
  ).toBe("needs_verification");
  expect(
    evaluate(
      200,
      JSON.stringify(
        ucpJson({ payment_handlers: { "dev.shopify.card": [null] } }),
      ),
    ),
  ).toBe("needs_verification");
});

test("evaluateCheckoutSupport requires the final response URL to match the expected well-known path", () => {
  const body = JSON.stringify(ucpJson());
  expect(evaluate(200, body, { finalUrl: null })).toBe("needs_verification");
  expect(evaluate(200, body, { finalUrl: 7 })).toBe("needs_verification");
  // A cross-host redirect never verifies.
  expect(
    evaluate(200, body, {
      finalUrl: "https://redirected.example/.well-known/ucp",
    }),
  ).toBe("needs_verification");
  // A same-origin redirect to another path does not verify either.
  expect(
    evaluate(200, body, { finalUrl: `https://${MERCHANT_HOST}/other` }),
  ).toBe("needs_verification");
  // samePageUrl ignores fragments, so a fragment on the correct path verifies.
  expect(evaluate(200, body, { finalUrl: `${UCP_URL}#main` })).toBe("verified");
  // The URL gate applies even to a 404, so a cross-host redirect can never be
  // reported as a definitive unsupported profile.
  expect(
    evaluate(404, "", {
      finalUrl: "https://redirected.example/.well-known/ucp",
    }),
  ).toBe("needs_verification");
  expect(evaluate(404, "", { finalUrl: null })).toBe("needs_verification");
});

test("evaluateCheckoutSupport marks explicit 404/410 as unsupported", () => {
  expect(evaluate(404, "")).toBe("unsupported");
  expect(evaluate(410, "not json")).toBe("unsupported");
});

test("evaluateCheckoutSupport defers on transient, invalid, oversized, or ambiguous responses", () => {
  // Timeout/network/5xx and missing status.
  expect(evaluate(500, "{}")).toBe("needs_verification");
  expect(evaluate(undefined, "{}")).toBe("needs_verification");
  expect(evaluate(200, "not json")).toBe("needs_verification");
  expect(evaluate(200, "x".repeat(MAX_UCP_BODY_LENGTH + 1))).toBe(
    "needs_verification",
  );
  // Valid JSON that is not a recognizable UCP document is ambiguous.
  expect(evaluate(200, JSON.stringify({ nope: true }))).toBe(
    "needs_verification",
  );
  expect(evaluate(200, JSON.stringify({ ucp: {} }))).toBe("needs_verification");
});

test("parseProductSearchResults rejects untrusted and malformed hits", () => {
  const results = {
    web: [
      productEntry("http://shop.example/products/insecure"),
      productEntry("https://127.0.0.1/products/ip"),
      productEntry("https://shop.example/products/no-title", { title: "  " }),
      productEntry("https://shop.example/products/float", { priceMinor: 10.5 }),
      productEntry("https://shop.example/products/negative", {
        priceMinor: -1,
      }),
      { url: "https://shop.example/products/missing-json" },
      "not an object",
      productEntry("https://shop.example/products/ok"),
    ],
  };
  // Only the final entry carries usable json; the rest are dropped.
  expect(parseProductSearchResults(results)).toEqual([
    {
      url: "https://shop.example/products/ok",
      title: "Samba OG Shoes",
      priceMinor: 10_000,
      merchantHost: "shop.example",
    },
  ]);
});

// ---------------------------------------------------------------------------
// Direct URL path skips Search
// ---------------------------------------------------------------------------

test("a URL message scrapes, reserves one watch, and creates a monitor without searching", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  const calls = installFetch([scrapeRoute(validFacts)]);

  await say(t, `watch ${PRODUCT_URL} under $50.00`);

  expect(calls.every((call) => !call.url.endsWith("/v2/search"))).toBe(true);
  expect(calls.filter((call) => call.url.endsWith("/v2/scrape"))).toHaveLength(
    1,
  );
  expect(sdkCreateMonitor).toHaveBeenCalledTimes(1);

  const request = sdkCreateMonitor.mock.calls[0][0] as Record<string, unknown>;
  expect(request).toMatchObject({
    name: expect.stringContaining("convex-all-gas"),
    schedule: { text: "every 30 minutes", timezone: "UTC" },
    targets: [
      {
        type: "scrape",
        urls: [PRODUCT_URL],
        scrapeOptions: { formats: ["markdown"], maxAge: 0 },
      },
    ],
    webhook: {
      url: "https://example.convex.site/api/webhooks/firecrawl",
      events: ["monitor.page"],
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    },
    retentionDays: 7,
    judgeEnabled: true,
  });

  const watches = await t.run((ctx) =>
    ctx.db.query("productWatches").collect(),
  );
  expect(watches).toHaveLength(1);
  expect(watches[0]).toMatchObject({
    status: "active",
    isOpen: true,
    capPriceMinor: 5_000,
    providerMonitorId: MONITOR_ID,
  });

  // Exactly one concise final reply — no acknowledgement text.
  expect(sentMessages).toHaveLength(1);
  const finalReply = replies()[0];
  expect(finalReply).toContain("$50.00");
  // The purchase boundary is stated once on the picker, not repeated per reply.
  expect(finalReply).not.toContain("I won't buy anything");
  expect(finalReply).not.toContain("Nothing is purchased automatically");
  expect(finalReply).not.toContain("explicit approval");
});

test("a duplicate URL message returns the existing watch without a second monitor", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  installFetch([scrapeRoute(validFacts)]);

  await say(t, `watch ${PRODUCT_URL}`);
  await say(t, `watch ${PRODUCT_URL}`);

  const watches = await t.run((ctx) =>
    ctx.db.query("productWatches").collect(),
  );
  expect(watches).toHaveLength(1);
  expect(sdkCreateMonitor).toHaveBeenCalledTimes(1);
  expect(sentMessages.at(-1)).toContain("already watching");
  // One reply per turn, no acknowledgement text.
  expect(sentMessages).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// URL-free Search path
// ---------------------------------------------------------------------------

/** Pull the raw picker token out of the single link reply. */
const pickerTokenFrom = (message: string) => {
  const match = message.match(/\/pick\?t=([0-9a-f]{64})/);
  if (match === null) throw new Error(`no picker link in reply: ${message}`);
  return match[1];
};

test("a URL-free message replies with the picker link and stores nothing", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    searchRoute([
      // The live provider ranked eight category/social pages before the first
      // product. Keeping these ahead of the product protects the result limit.
      ...Array.from({ length: 8 }, (_, index) =>
        productEntry(`https://a.example/collections/samba-${index}`, {
          isProductPage: false,
        }),
      ),
      // Real product above the parsed cap.
      productEntry("https://a.example/products/samba-generic", {
        title: "Generic Samba Page",
        priceMinor: 19_700,
      }),
      productEntry("https://b.example/products/samba-og", {
        title: "Samba OG Shoes",
        priceMinor: 10_000,
      }),
      // Duplicate of the second product.
      productEntry("https://b.example/products/samba-og"),
      productEntry("https://c.example/products/samba-classic", {
        title: "Samba Classic",
        priceMinor: 8_000,
      }),
    ]),
    ucpRoute(),
  ]);

  await say(t, "adidas samba product under $100");

  // Only well-known UCP profiles are scraped during search; a product page is
  // never scraped until the owner sends its URL back.
  expect(
    calls.some(
      (call) =>
        call.url.endsWith("/v2/scrape") &&
        !scrapeTarget(call.body).endsWith("/.well-known/ucp"),
    ),
  ).toBe(false);
  // The search request itself must ask for one strict JSON extraction per hit.
  const searchCall = calls.find((call) => call.url.endsWith("/v2/search"));
  expect(searchCall?.body).toMatchObject({
    query: "adidas samba product under $100 individual product page",
    limit: 10,
    scrapeOptions: {
      maxAge: 0,
      formats: [{ type: "json", schema: expect.any(Object) }],
    },
  });
  // Exactly one message: the bare picker link, no acknowledgement.
  expect(sentMessages).toHaveLength(1);
  const reply = replies()[0];
  expect(reply).toContain("I found 2 options:");
  const token = pickerTokenFrom(reply);
  expect(reply).not.toContain("1. Samba OG Shoes");
  expect(reply).not.toContain("Send me the URL of the one you want");
  // The above-cap generic page and the category page never appear.
  expect(reply).not.toContain("Generic Samba Page");
  expect(reply).not.toContain("collections");
  // No repeated legal, Prava, or locality prose on the text reply.
  expect(reply).not.toContain("Prava");
  expect(reply).not.toContain("No purchase occurred");
  expect(reply).not.toContain("not localized");
  expect(reply).not.toContain("\n");

  // The link's token hashes to the one stored session, and the session
  // carries exactly the two real in-cap products.
  const sessions = await t.run((ctx) =>
    ctx.db.query("pickerSessions").collect(),
  );
  expect(sessions).toHaveLength(1);
  expect(await sha256Hex(token)).toBe(sessions[0].tokenHash);
  const body = await (await t.fetch(`/api/pick?t=${token}`)).json();
  expect(
    body.candidates.map((candidate: { title: string }) => candidate.title),
  ).toEqual(["Samba OG Shoes", "Samba Classic"]);
  // A URL-free discovery never reserves a watch.
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(0);
});

test("search scrapes the well-known UCP profile once per unique merchant host", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    searchRoute([
      productEntry("https://a.example/products/one", { title: "One" }),
      productEntry("https://a.example/products/two", { title: "Two" }),
      productEntry("https://b.example/products/three", { title: "Three" }),
    ]),
    ucpRoute(),
  ]);

  await say(t, "widgets");

  const ucpCalls = calls.filter((call) =>
    scrapeTarget(call.body).endsWith("/.well-known/ucp"),
  );
  expect(ucpCalls).toHaveLength(2);
  expect(ucpCalls.map((call) => scrapeTarget(call.body)).sort()).toEqual([
    "https://a.example/.well-known/ucp",
    "https://b.example/.well-known/ucp",
  ]);
  // A one-hour cache window avoids repeat credits on the same profile.
  expect(
    ucpCalls.every(
      (call) => (call.body as { maxAge?: number }).maxAge === 3_600_000,
    ),
  ).toBe(true);
  expect(
    ucpCalls.every(
      (call) =>
        JSON.stringify((call.body as { formats?: unknown }).formats) ===
        JSON.stringify(["rawHtml"]),
    ),
  ).toBe(true);
});

test("search treats a redirected or cross-host UCP profile as unverified", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  installFetch([
    searchRoute([
      productEntry("https://shop.example/products/one", {
        title: "Redirected",
      }),
    ]),
    ucpRoute({ finalUrl: "https://evil.example/.well-known/ucp" }),
  ]);

  await say(t, "widgets");

  // The plain-language badges live on the picker page now.
  const token = pickerTokenFrom(replies()[0]);
  const html = await (await getPickerHtml(t, token)).text();
  expect(html).toContain("Needs Prava verification");
  const body = await (await t.fetch(`/api/pick?t=${token}`)).json();
  expect(body.candidates[0].checkoutSupport).toBe("needs_verification");
});

test("the picker page labels each checkout-support outcome plainly", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  installFetch([
    searchRoute([
      productEntry("https://ok.example/products/one", {
        title: "Verified One",
      }),
      productEntry("https://no.example/products/two", {
        title: "Unsupported Two",
      }),
      productEntry("https://maybe.example/products/three", {
        title: "Unknown Three",
      }),
    ]),
    ucpRoute({ host: "ok.example" }),
    ucpRoute({
      host: "no.example",
      rawHtml: JSON.stringify(ucpJson({ capabilities: {} })),
    }),
    ucpRoute({ host: "maybe.example", statusCode: 503 }),
  ]);

  await say(t, "widgets");

  const token = pickerTokenFrom(replies()[0]);
  const html = await (await getPickerHtml(t, token)).text();
  expect(html).toContain("Prava verified");
  expect(html).toContain("Auto-checkout unsupported");
  expect(html).toContain("Needs Prava verification");

  const body = await (await t.fetch(`/api/pick?t=${token}`)).json();
  expect(
    body.candidates.map(
      (candidate: { checkoutSupport: string }) => candidate.checkoutSupport,
    ),
  ).toEqual(["verified", "unsupported", "needs_verification"]);
});

test("search exposes only the four listing fields and never persists the UCP profile", async () => {
  const t = setup();
  await seedOwner(t);
  const rawHtml = JSON.stringify(ucpJson());
  installFetch([
    searchRoute([productEntry("https://shop.example/products/thing")]),
    ucpRoute({ rawHtml }),
  ]);

  const result = await t.action(internal.firecrawl.searchProducts, {
    query: "thing",
    searchNearMe: false,
  });
  if (result.kind !== "ok") throw new Error("expected ok search");

  expect(Object.keys(result.products[0]).sort()).toEqual([
    "checkoutSupport",
    "priceMinor",
    "title",
    "url",
  ]);
  expect(JSON.stringify(result)).not.toContain("dev.ucp");
  expect(Object.keys(schema.tables)).not.toContain("ucpProfiles");
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(0);
  expect(
    await t.run((ctx) => ctx.db.query("firecrawlEvents").collect()),
  ).toHaveLength(0);
});

test("saved locality is still sent to search but never narrated in the reply", async () => {
  const t = setup();
  await seedOwner(t);
  await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique()
      .then((member) =>
        member === null
          ? null
          : ctx.db.patch(member._id, {
              searchNearMe: true,
              city: "Austin",
              region: "TX",
              countryCode: "US",
            }),
      ),
  );
  spySpectrum();
  const calls = installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");
  const searchCall = calls.find((call) => call.url.endsWith("/v2/search"));
  expect(searchCall?.body).toMatchObject({
    location: "Austin, TX",
    country: "US",
  });
  expect(replies()[0]).not.toContain("Austin");
  expect(replies()[0]).not.toContain("location");
});

test("missing locality sends no location option and no narration", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");
  const searchCall = calls.find((call) => call.url.endsWith("/v2/search"));
  expect((searchCall?.body as { location?: unknown }).location).toBeUndefined();
  expect(replies()[0]).not.toContain("not localized");
});

test("search appends an approximate radius hint when enabled", async () => {
  const t = setup();
  await seedOwner(t);
  await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique()
      .then((member) =>
        member === null
          ? null
          : ctx.db.patch(member._id, {
              searchNearMe: true,
              searchRadiusMeters: 5_000,
              city: "Austin",
              countryCode: "US",
            }),
      ),
  );
  spySpectrum();
  const calls = installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");

  const searchCall = calls.find((call) => call.url.endsWith("/v2/search"));
  expect(searchCall?.body).toMatchObject({
    query:
      "wireless earbuds individual product page within approximately 5000 meters",
  });
  // The radius is a search hint, not text the owner has to read.
  expect(replies()[0]).not.toContain("approximately");
});

test("a saved radius is neither sent nor disclosed when search near me is off", async () => {
  const t = setup();
  await seedOwner(t);
  await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique()
      .then((member) =>
        member === null
          ? null
          : ctx.db.patch(member._id, {
              searchNearMe: false,
              searchRadiusMeters: 5_000,
              city: "Austin",
              countryCode: "US",
            }),
      ),
  );
  spySpectrum();
  const calls = installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");

  const searchCall = calls.find((call) => call.url.endsWith("/v2/search"));
  expect(searchCall?.body).toMatchObject({
    query: "wireless earbuds individual product page",
  });
  expect(replies()[0]).not.toContain("approximately");
});

// ---------------------------------------------------------------------------
// One open watch
// ---------------------------------------------------------------------------

test("only one open watch survives concurrent requests", async () => {
  const t = setup();
  await seedOwner(t);
  const args = {
    senderKey: ownerKey,
    productUrl: PRODUCT_URL,
    merchantHost: MERCHANT_HOST,
    notifySpaceId: SPACE_ID,
    now: 1,
  };
  const first = await t.mutation(internal.productWatches.requestWatch, args);
  const same = await t.mutation(internal.productWatches.requestWatch, args);
  const different = await t.mutation(internal.productWatches.requestWatch, {
    ...args,
    capPriceMinor: 5_000,
  });
  const otherProduct = await t.mutation(internal.productWatches.requestWatch, {
    ...args,
    productUrl: "https://shop.example.com/products/other",
  });

  expect(first.kind).toBe("created");
  expect(same.kind).toBe("already_exists");
  expect(different.kind).toBe("conflict");
  expect(otherProduct.kind).toBe("conflict");
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("productWatches")
        .withIndex("by_is_open", (q) => q.eq("isOpen", true))
        .collect(),
    ),
  ).toHaveLength(1);
});

test("a non-owner cannot reserve a watch", async () => {
  const t = setup();
  await seedOwner(t);
  const result = await t.mutation(internal.productWatches.requestWatch, {
    senderKey: "not-the-owner",
    productUrl: PRODUCT_URL,
    merchantHost: MERCHANT_HOST,
    notifySpaceId: SPACE_ID,
    now: 1,
  });
  expect(result.kind).toBe("not_owner");
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Webhook authentication and dedupe
// ---------------------------------------------------------------------------

const webhookPayload = (webhookId = "wh-1") => ({
  success: true,
  type: "monitor.page",
  id: "chk-1",
  webhookId,
  data: [
    {
      monitorId: MONITOR_ID,
      checkId: "chk-1",
      url: PRODUCT_URL,
      status: "changed",
      isMeaningful: true,
    },
  ],
});

const postWebhook = (
  t: ReturnType<typeof setup>,
  payload: unknown,
  token: string | null = WEBHOOK_TOKEN,
) =>
  t.fetch("/api/webhooks/firecrawl", {
    method: "POST",
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

test("missing or wrong bearer tokens return 401 and write nothing", async () => {
  const t = setup();
  await seedActiveWatch(t);
  expect((await postWebhook(t, webhookPayload(), null)).status).toBe(401);
  expect((await postWebhook(t, webhookPayload(), "wrong")).status).toBe(401);
  expect(
    await t.run((ctx) => ctx.db.query("firecrawlEvents").collect()),
  ).toHaveLength(0);
});

test("a valid event is acknowledged once and dedupes by delivery and by check", async () => {
  const t = setup();
  await seedActiveWatch(t);

  const first = await postWebhook(t, webhookPayload());
  expect(first.status).toBe(202);
  const replay = await postWebhook(t, webhookPayload());
  expect(replay.status).toBe(202);
  const redelivered = await postWebhook(t, webhookPayload("wh-2"));
  expect(redelivered.status).toBe(202);

  const events = await t.run((ctx) =>
    ctx.db.query("firecrawlEvents").collect(),
  );
  expect(events).toHaveLength(1);
  expect(events[0].dedupeKey).toBe("monitor.page:wh-1");
  expect(events[0].bodyHash).toMatch(/^[0-9a-f]{64}$/);
});

test("an event for an unknown monitor writes nothing", async () => {
  const t = setup();
  await seedActiveWatch(t);
  const payload = webhookPayload();
  payload.data[0].monitorId = "unknown-monitor";
  expect((await postWebhook(t, payload)).status).toBe(202);
  expect(
    await t.run((ctx) => ctx.db.query("firecrawlEvents").collect()),
  ).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Fresh re-scrape before any price statement
// ---------------------------------------------------------------------------

test("a changed event always triggers a fresh scrape, not the webhook diff", async () => {
  const t = setup();
  await seedActiveWatch(t, { capPriceMinor: 500, lastPriceMinor: 1_000 });
  spySpectrum();
  // The page is unchanged on the fresh scrape, so nothing is notified.
  const calls = installFetch([scrapeRoute(validFacts)]);
  const eventId = await insertEvent(t);

  const result = await t.action(internal.firecrawl.processEvent, { eventId });

  expect(calls.filter((call) => call.url.endsWith("/v2/scrape"))).toHaveLength(
    1,
  );
  expect(result.kind).toBe("observed");
  expect(sentMessages).toHaveLength(0);
});

test("a failed fresh scrape records a sanitized failure and never notifies", async () => {
  const t = setup();
  const watchId = await seedActiveWatch(t, { capPriceMinor: 500 });
  spySpectrum();
  installFetch([
    {
      match: (url) => url.endsWith("/v2/scrape"),
      respond: { status: 500, body: {} },
    },
  ]);
  const eventId = await insertEvent(t);

  const result = await t.action(internal.firecrawl.processEvent, { eventId });

  expect(result.kind).toBe("failed");
  expect(sentMessages).toHaveLength(0);
  const event = await t.run((ctx) => ctx.db.get(eventId));
  expect(event?.status).toBe("failed");
  const watch = await t.run((ctx) => ctx.db.get(watchId));
  expect(watch?.status).toBe("active");
});

// ---------------------------------------------------------------------------
// Threshold and non-threshold behavior
// ---------------------------------------------------------------------------

test("with a cap, notifies only at or below the fresh verified price and closes the watch", async () => {
  const t = setup();
  const watchId = await seedActiveWatch(t, {
    capPriceMinor: 500,
    lastPriceMinor: 1_000,
  });
  spySpectrum();
  sdkDeleteMonitor.mockResolvedValue(true);
  installFetch([scrapeRoute({ ...validFacts, priceMinor: 400 })]);
  const eventId = await insertEvent(t);

  const result = await t.action(internal.firecrawl.processEvent, { eventId });

  expect(result.kind).toBe("notified");
  if (result.kind !== "notified") throw new Error("expected notified");
  expect(result.message).toContain("$4.00");
  expect(result.message).toContain("your cap: $5.00");
  // The alert states the change only; the boundary is not repeated here.
  expect(result.message).not.toContain("Nothing was purchased");
  expect(result.message).not.toContain("Explicit approval");

  const watch = await t.run((ctx) => ctx.db.get(watchId));
  expect(watch?.status).toBe("triggered");
  expect(watch?.isOpen).toBe(false);

  await t.finishAllScheduledFunctions(() => {});
  expect(sdkDeleteMonitor).toHaveBeenCalledTimes(1);
});

test("with a cap, an in-stock price above the cap does not notify", async () => {
  const t = setup();
  const watchId = await seedActiveWatch(t, { capPriceMinor: 500 });
  spySpectrum();
  installFetch([scrapeRoute({ ...validFacts, priceMinor: 900 })]);
  const eventId = await insertEvent(t);

  const result = await t.action(internal.firecrawl.processEvent, { eventId });

  expect(result.kind).toBe("observed");
  expect(sentMessages).toHaveLength(0);
  const watch = await t.run((ctx) => ctx.db.get(watchId));
  expect(watch?.status).toBe("active");
});

test("with no cap, notifies a fresh meaningful change without claiming a threshold", async () => {
  const t = setup();
  const watchId = await seedActiveWatch(t, {
    lastPriceMinor: 1_000,
    lastAvailable: true,
  });
  spySpectrum();
  installFetch([scrapeRoute({ ...validFacts, priceMinor: 1_200 })]);
  const eventId = await insertEvent(t);

  const result = await t.action(internal.firecrawl.processEvent, { eventId });

  expect(result.kind).toBe("notified");
  if (result.kind !== "notified") throw new Error("expected notified");
  expect(result.message).toContain("$12.00");
  expect(result.message).not.toContain("Nothing was purchased");
  expect(result.message).not.toContain("Explicit approval");
  expect(result.message.toLowerCase()).not.toContain("cap");
  expect(result.message.toLowerCase()).not.toContain("threshold");

  const watch = await t.run((ctx) => ctx.db.get(watchId));
  expect(watch?.status).toBe("active");
  expect(watch?.isOpen).toBe(true);
  expect(watch?.lastPriceMinor).toBe(1_200);
});

test("with no cap, an unchanged fresh scrape does not notify", async () => {
  const t = setup();
  await seedActiveWatch(t, { lastPriceMinor: 1_000, lastAvailable: true });
  spySpectrum();
  installFetch([scrapeRoute({ ...validFacts, priceMinor: 1_000 })]);
  const eventId = await insertEvent(t);

  const result = await t.action(internal.firecrawl.processEvent, { eventId });

  expect(result.kind).toBe("no_change");
  expect(sentMessages).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Monitor judgment must be explicitly meaningful
// ---------------------------------------------------------------------------

const expectMeaningfulGate = async (isMeaningful: boolean | null) => {
  const t = setup();
  const watchId = await seedActiveWatch(t, {
    capPriceMinor: 500,
    lastPriceMinor: 1_000,
  });
  spySpectrum();
  // A below-cap price that would notify if the event were processed.
  const calls = installFetch([scrapeRoute({ ...validFacts, priceMinor: 400 })]);
  const eventId = await insertEvent(t, { isMeaningful });

  const result = await t.action(internal.firecrawl.processEvent, { eventId });

  expect(result.kind).toBe("no_change");
  expect(calls.filter((call) => call.url.endsWith("/v2/scrape"))).toHaveLength(
    0,
  );
  expect(sentMessages).toHaveLength(0);
  const event = await t.run((ctx) => ctx.db.get(eventId));
  expect(event?.status).toBe("processed");
  const watch = await t.run((ctx) => ctx.db.get(watchId));
  expect(watch?.status).toBe("active");
  expect(watch?.isOpen).toBe(true);
};

test("a non-meaningful event records no_change and never scrapes or notifies", async () => {
  await expectMeaningfulGate(false);
});

test("a missing judgment records no_change and never scrapes or notifies", async () => {
  await expectMeaningfulGate(null);
});

// ---------------------------------------------------------------------------
// Atomic outbox enqueue
// ---------------------------------------------------------------------------

test("the monitor SDK is constructed for exactly one HTTP attempt", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  installFetch([scrapeRoute(validFacts)]);

  await say(t, `watch ${PRODUCT_URL}`);

  // firecrawl@4.41.0 treats maxRetries as an attempt budget (`attempt < maxRetries`),
  // so 0 would issue no HTTP call at all.
  expect(sdkOptions.length).toBeGreaterThan(0);
  expect(sdkOptions.every((options) => options.maxRetries === 1)).toBe(true);
});

test("a rejected outbox enqueue rolls back the event and watch outcome", async () => {
  const t = setup();
  const watchId = await seedActiveWatch(t, {
    capPriceMinor: 500,
    lastPriceMinor: 1_000,
  });
  spySpectrum();
  vi.spyOn(spectrum, "send").mockResolvedValue({
    queued: false,
    reason: "chain-cancelled",
  });
  installFetch([scrapeRoute({ ...validFacts, priceMinor: 400 })]);
  const eventId = await insertEvent(t);

  await expect(
    t.action(internal.firecrawl.processEvent, { eventId }),
  ).rejects.toThrow();

  const event = await t.run((ctx) => ctx.db.get(eventId));
  expect(event?.status).not.toBe("processed");
  const watch = await t.run((ctx) => ctx.db.get(watchId));
  expect(watch?.status).toBe("active");
  expect(watch?.isOpen).toBe(true);
});

// ---------------------------------------------------------------------------
// No purchase path
// ---------------------------------------------------------------------------

test("no spending table or purchase branch exists", () => {
  const tables = Object.keys(schema.tables);
  expect(tables).not.toContain("orders");
  expect(tables).not.toContain("purchases");
  expect(tables).not.toContain("checkouts");
});

// ---------------------------------------------------------------------------
// Token-bound product picker
// ---------------------------------------------------------------------------

const PICK_CANDIDATE = {
  url: PRODUCT_URL,
  title: "Thing",
  priceMinor: 1_000,
  checkoutSupport: "verified" as const,
};

const mintPicker = async (
  t: ReturnType<typeof setup>,
  overrides: {
    token?: string;
    candidates?: (typeof PICK_CANDIDATE & { imageUrl?: string })[];
    expiresAt?: number;
    senderKey?: string;
  } = {},
) => {
  const token = overrides.token ?? "a".repeat(64);
  const tokenHash = await sha256Hex(token);
  const result = await t.mutation(internal.productWatches.mintPickerSession, {
    senderKey: overrides.senderKey ?? ownerKey,
    notifySpaceId: SPACE_ID,
    tokenHash,
    candidates: overrides.candidates ?? [PICK_CANDIDATE],
    expiresAt: overrides.expiresAt ?? Date.now() + 60_000,
    now: Date.now(),
  });
  return { token, tokenHash, result };
};

const postPick = (t: ReturnType<typeof setup>, body: Record<string, unknown>) =>
  t.fetch("/api/pick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("a minted session keeps the product photo for the picker page", async () => {
  const t = setup();
  await seedOwner(t);
  const { token } = await mintPicker(t, {
    candidates: [
      {
        ...PICK_CANDIDATE,
        imageUrl: "https://cdn.example.com/samba.jpg",
      },
      PICK_CANDIDATE,
    ],
  });

  const response = await t.fetch(`/api/pick?t=${token}`);
  const body = await response.json();
  expect(body.candidates[0].imageUrl).toBe("https://cdn.example.com/samba.jpg");
  // A candidate without a photo stays valid, it just has no image.
  expect(body.candidates[1].imageUrl).toBeUndefined();
});

test("the picker token is stored only as a hash and works exactly once", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  installFetch([scrapeRoute(validFacts)]);

  const { token, tokenHash } = await mintPicker(t);
  const stored = await t.run((ctx) => ctx.db.query("pickerSessions").collect());
  expect(stored).toHaveLength(1);
  expect(stored[0].tokenHash).toBe(tokenHash);
  expect(JSON.stringify(stored[0])).not.toContain(token);

  const first = await postPick(t, { token, productUrl: PRODUCT_URL });
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ status: "ok", title: "Thing" });

  const second = await postPick(t, { token, productUrl: PRODUCT_URL });
  expect(second.status).toBe(404);
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(1);
});

test("an expired picker session reads as 404 and cannot submit", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const { token } = await mintPicker(t, { expiresAt: Date.now() - 1_000 });

  expect((await t.fetch(`/api/pick?t=${token}`)).status).toBe(404);

  installFetch([scrapeRoute(validFacts)]);
  expect((await postPick(t, { token, productUrl: PRODUCT_URL })).status).toBe(
    404,
  );
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(0);
});

test("GET /api/pick returns candidates and never leaks member or space identifiers", async () => {
  const t = setup();
  await seedOwner(t);
  const { token, tokenHash } = await mintPicker(t);

  const response = await t.fetch(`/api/pick?t=${token}`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.candidates).toEqual([
    {
      url: PRODUCT_URL,
      title: "Thing",
      priceMinor: 1_000,
      merchantHost: MERCHANT_HOST,
      checkoutSupport: "verified",
    },
  ]);

  const serialized = JSON.stringify(body);
  for (const secret of [
    ownerKey,
    SPACE_ID,
    token,
    tokenHash,
    "memberId",
    "notifySpaceId",
    "tokenHash",
  ]) {
    expect(serialized).not.toContain(secret);
  }
});

const getPickerHtml = (t: ReturnType<typeof setup>, token: string) =>
  t.fetch(`/pick?t=${token}`);

test("GET /pick serves the picker HTML with per-session Open Graph values", async () => {
  const t = setup();
  await seedOwner(t);
  const { token, tokenHash } = await mintPicker(t, {
    candidates: [
      {
        ...PICK_CANDIDATE,
        title: "Samba OG Shoes",
        imageUrl: "https://cdn.example.com/samba.jpg",
      },
      { ...PICK_CANDIDATE, title: "Gazelle Indoor" },
    ],
  });

  const response = await getPickerHtml(t, token);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");

  const html = await response.text();
  expect(html).toContain(
    '<meta property="og:title" content="2 products found" />',
  );
  expect(html).toContain(
    '<meta property="og:description" content="Samba OG Shoes, Gazelle Indoor" />',
  );
  expect(html).toContain(
    '<meta property="og:image" content="https://cdn.example.com/samba.jpg" />',
  );
  expect(html).toContain(
    '<meta property="og:image:alt" content="Samba OG Shoes" />',
  );
  expect(html).toContain(
    '<meta name="twitter:card" content="summary_large_image" />',
  );
  // The page carries the token so it still works if the query is stripped.
  expect(html).toContain(token);
  // Tapping into the size or target-price field must not bubble to the card's
  // toggle and collapse the form the owner is filling in.
  expect(html).toContain('expand.addEventListener("click"');
  expect(html).toContain('expand.addEventListener("keydown"');

  for (const secret of [
    ownerKey,
    SPACE_ID,
    tokenHash,
    "memberId",
    "notifySpaceId",
  ]) {
    expect(html).not.toContain(secret);
  }
});

test("GET /pick falls back to the static preview image without a candidate photo", async () => {
  const t = setup();
  await seedOwner(t);
  const { token } = await mintPicker(t, {
    candidates: [
      { ...PICK_CANDIDATE, imageUrl: "http://cdn.example.com/insecure.jpg" },
    ],
  });

  const html = await (await getPickerHtml(t, token)).text();
  expect(html).toContain(
    '<meta property="og:image" content="https://precious-elk-593.convex.site/og-pick.jpg" />',
  );
  expect(html).not.toContain("http://cdn.example.com/insecure.jpg");
});

test("GET /pick returns 404 with no HTML for invalid, used, and expired tokens", async () => {
  const t = setup();
  await seedOwner(t);

  const missing = await t.fetch("/pick");
  expect(missing.status).toBe(404);
  expect(await missing.text()).toBe("");

  const invalid = await t.fetch("/pick?t=not-a-real-token");
  expect(invalid.status).toBe(404);
  expect(await invalid.text()).toBe("");

  const used = await mintPicker(t, { token: "c".repeat(64) });
  await t.run(async (ctx) => {
    const session = await ctx.db
      .query("pickerSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", used.tokenHash))
      .unique();
    if (session !== null) {
      await ctx.db.patch(session._id, { status: "used", usedAt: Date.now() });
    }
  });
  const usedResponse = await getPickerHtml(t, used.token);
  expect(usedResponse.status).toBe(404);
  expect(await usedResponse.text()).toBe("");

  const expired = await mintPicker(t, {
    token: "d".repeat(64),
    expiresAt: Date.now() - 1_000,
  });
  const expiredResponse = await getPickerHtml(t, expired.token);
  expect(expiredResponse.status).toBe(404);
  expect(await expiredResponse.text()).toBe("");
});

test("a hostile product title cannot break out of the picker OG tags", async () => {
  const t = setup();
  await seedOwner(t);
  const hostile = "'\"><script>alert(1)</script>&";
  const { token } = await mintPicker(t, {
    candidates: [{ ...PICK_CANDIDATE, title: hostile }],
  });

  const response = await getPickerHtml(t, token);
  expect(response.status).toBe(200);
  const html = await response.text();

  expect(html).not.toContain(hostile);
  expect(html).not.toContain("<script>alert(1)");
  expect(html).toContain(
    "&#39;&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;",
  );
});

test("concurrent picker submits create exactly one watch", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  installFetch([scrapeRoute(validFacts), scrapeRoute(validFacts)]);

  const { token } = await mintPicker(t);
  const [a, b] = await Promise.all([
    postPick(t, { token, productUrl: PRODUCT_URL }),
    postPick(t, { token, productUrl: PRODUCT_URL }),
  ]);

  expect([a.status, b.status].sort()).toEqual([200, 404]);
  expect(sdkCreateMonitor).toHaveBeenCalledTimes(1);
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(1);
});

test("a product URL outside the candidate list is rejected", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const { token } = await mintPicker(t);

  const response = await postPick(t, {
    token,
    productUrl: "https://shop.example.com/products/other",
  });
  expect(response.status).toBe(400);
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(0);
  const session = await t.run((ctx) =>
    ctx.db.query("pickerSessions").collect(),
  );
  expect(session[0].status).toBe("open");
});

test("an invalid target price is rejected before any watch is reserved", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const { token } = await mintPicker(t);

  for (const capPriceMinor of [-1, 1.5, 2 ** 53, "100"]) {
    const response = await postPick(t, {
      token,
      productUrl: PRODUCT_URL,
      capPriceMinor,
    });
    expect(response.status).toBe(400);
  }
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(0);
});

test("an optional size is stored as metadata and never affects the price trigger", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  installFetch([scrapeRoute(validFacts)]);
  const { token } = await mintPicker(t);

  const response = await postPick(t, {
    token,
    productUrl: PRODUCT_URL,
    sizeLabel: "  10  ",
    capPriceMinor: 5_000,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ sizeLabel: "10" });

  const watches = await t.run((ctx) =>
    ctx.db.query("productWatches").collect(),
  );
  expect(watches).toHaveLength(1);
  expect(watches[0]).toMatchObject({
    sizeLabel: "10",
    capPriceMinor: 5_000,
    status: "active",
  });
});

test("a failed scrape fails the reserved watch closed", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  installFetch([
    {
      match: (url) => url.endsWith("/v2/scrape"),
      respond: { status: 500, body: {} },
    },
  ]);
  const { token } = await mintPicker(t);

  expect((await postPick(t, { token, productUrl: PRODUCT_URL })).status).toBe(
    502,
  );
  const watches = await t.run((ctx) =>
    ctx.db.query("productWatches").collect(),
  );
  expect(watches).toHaveLength(1);
  expect(watches[0].status).toBe("failed");
  expect(watches[0].isOpen).toBe(false);
  expect(sdkCreateMonitor).not.toHaveBeenCalled();
});

test("minting a new picker session closes the previous open one", async () => {
  const t = setup();
  await seedOwner(t);
  await mintPicker(t, { token: "a".repeat(64) });
  await mintPicker(t, { token: "b".repeat(64) });

  const sessions = await t.run((ctx) =>
    ctx.db.query("pickerSessions").collect(),
  );
  expect(sessions).toHaveLength(2);
  const open = sessions.filter((session) => session.status === "open");
  expect(open).toHaveLength(1);
  expect(open[0].tokenHash).toBe(await sha256Hex("b".repeat(64)));
});

test("a URL-free message replies with the picker link, not an app card", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");

  // The reply travels the text outbox as a plain link, so the owner sees the
  // unfurled preview rather than a card that needs an app extension.
  expect(sentMessages).toHaveLength(1);
  const token = pickerTokenFrom(replies()[0]);

  const sessions = await t.run((ctx) =>
    ctx.db.query("pickerSessions").collect(),
  );
  expect(sessions).toHaveLength(1);
  expect(sessions[0].status).toBe("open");
  expect(await sha256Hex(token)).toBe(sessions[0].tokenHash);
});

test("a URL-free message stays short when the picker cannot be minted", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const realOwnerKey = process.env.OWNER_SENDER_KEY;
  installFetch([
    {
      match: (url) => url.endsWith("/v2/search"),
      respond: async () => {
        // Onboarding's owner check has already passed by the time the search
        // runs. Point the configured owner at someone else so the later
        // mintPickerSession sees an unknown member and refuses to mint.
        process.env.OWNER_SENDER_KEY = "not-the-owner";
        return {
          status: 200,
          body: {
            success: true,
            data: { web: [productEntry("https://a.example/p")] },
          },
        };
      },
    },
    ucpRoute(),
  ]);

  try {
    await say(t, "wireless earbuds");
  } finally {
    process.env.OWNER_SENDER_KEY = realOwnerKey;
  }

  expect(sentMessages).toHaveLength(1);
  const reply = replies()[0];
  expect(reply).toBe(
    "I found options but couldn't build the picks page. Try again in a moment.",
  );
  // There is no numbered fallback list any more.
  expect(reply).not.toContain("1. Samba OG Shoes");
  expect(
    await t.run((ctx) => ctx.db.query("pickerSessions").collect()),
  ).toHaveLength(0);
});

test("a superseded search that finishes last never mints over the newer session", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();

  // Real cancellation semantics: only a chain marked superseded reads as
  // cancelled. The older chain is released after the newer one has already
  // minted, so its slow search resolves out of order.
  const superseded = new Set<string>();
  vi.spyOn(spectrum, "isCancelled").mockImplementation(async (_ctx, args) =>
    superseded.has(args.chainId),
  );

  let releaseOld = () => {};
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let signalOldStarted = () => {};
  const oldStarted = new Promise<void>((resolve) => {
    signalOldStarted = resolve;
  });

  const respondOn = (chainId: string, text: string) =>
    t.action(internal.photon.respond, {
      spaceId: SPACE_ID,
      chainId,
      messages: [
        {
          messageId: `m-${chainId}`,
          senderId: SENDER_ID,
          content: { type: "text", text },
        },
      ],
      carried: [],
    });

  installFetch([
    {
      match: (url) => url.endsWith("/v2/search"),
      respond: async (body) => {
        const query = (body as { query?: string }).query ?? "";
        if (query.startsWith("old")) {
          signalOldStarted();
          await oldGate;
          return {
            status: 200,
            body: {
              success: true,
              data: {
                web: [
                  productEntry("https://old.example/products/old", {
                    title: "Old Product",
                  }),
                ],
              },
            },
          };
        }
        return {
          status: 200,
          body: {
            success: true,
            data: {
              web: [
                productEntry("https://new.example/products/new", {
                  title: "New Product",
                }),
              ],
            },
          },
        };
      },
    },
    ucpRoute(),
  ]);

  const oldTurn = respondOn("chain-old", "old query");
  await oldStarted;
  await respondOn("chain-new", "new query");

  superseded.add("chain-old");
  releaseOld();
  await oldTurn;

  const sessions = await t.run((ctx) =>
    ctx.db.query("pickerSessions").collect(),
  );
  expect(sessions).toHaveLength(1);
  expect(sessions[0].status).toBe("open");
  expect(sessions[0].candidates[0].title).toBe("New Product");
  // Exactly one final reply went out: the newer chain's link. The superseded
  // chain never minted, and the link's token hashes to the surviving session.
  expect(replies()).toHaveLength(1);
  expect(await sha256Hex(pickerTokenFrom(replies()[0]))).toBe(
    sessions[0].tokenHash,
  );
});

// ---------------------------------------------------------------------------
// Conversational shopping turns
// ---------------------------------------------------------------------------

test("a direct URL bypasses the model entirely", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  const calls = installFetch([scrapeRoute(validFacts)]);

  await say(t, `watch ${PRODUCT_URL}`);

  expect(
    calls.some((call) => call.url.startsWith("https://api.openai.com/")),
  ).toBe(false);
});

test("an overlong provider title is truncated before it reaches an iMessage", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  const title = "x".repeat(300);
  installFetch([scrapeRoute({ ...validFacts, title })]);

  await say(t, `watch ${PRODUCT_URL}`);

  const finalReply = replies()[0];
  expect(title).not.toBe(titleForMessage(title));
  expect(finalReply).not.toContain(title);
  expect(finalReply).toContain(titleForMessage(title));
  expect(finalReply).toContain("x".repeat(MAX_MESSAGE_TITLE_LENGTH));
  expect(finalReply).not.toContain("x".repeat(MAX_MESSAGE_TITLE_LENGTH + 1));
});

test("an owner turn types immediately and sends no acknowledgement text — only the real reply", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  sdkCreateMonitor.mockResolvedValue({ id: MONITOR_ID });
  installFetch([scrapeRoute(validFacts)]);

  await say(t, `watch ${PRODUCT_URL}`);

  // No polling, no delay, no "Got it" bubble: typing is enqueued up front,
  // and the one message sent is the chain-bound real answer.
  expect(typingEnqueues).toEqual([{ spaceId: SPACE_ID, chainId: "chain-1" }]);
  expect(sentMessages).toHaveLength(1);
  expect(sentChainIds).toEqual(["chain-1"]);
});

test("a vague request asks one question, saves only a bounded brief, and never searches", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    openAiRoute(
      clarifyPlan("What size?", {
        subject: "a jacket",
        constraints: "warm, black",
        missing: "size",
      }),
    ),
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  const raw = "I need something for winter";
  await say(t, raw);

  expect(replies()).toEqual(["What size?"]);
  expect(calls.some((call) => call.url.endsWith("/v2/search"))).toBe(false);

  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique(),
  );
  expect(member?.pendingClarification).toMatchObject({
    subject: "a jacket",
    constraints: "warm, black",
    missing: "size",
  });
  expect(member?.clarificationRevision).toBeGreaterThan(0);
  expect(JSON.stringify(member)).not.toContain(raw);
});

test("a clarification answer on a new chain merges the prior brief", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const seedRevision = Date.now();
  await t.mutation(internal.members.saveClarification, {
    senderKey: ownerKey,
    revision: seedRevision,
    subject: "a jacket",
    constraints: "warm, black",
    missing: "size",
    now: seedRevision,
  });
  const calls = installFetch([
    openAiRoute(searchPlan("warm black jacket size medium")),
    searchRoute([productEntry("https://a.example/products/jacket")]),
    ucpRoute(),
  ]);

  await say(t, "medium");

  const openAiCall = calls.find((call) =>
    call.url.startsWith("https://api.openai.com/"),
  );
  const userText = JSON.stringify(openAiCall?.body);
  expect(userText).toContain("a jacket");
  expect(userText).toContain("warm, black");
  expect(calls.some((call) => call.url.endsWith("/v2/search"))).toBe(true);

  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique(),
  );
  expect(member?.pendingClarification).toBeUndefined();
});

/**
 * End-to-end feel check for a two-turn clarify → search conversation: the
 * owner should see typing on every turn and exactly one reply per turn —
 * never a repeated "Got it" bubble in between.
 */
test("a full clarify-then-search exchange reads as two typing turns and two replies, nothing more", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  installFetch([
    openAiRoute(
      clarifyPlan("What size?", {
        subject: "a jacket",
        constraints: "warm, black",
        missing: "size",
      }),
    ),
  ]);

  await say(t, "I need a warm black jacket");

  expect(typingEnqueues).toHaveLength(1);
  expect(sentMessages).toEqual(["What size?"]);

  installFetch([
    openAiRoute(searchPlan("warm black jacket size medium")),
    searchRoute([productEntry("https://a.example/products/jacket")]),
    ucpRoute(),
  ]);

  await say(t, "medium");

  // Two owner turns, two typing indicators, two replies total — never an
  // acknowledgement bubble squeezed in between.
  expect(typingEnqueues).toHaveLength(2);
  expect(sentMessages).toHaveLength(2);
  expect(sentMessages[0]).toBe("What size?");
  expect(sentMessages[1]).toContain("I found 1 options:");
});

test("an expired brief is replaced by the new continuation instead of blocking it", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const seeded = 1_000;
  await t.mutation(internal.members.saveClarification, {
    senderKey: ownerKey,
    revision: seeded,
    subject: "a jacket",
    constraints: "warm",
    missing: "size",
    now: seeded,
  });
  installFetch([
    openAiRoute(
      clarifyPlan("What color?", {
        subject: "a coat",
        constraints: "rainproof",
        missing: "style",
      }),
    ),
  ]);

  // The seeded brief expired long ago, so the new clarify must overwrite it
  // with a newer revision rather than being rejected by a pre-clear.
  await say(t, "something for the rain");

  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique(),
  );
  expect(member?.pendingClarification).toMatchObject({
    subject: "a coat",
    constraints: "rainproof",
    missing: "style",
  });
  expect(member?.clarificationRevision).toBeGreaterThan(seeded);
});

test("purchase requests are rejected without searching", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    openAiRoute(unsupportedPlan("purchase")),
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "buy me these shoes");

  expect(replies()).toEqual([
    "I can help find and watch products, but I can't buy them yet.",
  ]);
  expect(calls.some((call) => call.url.endsWith("/v2/search"))).toBe(false);
});

test("unrelated requests are rejected without searching", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    openAiRoute(unsupportedPlan("unrelated")),
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "what's the weather tomorrow");

  expect(replies()).toEqual(["I only help find and watch products."]);
  expect(calls.some((call) => call.url.endsWith("/v2/search"))).toBe(false);
});

test("a malformed model plan becomes one short retry and never searches", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    openAiRoute({
      action: "search",
      query: "shoes",
      question: null,
      continuation: null,
      unsupportedReason: "purchase",
    }),
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");

  expect(replies()).toEqual([
    "I couldn't understand that just now. Try again in a moment.",
  ]);
  expect(calls.some((call) => call.url.endsWith("/v2/search"))).toBe(false);
});

test("a non-2xx model response becomes one short retry", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    {
      match: (url) => url.startsWith("https://api.openai.com/"),
      respond: { status: 500, body: {} },
    },
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");

  expect(replies()).toEqual([
    "I couldn't understand that just now. Try again in a moment.",
  ]);
  expect(calls.some((call) => call.url.endsWith("/v2/search"))).toBe(false);
});

test("the model call aborts on timeout and reports the same short failure", async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal(
      "fetch",
      (_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const pending = callShoppingModel({
      apiKey: "k",
      message: "wireless earbuds",
      prior: null,
    });
    await vi.advanceTimersByTimeAsync(OPENAI_TIMEOUT_MS + 1);
    await expect(pending).resolves.toEqual({ kind: "failed" });
  } finally {
    vi.useRealTimers();
  }
});

test("parseShoppingPlan validates the active branch and ignores safe inactive fields", () => {
  expect(
    parseShoppingPlan({
      action: "search",
      query: "shoes",
      question: null,
      continuation: null,
      unsupportedReason: "none",
    }),
  ).toEqual({ action: "search", query: "shoes" });
  // gpt-5-nano can populate a schema-valid continuation even for `search`.
  // It has no authority on this branch, so ignore it rather than failing a
  // valid query and making the conversation appear broken.
  expect(
    parseShoppingPlan({
      action: "search",
      query: "black Adidas Samba shoes size 10 under $100",
      question: null,
      continuation: {
        subject: "Adidas Samba shoes",
        constraints: "black, size 10, under $100",
        missing: "budget",
      },
      unsupportedReason: "none",
    }),
  ).toEqual({
    action: "search",
    query: "black Adidas Samba shoes size 10 under $100",
  });
  expect(
    parseShoppingPlan({
      action: "search",
      query: "shoes",
      question: null,
      continuation: null,
      unsupportedReason: "none",
      extra: 1,
    }),
  ).toBeNull();
  expect(
    parseShoppingPlan({
      action: "search",
      query: null,
      question: "which?",
      continuation: null,
      unsupportedReason: "none",
    }),
  ).toBeNull();
  expect(
    parseShoppingPlan(
      clarifyPlan("Which size?", {
        subject: "s",
        constraints: "c",
        missing: "nope",
      }),
    ),
  ).toBeNull();
  expect(
    parseShoppingPlan({
      action: "search",
      query: "a\nb",
      question: null,
      continuation: null,
      unsupportedReason: "none",
    }),
  ).toBeNull();
  expect(
    parseShoppingPlan({
      action: "search",
      query: "x".repeat(MAX_QUERY_LENGTH + 1),
      question: null,
      continuation: null,
      unsupportedReason: "none",
    }),
  ).toBeNull();
  expect(
    parseShoppingPlan({
      action: "unsupported",
      query: null,
      question: null,
      continuation: null,
      unsupportedReason: "none",
    }),
  ).toBeNull();
  expect(
    parseShoppingPlan(
      clarifyPlan("What size?", {
        subject: "a jacket",
        constraints: "warm",
        missing: "size",
      }),
    ),
  ).toMatchObject({ action: "clarify", question: "What size?" });
  expect(parseShoppingPlan(unsupportedPlan("purchase"))).toEqual({
    action: "unsupported",
    unsupportedReason: "purchase",
  });
});

test("a malformed clarify question falls back to a safe one instead of failing the whole plan", () => {
  const continuation = {
    subject: "a jacket",
    constraints: "warm",
    missing: "size",
  };
  for (const bad of [
    "What size",
    "What size??",
    "What size? and color?",
    "What size?.",
    "x".repeat(MAX_QUESTION_LENGTH + 1) + "?",
  ]) {
    expect(parseShoppingPlan(clarifyPlan(bad, continuation))).toMatchObject({
      action: "clarify",
      question: FALLBACK_QUESTION.size,
    });
  }
  for (const good of ["What size?", "Which size (S, M, or L)?"]) {
    expect(parseShoppingPlan(clarifyPlan(good, continuation))).toMatchObject({
      action: "clarify",
      question: good,
    });
  }
  // A malformed continuation still fails the whole plan — only the
  // free-text question gets a fallback.
  expect(
    parseShoppingPlan(
      clarifyPlan("What size?", { ...continuation, missing: "not-a-field" }),
    ),
  ).toBeNull();
});

test("parseShoppingPlan enforces the approved state and query bounds", () => {
  const continuation = (overrides: Record<string, unknown>) => ({
    subject: "a jacket",
    constraints: "warm",
    missing: "size",
    ...overrides,
  });
  // Exactly at the bound is accepted; one over is rejected.
  expect(
    parseShoppingPlan(
      clarifyPlan("What size?", continuation({ subject: "s".repeat(MAX_SUBJECT_LENGTH) })),
    ),
  ).not.toBeNull();
  expect(
    parseShoppingPlan(
      clarifyPlan("What size?", continuation({ subject: "s".repeat(MAX_SUBJECT_LENGTH + 1) })),
    ),
  ).toBeNull();
  expect(
    parseShoppingPlan(
      clarifyPlan("What size?", continuation({ constraints: "c".repeat(MAX_CONSTRAINTS_LENGTH) })),
    ),
  ).not.toBeNull();
  expect(
    parseShoppingPlan(
      clarifyPlan("What size?", continuation({ constraints: "c".repeat(MAX_CONSTRAINTS_LENGTH + 1) })),
    ),
  ).toBeNull();
  expect(
    parseShoppingPlan(searchPlan("q".repeat(MAX_QUERY_LENGTH))),
  ).not.toBeNull();
  expect(
    parseShoppingPlan(searchPlan("q".repeat(MAX_QUERY_LENGTH + 1))),
  ).toBeNull();
});

test("a cancellation after the direct scrape stops before reserving a watch", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  let scraped = false;
  vi.spyOn(spectrum, "isCancelled").mockImplementation(async () => scraped);
  installFetch([
    {
      match: (url, body) =>
        url.endsWith("/v2/scrape") && scrapeTarget(body) === PRODUCT_URL,
      respond: () => {
        scraped = true;
        return {
          status: 200,
          body: { success: true, data: { json: validFacts } },
        };
      },
    },
  ]);

  await say(t, `watch ${PRODUCT_URL}`);

  // Cancellation after the scrape stops the turn before any reply is sent.
  expect(sentMessages).toEqual([]);
  expect(
    await t.run((ctx) => ctx.db.query("productWatches").collect()),
  ).toHaveLength(0);
});

test("raw messages and model envelopes are never persisted or logged", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const logSpies = [
    vi.spyOn(console, "log"),
    vi.spyOn(console, "error"),
    vi.spyOn(console, "warn"),
  ];
  installFetch([
    openAiRoute(
      clarifyPlan("What size?", {
        subject: "a jacket",
        constraints: "warm",
        missing: "size",
      }),
    ),
  ]);

  const raw = "I need a secret winter jacket";
  await say(t, raw);

  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique(),
  );
  const serialized = JSON.stringify(member);
  expect(serialized).not.toContain(raw);
  expect(serialized).not.toContain("unsupportedReason");
  expect(serialized).not.toContain('"action"');
  for (const spy of logSpies) {
    const logged = spy.mock.calls
      .flat()
      .some((value) => typeof value === "string" && value.includes(raw));
    expect(logged).toBe(false);
    const leakedKey = spy.mock.calls
      .flat()
      .some(
        (value) =>
          typeof value === "string" && value.includes("openai-test-key"),
      );
    expect(leakedKey).toBe(false);
  }
});

test("the text reply is short, single-line, and free of boilerplate", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");

  const reply = replies()[0];
  expect(reply).not.toContain("\n");
  expect(reply.length).toBeLessThanOrEqual(200);
  expect(reply).not.toContain("Prava");
  expect(reply).not.toContain("Nothing is purchased");
  expect(reply).not.toContain("not localized");
});

test("the sender action delivers through the cloud transport and settles the outbox row", async () => {
  const t = setup();
  cloudDeliver.mockResolvedValue({ ok: true, providerMessageId: "pm-1" });

  const queued = await t.run((ctx) =>
    spectrum.send(ctx, {
      spaceId: SPACE_ID,
      content: { type: "text", text: "hello" },
    }),
  );
  if (queued.clientGuid === undefined) throw new Error("not queued");

  await t.finishAllScheduledFunctions(() => {});

  // The current sender hands the job to the cloud transport and then settles
  // the exact outbox row it was given.
  expect(cloudDeliver).toHaveBeenCalledTimes(1);
  const job = cloudDeliver.mock.calls[0][0] as {
    kind: string;
    clientGuid: string;
  };
  expect(job.kind).toBe("send");
  expect(job.clientGuid).toBe(queued.clientGuid);

  const rows = await t.run((ctx) =>
    spectrum.listOutbox(ctx, { spaceId: SPACE_ID }),
  );
  expect(
    rows.find((row) => row.clientGuid === queued.clientGuid)?.status,
  ).toBe("sent");
});

// ---------------------------------------------------------------------------
// Burst handling, stale-clarification interrupts, and the crash fallback
// ---------------------------------------------------------------------------

test("combineBurst joins carried and messages oldest-first and keeps the latest sender", () => {
  expect(
    combineBurst(
      [textMessage("c-0", "earlier context")],
      [textMessage("m-0", "I need shoes"), textMessage("m-1", "size 10")],
    ),
  ).toEqual({
    senderId: SENDER_ID,
    text: "earlier context\nI need shoes\nsize 10",
  });
});

test("combineBurst drops non-text entries and reports no text when none remain", () => {
  expect(combineBurst([], [{ messageId: "m-0", senderId: SENDER_ID }])).toEqual(
    { senderId: SENDER_ID, text: undefined },
  );
});

test("a two-message burst is not silently truncated to its last line", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await sayBurst(t, ["I need shoes", "size 10, under $100"]);

  const openAiCall = calls.find((call) =>
    call.url.startsWith("https://api.openai.com/"),
  );
  const userText = JSON.stringify(openAiCall?.body);
  expect(userText).toContain("I need shoes");
  expect(userText).toContain("size 10, under $100");
});

test("carried messages from a superseded turn are not discarded once a new burst arrives", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const calls = installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await sayBurst(t, ["under $100"], ["black Adidas Samba"]);

  const openAiCall = calls.find((call) =>
    call.url.startsWith("https://api.openai.com/"),
  );
  const userText = JSON.stringify(openAiCall?.body);
  expect(userText).toContain("black Adidas Samba");
  expect(userText).toContain("under $100");
});

test("a direct-link message clears a stale pending clarification for a different product", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const seedRevision = Date.now();
  await t.mutation(internal.members.saveClarification, {
    senderKey: ownerKey,
    revision: seedRevision,
    subject: "a jacket",
    constraints: "warm, black",
    missing: "size",
    now: seedRevision,
  });
  installFetch([scrapeRoute(validFacts)]);

  await say(t, `watch ${PRODUCT_URL}`);

  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique(),
  );
  expect(member?.pendingClarification).toBeUndefined();

  // The stale brief is gone, so the very next free-text reply starts a fresh
  // turn instead of merging with "a jacket".
  const calls = installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);
  await say(t, "medium");
  const openAiCall = calls.find((call) =>
    call.url.startsWith("https://api.openai.com/"),
  );
  const userText = JSON.stringify(openAiCall?.body);
  expect(userText).not.toContain("a jacket");
});

test("a bare cancel word closes an open clarification without a model call", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();
  const seedRevision = Date.now();
  await t.mutation(internal.members.saveClarification, {
    senderKey: ownerKey,
    revision: seedRevision,
    subject: "a jacket",
    constraints: "warm, black",
    missing: "size",
    now: seedRevision,
  });
  const calls = installFetch([]);

  await say(t, "never mind");

  expect(replies()).toEqual(["No problem — nothing is being watched."]);
  expect(calls.some((call) => call.url.startsWith("https://api.openai.com/"))).toBe(
    false,
  );
  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", ownerKey))
      .unique(),
  );
  expect(member?.pendingClarification).toBeUndefined();
});

test("a non-text message from the owner gets a tailored reply instead of the anonymous default", async () => {
  const t = setup();
  await seedOwner(t);
  spySpectrum();

  await t.action(internal.photon.respond, {
    spaceId: SPACE_ID,
    chainId: "chain-1",
    messages: [{ messageId: "m-1", senderId: SENDER_ID, content: { type: "tapback" } }],
    carried: [],
  });

  expect(sentMessages).toEqual(["I can only read text messages right now."]);
});

test("an unexpected exception still gets the owner a reply instead of a hung chain", async () => {
  const t = setup();
  await seedOwner(t);
  // The 1st send is the branch's real reply, which throws as if the
  // transport failed mid-turn; the fallback in the catch block sends a
  // 2nd message.
  spySpectrum({ failSendAtCount: 1 });
  installFetch([
    searchRoute([productEntry("https://a.example/p")]),
    ucpRoute(),
  ]);

  await say(t, "wireless earbuds");

  expect(sentMessages).toHaveLength(1);
  expect(sentMessages[0]).toContain("went wrong");
  expect(spectrum.completeChain).toHaveBeenCalled();
});
