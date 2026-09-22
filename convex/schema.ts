import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const onboardingState = v.union(
  v.literal("awaiting_name"),
  v.literal("active_unclaimed"),
  v.literal("active_claimed"),
);

/** Lifecycle of a single product watch. */
export const watchStatus = v.union(
  v.literal("provisioning"),
  v.literal("active"),
  v.literal("triggered"),
  v.literal("cancelled"),
  v.literal("failed"),
  v.literal("cleanup_required"),
);

/** Whether a merchant's UCP profile allows automated checkout. */
export const checkoutSupport = v.union(
  v.literal("verified"),
  v.literal("unsupported"),
  v.literal("needs_verification"),
);

/** The single field a clarification turn is waiting on. */
export const clarificationMissing = v.union(
  v.literal("item"),
  v.literal("recipient"),
  v.literal("style"),
  v.literal("size"),
  v.literal("budget"),
  v.literal("other"),
);

export const pickerStatus = v.union(v.literal("open"), v.literal("used"));

/** One search hit as stored on a picker session. */
export const pickerCandidate = v.object({
  url: v.string(),
  title: v.string(),
  priceMinor: v.number(),
  merchantHost: v.string(),
  checkoutSupport,
  /** Display-only product photo copied from the page. */
  imageUrl: v.optional(v.string()),
});

/** Firecrawl monitor.page result statuses. */
export const pageStatus = v.union(
  v.literal("same"),
  v.literal("new"),
  v.literal("changed"),
  v.literal("removed"),
  v.literal("error"),
);

export const eventType = v.union(v.literal("monitor.page"));

export const eventStatus = v.union(
  v.literal("received"),
  v.literal("processing"),
  v.literal("processed"),
  v.literal("failed"),
);

/** Sanitized, non-secret failure reasons. */
export const failureCode = v.union(
  v.literal("baseline_provider_error"),
  v.literal("baseline_mismatch"),
  v.literal("monitor_create_failed"),
  v.literal("monitor_create_uncertain"),
  v.literal("snapshot_invalid"),
  v.literal("unexpected_identity"),
  v.literal("cleanup_failed"),
  v.literal("provider_unauthorized"),
);

export default defineSchema({
  ...authTables,

  members: defineTable({
    senderKey: v.string(),
    displayName: v.optional(v.string()),
    onboardingState,
    authUserId: v.optional(v.id("users")),
    // Locality settings for URL-free product search. Optional and disclosed
    // before use; no street address, coordinates, or geocoding.
    searchNearMe: v.optional(v.boolean()),
    /** Optional soft radius in integer meters (100-100000); never exact. */
    searchRadiusMeters: v.optional(v.number()),
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    // At most one bounded clarification brief. No chat history, raw message,
    // question, answer, or model output is ever stored here.
    pendingClarification: v.optional(
      v.object({
        subject: v.string(),
        constraints: v.string(),
        missing: clarificationMissing,
        createdAt: v.number(),
        expiresAt: v.number(),
        /** Consecutive clarify turns so far; caps an endless back-and-forth. */
        rounds: v.optional(v.number()),
      }),
    ),
    // Monotonic revision of the latest clarification read/write, so a late
    // superseded action cannot overwrite or clear newer state.
    clarificationRevision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sender_key", ["senderKey"])
    .index("by_auth_user", ["authUserId"]),

  dashboardClaims: defineTable({
    tokenHash: v.string(),
    memberId: v.id("members"),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_member", ["memberId"]),

  productWatches: defineTable({
    memberId: v.id("members"),
    requestKey: v.string(),
    productUrl: v.string(),
    merchantHost: v.string(),
    /** Optional USD trigger cap in integer cents. */
    capPriceMinor: v.optional(v.number()),
    status: watchStatus,
    isOpen: v.boolean(),
    /** Opaque Spectrum route used to notify the owner later. */
    notifySpaceId: v.string(),
    providerMonitorName: v.string(),
    providerMonitorId: v.optional(v.string()),
    cleanupPending: v.optional(v.boolean()),
    cleanupAttemptCount: v.optional(v.number()),
    lastPriceMinor: v.optional(v.number()),
    lastAvailable: v.optional(v.boolean()),
    lastObservedAt: v.optional(v.number()),
    lastNotifiedAt: v.optional(v.number()),
    failureCode: v.optional(failureCode),
    /** Owner-supplied size, metadata only; never part of the price trigger. */
    sizeLabel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_member_id_and_is_open", ["memberId", "isOpen"])
    .index("by_request_key", ["requestKey"])
    .index("by_is_open", ["isOpen"])
    .index("by_cleanup_pending", ["cleanupPending"])
    .index("by_provider_monitor_id", ["providerMonitorId"]),

  pickerSessions: defineTable({
    /** SHA-256 of the single-use picker token; the raw token is never stored. */
    tokenHash: v.string(),
    memberId: v.id("members"),
    notifySpaceId: v.string(),
    candidates: v.array(pickerCandidate),
    status: pickerStatus,
    expiresAt: v.number(),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_member", ["memberId"]),

  firecrawlEvents: defineTable({
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
    status: eventStatus,
    failureCode: v.optional(failureCode),
    observedPriceMinor: v.optional(v.number()),
    observedAvailable: v.optional(v.boolean()),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_domain_key", ["domainKey"])
    .index("by_monitor_id", ["monitorId"]),
});
