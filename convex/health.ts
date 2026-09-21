import { v } from "convex/values";
import { env, query } from "./_generated/server";

export const get = query({
  args: {},
  returns: v.object({ status: v.literal("ok") }),
  handler: () => ({ status: "ok" as const }),
});

/**
 * Public, non-secret landing configuration. Returns the optional server-side
 * `sms:` CTA URL when the invited number is configured, otherwise null. The
 * number is never hard-coded in source.
 */
export const publicConfig = query({
  args: {},
  returns: v.object({ messageUrl: v.union(v.string(), v.null()) }),
  handler: () => ({
    messageUrl: env.MESSAGE_CTA_URL?.startsWith("sms:")
      ? env.MESSAGE_CTA_URL
      : null,
  }),
});
