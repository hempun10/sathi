"use node";

import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import Firecrawl from "firecrawl";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import {
  PRODUCT_JSON_SCHEMA,
  SEARCH_PRODUCT_JSON_SCHEMA,
  type CheckoutSupport,
  evaluateCheckoutSupport,
  normalizeProductFacts,
  parseProductSearchResults,
  titleForMessage,
} from "./productWatches";
import { checkoutSupport } from "./schema";
import { isSearchRadiusMeters, searchRadiusHint } from "./searchRadius";

const firecrawl = new FirecrawlClient(components.firecrawl);

const WEBHOOK_PATH = "/api/webhooks/firecrawl";
const MONITOR_SCHEDULE_TEXT = "every 30 minutes";
const MONITOR_RETENTION_DAYS = 7;
const CLEANUP_RETRY_DELAY_MS = 30_000;

const formatUsd = (minor: number) => `$${(minor / 100).toFixed(2)}`;

const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

// ---------------------------------------------------------------------------
// Search and scrape via the official Convex component
// ---------------------------------------------------------------------------

const searchOptions = (locality: {
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
}) => {
  const location = [locality.city, locality.region, locality.postalCode]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(", ");
  // Live search placed the first product pages at ranks 9 and 10 after eight
  // category and social results, so six results made valid requests look empty.
  const options: Record<string, unknown> = { limit: 10 };
  if (location.length > 0) options.location = location;
  if (typeof locality.countryCode === "string" && locality.countryCode.length > 0) {
    options.extra = { country: locality.countryCode };
  }
  options.scrapeOptions = {
    formats: [{ type: "json", schema: SEARCH_PRODUCT_JSON_SCHEMA }],
    maxAge: 0,
  };
  return options;
};

const searchResult = v.union(
  v.object({
    kind: v.literal("ok"),
    products: v.array(
      v.object({
        url: v.string(),
        title: v.string(),
        priceMinor: v.number(),
        checkoutSupport,
        imageUrl: v.optional(v.string()),
      }),
    ),
  }),
  v.object({ kind: v.literal("failed") }),
);

// One modest cache window keeps repeat searches from re-spending credits on
// the same merchant profile.
const UCP_CACHE_MAX_AGE_MS = 60 * 60 * 1_000;

/**
 * Scrape a merchant's well-known UCP profile once and classify it. Only the
 * fixed well-known URL is fetched; no endpoint named by the profile is ever
 * followed, and neither the profile nor its raw body is stored.
 */
const checkoutSupportForHost = async (
  ctx: ActionCtx,
  host: string,
): Promise<CheckoutSupport> => {
  const expectedUrl = `https://${host}/.well-known/ucp`;
  let document: Awaited<ReturnType<typeof firecrawl.scrape>>;
  try {
    document = await firecrawl.scrape(ctx, expectedUrl, {
      formats: ["rawHtml"],
      maxAge: UCP_CACHE_MAX_AGE_MS,
    });
  } catch {
    // Timeout, network failure, or a 5xx after the component's retries.
    return "needs_verification";
  }
  // The final metadata URL proves the profile arrived at the expected
  // well-known path instead of a redirect to a different host.
  return evaluateCheckoutSupport(
    document.metadata?.statusCode,
    document.rawHtml,
    document.metadata?.url,
    expectedUrl,
  );
};

/**
 * One URL-free owner message: search the web and return up to four unique
 * in-stock USD products, optionally under a cap, each labeled with discovery
 * evidence of Prava auto-checkout support. Nothing is persisted; the owner
 * must send one URL back. Provider output never authorizes spending.
 */
export const searchProducts = internalAction({
  args: {
    query: v.string(),
    searchNearMe: v.boolean(),
    searchRadiusMeters: v.optional(v.number()),
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    maxPriceMinor: v.optional(v.number()),
  },
  returns: searchResult,
  handler: async (ctx, args) => {
    const locality = args.searchNearMe
      ? {
          city: args.city,
          region: args.region,
          postalCode: args.postalCode,
          countryCode: args.countryCode,
        }
      : {};
    // Firecrawl has no exact radius filter, so a valid radius only appends an
    // approximate phrase to the query. Location and country options are
    // unchanged.
    const radius =
      args.searchNearMe && isSearchRadiusMeters(args.searchRadiusMeters)
        ? searchRadiusHint(args.searchRadiusMeters)
        : undefined;
    const query = [args.query, "individual product page", radius]
      .filter((part): part is string => part !== undefined)
      .join(" ");
    try {
      const result = await firecrawl.search(ctx, query, searchOptions(locality));
      const products = parseProductSearchResults(result, args.maxPriceMinor);
      // Validate candidates first, then scrape each unique merchant host once.
      const supportByHost = new Map<string, CheckoutSupport>();
      for (const product of products) {
        if (supportByHost.has(product.merchantHost)) continue;
        supportByHost.set(
          product.merchantHost,
          await checkoutSupportForHost(ctx, product.merchantHost),
        );
      }
      return {
        kind: "ok" as const,
        products: products.map((product) => ({
          url: product.url,
          title: product.title,
          priceMinor: product.priceMinor,
          checkoutSupport:
            supportByHost.get(product.merchantHost) ?? "needs_verification",
          ...(product.imageUrl === undefined
            ? {}
            : { imageUrl: product.imageUrl }),
        })),
      };
    } catch {
      return { kind: "failed" as const };
    }
  },
});

const scrapeResult = v.union(
  v.object({
    kind: v.literal("ok"),
    title: v.string(),
    priceMinor: v.number(),
    currency: v.string(),
    available: v.boolean(),
  }),
  v.object({ kind: v.literal("failed") }),
);

/** Scrape one exact URL and validate normalized product facts. */
export const scrapeProduct = internalAction({
  args: { productUrl: v.string() },
  returns: scrapeResult,
  handler: async (ctx, args) => {
    let document: Awaited<ReturnType<typeof firecrawl.scrape>>;
    try {
      document = await firecrawl.scrape(ctx, args.productUrl, {
        formats: [{ type: "json", schema: PRODUCT_JSON_SCHEMA }],
        maxAge: 0,
      });
    } catch {
      return { kind: "failed" as const };
    }
    const facts = normalizeProductFacts(document.json, args.productUrl);
    if (facts === null || facts.currency !== "USD") {
      return { kind: "failed" as const };
    }
    return {
      kind: "ok" as const,
      title: facts.title,
      priceMinor: facts.priceMinor,
      currency: facts.currency,
      available: facts.available,
    };
  },
});

// ---------------------------------------------------------------------------
// Monitor creation via the official Node SDK
// ---------------------------------------------------------------------------

const createMonitorResult = v.union(
  v.literal("activated"),
  v.literal("failed"),
);

/**
 * Create one Firecrawl monitor for a reserved watch, then activate it. The
 * webhook is bearer-authenticated; the monitor is never re-created after a
 * lost response.
 */
export const createMonitorForWatch = internalAction({
  args: {
    watchId: v.id("productWatches"),
    priceMinor: v.number(),
    available: v.boolean(),
  },
  returns: createMonitorResult,
  handler: async (ctx, args) => {
    const watch = await ctx.runQuery(internal.productWatches.getWatch, {
      watchId: args.watchId,
    });
    if (watch === null || watch.status !== "provisioning") {
      return "failed" as const;
    }

    const token = env.FIRECRAWL_MONITOR_WEBHOOK_TOKEN;
    if (typeof token !== "string" || token.length === 0) {
      await ctx.runMutation(internal.productWatches.failWatch, {
        watchId: args.watchId,
        failureCode: "provider_unauthorized",
        now: Date.now(),
      });
      return "failed" as const;
    }

    const siteUrl = env.CONVEX_SITE_URL.replace(/\/$/, "");
    let monitor: Awaited<ReturnType<Firecrawl["createMonitor"]>>;
    try {
      monitor = await new Firecrawl({
        apiKey: env.FIRECRAWL_API_KEY,
        // firecrawl@4.41.0 loops `attempt < maxRetries`, so 0 makes no HTTP
        // call at all. One retry budget means exactly one attempt.
        maxRetries: 1,
      }).createMonitor({
        name: watch.providerMonitorName,
        schedule: { text: MONITOR_SCHEDULE_TEXT, timezone: "UTC" },
        targets: [
          {
            type: "scrape",
            urls: [watch.productUrl],
            scrapeOptions: { formats: ["markdown"], maxAge: 0 },
          },
        ],
        webhook: {
          url: `${siteUrl}${WEBHOOK_PATH}`,
          events: ["monitor.page"],
          headers: { Authorization: `Bearer ${token}` },
        },
        retentionDays: MONITOR_RETENTION_DAYS,
        goal: `Alert when the item price or availability for ${watch.productUrl} changes meaningfully.`,
        judgeEnabled: true,
      });
    } catch {
      // A lost create outcome is never retried automatically.
      await ctx.runMutation(internal.productWatches.failWatch, {
        watchId: args.watchId,
        failureCode: "monitor_create_uncertain",
        now: Date.now(),
      });
      return "failed" as const;
    }

    if (typeof monitor.id !== "string" || monitor.id.length === 0) {
      await ctx.runMutation(internal.productWatches.failWatch, {
        watchId: args.watchId,
        failureCode: "monitor_create_failed",
        now: Date.now(),
      });
      return "failed" as const;
    }

    const activated = await ctx.runMutation(
      internal.productWatches.activateWatch,
      {
        watchId: args.watchId,
        providerMonitorId: monitor.id,
        priceMinor: args.priceMinor,
        available: args.available,
        now: Date.now(),
      },
    );
    if (activated !== "activated") {
      await deleteMonitorQuietly(monitor.id);
      return "failed" as const;
    }
    return "activated" as const;
  },
});

const deleteMonitorQuietly = async (monitorId: string) => {
  try {
    await new Firecrawl({
      apiKey: env.FIRECRAWL_API_KEY,
      // See createMonitorForWatch: maxRetries is an attempt budget here.
      maxRetries: 1,
    }).deleteMonitor(monitorId);
    return true;
  } catch {
    return false;
  }
};

/** Delete a provider monitor. A missing monitor counts as already gone. */
export const cleanupWatch = internalAction({
  args: { watchId: v.id("productWatches") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const watch = await ctx.runQuery(internal.productWatches.getWatch, {
      watchId: args.watchId,
    });
    if (watch === null) return null;
    const monitorId = watch.providerMonitorId;
    if (monitorId === undefined) {
      await ctx.runMutation(internal.productWatches.completeCleanup, {
        watchId: args.watchId,
        now: Date.now(),
      });
      return null;
    }
    const deleted = await deleteMonitorQuietly(monitorId);
    if (deleted) {
      await ctx.runMutation(internal.productWatches.completeCleanup, {
        watchId: args.watchId,
        now: Date.now(),
      });
      return null;
    }
    const result = await ctx.runMutation(
      internal.productWatches.recordCleanupFailure,
      { watchId: args.watchId, now: Date.now() },
    );
    if (result.retry) {
      await ctx.scheduler.runAfter(
        CLEANUP_RETRY_DELAY_MS,
        internal.firecrawl.cleanupWatch,
        { watchId: args.watchId },
      );
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Monitor webhook processing: fresh re-scrape before any price statement
// ---------------------------------------------------------------------------

const processResult = v.union(
  v.object({ kind: v.literal("ignored") }),
  v.object({ kind: v.literal("no_change") }),
  v.object({ kind: v.literal("observed") }),
  v.object({ kind: v.literal("notified"), message: v.string() }),
  v.object({ kind: v.literal("failed") }),
);

/**
 * A `changed` and meaningful `monitor.page` event is only a signal. This action
 * freshly scrapes the exact stored URL before making any price or availability
 * statement. Provider output never authorizes spending.
 */
export const processEvent = internalAction({
  args: { eventId: v.id("firecrawlEvents") },
  returns: processResult,
  handler: async (ctx, args): Promise<
    | { kind: "ignored" }
    | { kind: "no_change" }
    | { kind: "observed" }
    | { kind: "notified"; message: string }
    | { kind: "failed" }
  > => {
    const now = Date.now();
    const begin = await ctx.runMutation(internal.productWatches.beginEvent, {
      eventId: args.eventId,
      now,
    });
    if (begin === null) return { kind: "ignored" as const };

    const finish = (
      kind: "no_change" | "observed" | "failed",
      extra: {
        observed?: { priceMinor: number; available: boolean };
        notificationText?: string;
        shouldTrigger?: boolean;
        failureCode?:
          | "baseline_provider_error"
          | "baseline_mismatch"
          | "snapshot_invalid"
          | "unexpected_identity";
      } = {},
    ) =>
      ctx.runMutation(internal.productWatches.recordEventOutcome, {
        eventId: args.eventId,
        checkId: begin.checkId,
        kind,
        observed: extra.observed,
        notificationText: extra.notificationText,
        shouldTrigger: extra.shouldTrigger ?? false,
        failureCode: extra.failureCode,
        now: Date.now(),
      });

    if (begin.watchStatus !== "active") {
      await finish("no_change");
      return { kind: "no_change" as const };
    }
    if (begin.pageStatus !== "changed") {
      await finish("no_change");
      return { kind: "no_change" as const };
    }
    // Monitor judgment must be explicitly meaningful. Missing or false is a
    // no-op: never scrape, never notify, never spend.
    if (begin.isMeaningful !== true) {
      await finish("no_change");
      return { kind: "no_change" as const };
    }

    let document: Awaited<ReturnType<typeof firecrawl.scrape>>;
    try {
      document = await firecrawl.scrape(ctx, begin.productUrl, {
        formats: [{ type: "json", schema: PRODUCT_JSON_SCHEMA }],
        maxAge: 0,
      });
    } catch {
      await finish("failed", { failureCode: "baseline_provider_error" });
      return { kind: "failed" as const };
    }

    const facts = normalizeProductFacts(document.json, begin.productUrl);
    if (facts === null || facts.currency !== "USD") {
      await finish("failed", { failureCode: "snapshot_invalid" });
      return { kind: "failed" as const };
    }

    const observed = {
      priceMinor: facts.priceMinor,
      available: facts.available,
    };

    if (begin.capPriceMinor !== undefined) {
      const meetsCap = facts.available && facts.priceMinor <= begin.capPriceMinor;
      if (!meetsCap) {
        // A cap only notifies at or below the cap.
        await finish("observed", { observed });
        return { kind: "observed" as const };
      }
      const message =
        `${titleForMessage(facts.title)} is now ${formatUsd(facts.priceMinor)} ` +
        `(your cap: ${formatUsd(begin.capPriceMinor)}).`;
      // Enqueue travels inside the recordEventOutcome transaction, so a
      // rejected message rolls back the trigger and the event processed mark.
      await finish("observed", {
        observed,
        notificationText: message,
        shouldTrigger: true,
      });
      return { kind: "notified" as const, message };
    }

    const changed =
      begin.lastPriceMinor === undefined ||
      facts.priceMinor !== begin.lastPriceMinor ||
      facts.available !== begin.lastAvailable;
    if (!changed) {
      await finish("observed", { observed });
      return { kind: "no_change" as const };
    }

    const availability = facts.available ? "in stock" : "out of stock";
    const message =
      `${titleForMessage(facts.title)} changed: now ${formatUsd(facts.priceMinor)} ` +
      `and ${availability}.`;
    await finish("observed", { observed, notificationText: message });
    return { kind: "notified" as const, message };
  },
});
