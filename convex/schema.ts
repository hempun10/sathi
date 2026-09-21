import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const onboardingState = v.union(
  v.literal("awaiting_name"),
  v.literal("active_unclaimed"),
  v.literal("active_claimed"),
);

export default defineSchema({
  ...authTables,

  members: defineTable({
    senderKey: v.string(),
    displayName: v.optional(v.string()),
    onboardingState,
    authUserId: v.optional(v.id("users")),
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
});
