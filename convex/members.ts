import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./_generated/server";
import { normalizeDisplayName } from "./crypto";

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

    if (args.text.trim().toLowerCase() === "settings") {
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
    };
  },
});
