import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { normalizeDisplayName } from "./crypto";
import { clarificationMissing } from "./schema";
import {
  isSearchRadiusMeters,
  SEARCH_RADIUS_MAX_METERS,
  SEARCH_RADIUS_MIN_METERS,
} from "./searchRadius";

export const CLARIFICATION_TTL_MS = 10 * 60 * 1000;
export const MAX_CLARIFICATION_SUBJECT = 80;
export const MAX_CLARIFICATION_CONSTRAINTS = 160;
/** Consecutive clarify turns allowed before giving up instead of looping. */
export const MAX_CLARIFY_ROUNDS = 3;

const onboardingState = v.union(
  v.literal("awaiting_name"),
  v.literal("active_unclaimed"),
  v.literal("active_claimed"),
);

const onboardOutcome = v.union(
  v.literal("asked_for_name"),
  v.literal("activated"),
  v.literal("settings_link"),
  v.literal("holding"),
);

/** Trim, collapse whitespace, and bound one locality string. */
const cleanLocality = (raw: string | undefined, max: number) => {
  if (raw === undefined) return undefined;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.length === 0 ? undefined : cleaned.slice(0, max);
};

const localityFields = v.object({
  searchNearMe: v.boolean(),
  searchRadiusMeters: v.optional(v.number()),
  city: v.optional(v.string()),
  region: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  countryCode: v.optional(v.string()),
});

/** Reject floats, NaN, unsafe integers, and anything outside 100-100000. */
const cleanSearchRadius = (raw: number | undefined) => {
  if (raw === undefined) return undefined;
  if (!isSearchRadiusMeters(raw)) {
    throw new ConvexError(
      `Search radius must be a whole number of meters from ${SEARCH_RADIUS_MIN_METERS} to ${SEARCH_RADIUS_MAX_METERS}.`,
    );
  }
  return raw;
};

const issueClaim = async (
  ctx: MutationCtx,
  memberId: Id<"members">,
  tokenHash: string,
  expiresAt: number,
  now: number,
) => {
  const priorClaims = await ctx.db
    .query("dashboardClaims")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .collect();
  for (const claim of priorClaims) {
    if (claim.consumedAt === undefined) {
      await ctx.db.patch(claim._id, { consumedAt: now });
    }
  }
  await ctx.db.insert("dashboardClaims", {
    tokenHash,
    memberId,
    expiresAt,
    createdAt: now,
  });
};

/**
 * One deterministic onboarding step. The Spectrum action has already HMAC'd
 * the sender and generated a fresh claim token; this mutation only moves
 * member and claim state inside a single transaction.
 */
export const onboard = internalMutation({
  args: {
    senderKey: v.string(),
    text: v.string(),
    /** Owner turns never hijack "settings" into a dashboard-link resend. */
    isOwner: v.optional(v.boolean()),
    tokenHash: v.string(),
    claimExpiresAt: v.number(),
    now: v.number(),
  },
  returns: onboardOutcome,
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", args.senderKey))
      .unique();

    if (member === null) {
      await ctx.db.insert("members", {
        senderKey: args.senderKey,
        onboardingState: "awaiting_name",
        createdAt: args.now,
        updatedAt: args.now,
      });
      return "asked_for_name";
    }

    if (member.onboardingState === "awaiting_name") {
      const displayName = normalizeDisplayName(args.text);
      if (displayName === null) {
        return "asked_for_name";
      }
      await ctx.db.patch(member._id, {
        displayName,
        onboardingState: "active_unclaimed",
        updatedAt: args.now,
      });
      await issueClaim(
        ctx,
        member._id,
        args.tokenHash,
        args.claimExpiresAt,
        args.now,
      );
      return "activated";
    }

    if (args.text.trim().toLowerCase() === "settings" && args.isOwner !== true) {
      await issueClaim(
        ctx,
        member._id,
        args.tokenHash,
        args.claimExpiresAt,
        args.now,
      );
      return "settings_link";
    }

    return "holding";
  },
});

// ---------------------------------------------------------------------------
// Bounded clarification state (URL-free shopping turns)
// ---------------------------------------------------------------------------

const clarification = v.object({
  subject: v.string(),
  constraints: v.string(),
  missing: clarificationMissing,
  createdAt: v.number(),
  expiresAt: v.number(),
  rounds: v.optional(v.number()),
});

const clarificationState = v.object({
  continuation: v.union(v.null(), clarification),
  revision: v.number(),
  expired: v.boolean(),
});

/** Trim, collapse whitespace, reject line breaks/control chars, bound length. */
const cleanClarificationText = (raw: unknown, max: number) => {
  if (typeof raw !== "string") return null;
  if (raw.length > max) return null;
  if (/[\r\n\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw.replace(/\s+/g, " ").trim();
};

const clarificationOwnerMatches = (senderKey: string) => {
  const ownerKey = env.OWNER_SENDER_KEY;
  return (
    typeof ownerKey === "string" &&
    ownerKey.length > 0 &&
    senderKey === ownerKey
  );
};

/**
 * Read the owner's pending clarification. Expired state is reported as absent
 * with `expired:true` so the caller can clear it; a tombstone revision alone
 * (no pending brief) is not expired.
 */
export const readClarification = internalQuery({
  args: { senderKey: v.string(), now: v.number() },
  returns: clarificationState,
  handler: async (ctx, args) => {
    if (!clarificationOwnerMatches(args.senderKey)) {
      return { continuation: null, revision: 0, expired: false };
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", args.senderKey))
      .unique();
    const revision = member?.clarificationRevision ?? 0;
    const pending = member?.pendingClarification;
    if (member === null || pending === undefined) {
      return { continuation: null, revision, expired: false };
    }
    if (pending.expiresAt <= args.now) {
      return { continuation: null, revision, expired: true };
    }
    return { continuation: pending, revision, expired: false };
  },
});

/**
 * Compare-and-set save. A revision at or below the stored one is a late,
 * superseded write and is refused rather than allowed to overwrite newer state.
 */
export const saveClarification = internalMutation({
  args: {
    senderKey: v.string(),
    revision: v.number(),
    subject: v.string(),
    constraints: v.string(),
    missing: clarificationMissing,
    now: v.number(),
  },
  returns: v.object({ saved: v.boolean(), capped: v.optional(v.boolean()) }),
  handler: async (ctx, args) => {
    if (!clarificationOwnerMatches(args.senderKey)) return { saved: false };
    const subject = cleanClarificationText(
      args.subject,
      MAX_CLARIFICATION_SUBJECT,
    );
    const constraints = cleanClarificationText(
      args.constraints,
      MAX_CLARIFICATION_CONSTRAINTS,
    );
    if (subject === null || constraints === null) return { saved: false };
    const member = await ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", args.senderKey))
      .unique();
    if (member === null) return { saved: false };
    if (args.revision <= (member.clarificationRevision ?? 0)) {
      return { saved: false };
    }

    const rounds = (member.pendingClarification?.rounds ?? 0) + 1;
    if (rounds > MAX_CLARIFY_ROUNDS) {
      // Give up instead of clarifying forever; clear the stale brief too.
      await ctx.db.patch(member._id, {
        pendingClarification: undefined,
        clarificationRevision: args.revision,
        updatedAt: args.now,
      });
      return { saved: false, capped: true };
    }

    await ctx.db.patch(member._id, {
      pendingClarification: {
        subject,
        constraints,
        missing: args.missing,
        createdAt: args.now,
        expiresAt: args.now + CLARIFICATION_TTL_MS,
        rounds,
      },
      clarificationRevision: args.revision,
      updatedAt: args.now,
    });
    return { saved: true };
  },
});

/**
 * Compare-and-set clear of the exact consumed revision. The clear advances the
 * revision to the current turn's, so an older in-flight save cannot land after.
 */
export const clearClarification = internalMutation({
  args: {
    senderKey: v.string(),
    expectedRevision: v.number(),
    revision: v.number(),
    now: v.number(),
  },
  returns: v.object({ cleared: v.boolean() }),
  handler: async (ctx, args) => {
    if (!clarificationOwnerMatches(args.senderKey)) return { cleared: false };
    const member = await ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", args.senderKey))
      .unique();
    if (member === null) return { cleared: false };
    const current = member.clarificationRevision ?? 0;
    if (args.expectedRevision !== current) return { cleared: false };
    await ctx.db.patch(member._id, {
      pendingClarification: undefined,
      clarificationRevision:
        args.revision > current ? args.revision : current + 1,
      updatedAt: args.now,
    });
    return { cleared: true };
  },
});

/** Read-only validation used by the auth provider before creating a session. */
export const claimForToken = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      memberId: v.id("members"),
      displayName: v.optional(v.string()),
      authUserId: v.optional(v.id("users")),
    }),
  ),
  handler: async (ctx, args) => {
    const claim = await ctx.db
      .query("dashboardClaims")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      claim === null ||
      claim.consumedAt !== undefined ||
      claim.expiresAt <= args.now
    ) {
      return null;
    }
    const member = await ctx.db.get(claim.memberId);
    if (member === null) {
      return null;
    }
    return {
      memberId: member._id,
      displayName: member.displayName,
      authUserId: member.authUserId,
    };
  },
});

/** Atomically consume a claim and link its member to the auth user. */
export const consumeClaim = internalMutation({
  args: {
    tokenHash: v.string(),
    authUserId: v.id("users"),
    now: v.number(),
  },
  returns: v.object({ memberId: v.id("members") }),
  handler: async (ctx, args) => {
    const claim = await ctx.db
      .query("dashboardClaims")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      claim === null ||
      claim.consumedAt !== undefined ||
      claim.expiresAt <= args.now
    ) {
      throw new ConvexError("This settings link is invalid or has expired.");
    }
    const member = await ctx.db.get(claim.memberId);
    if (
      member === null ||
      (member.authUserId !== undefined && member.authUserId !== args.authUserId)
    ) {
      throw new ConvexError("This settings link cannot be claimed.");
    }
    await ctx.db.patch(claim._id, { consumedAt: args.now });
    await ctx.db.patch(member._id, {
      authUserId: args.authUserId,
      onboardingState: "active_claimed",
      updatedAt: args.now,
    });
    return { memberId: claim.memberId };
  },
});

/** Authenticated dashboard profile. The member is derived from the auth user. */
export const profile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      displayName: v.optional(v.string()),
      onboardingState,
      iMessageConnected: v.boolean(),
      locality: localityFields,
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", userId))
      .unique();
    if (member === null) {
      return null;
    }
    return {
      displayName: member.displayName,
      onboardingState: member.onboardingState,
      iMessageConnected: true,
      locality: {
        searchNearMe: member.searchNearMe ?? false,
        searchRadiusMeters: member.searchRadiusMeters,
        city: member.city,
        region: member.region,
        postalCode: member.postalCode,
        countryCode: member.countryCode,
      },
    };
  },
});

/**
 * Owner locality settings for URL-free search. Backend-only surface; the
 * dashboard form is the smallest existing-form addition. No street address,
 * coordinates, or geocoding.
 */
export const updateLocality = mutation({
  args: {
    searchNearMe: v.boolean(),
    searchRadiusMeters: v.optional(v.number()),
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    countryCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("Sign in required.");
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", userId))
      .unique();
    if (member === null) {
      throw new ConvexError("No profile linked to this account.");
    }
    await ctx.db.patch(member._id, {
      searchNearMe: args.searchNearMe,
      searchRadiusMeters: cleanSearchRadius(args.searchRadiusMeters),
      city: cleanLocality(args.city, 80),
      region: cleanLocality(args.region, 80),
      postalCode: cleanLocality(args.postalCode, 20),
      countryCode: cleanLocality(args.countryCode, 2)?.toUpperCase(),
      updatedAt: Date.now(),
    });
    return null;
  },
});
