"use node";

import { createCloudSender } from "@spectrum-ts/convex/sender";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { spectrum } from "./spectrum";

const sender = createCloudSender();

export const deliver = internalAction({
  args: {
    rowId: v.string(),
    spaceId: v.string(),
    phone: v.optional(v.string()),
    clientGuid: v.string(),
    kind: v.string(),
    content: v.optional(v.any()),
    targetMessageId: v.optional(v.string()),
    reaction: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const outcome = await sender.deliver(args);
    await spectrum.settle(ctx, {
      rowId: args.rowId,
      ok: outcome.ok,
      ...(outcome.providerMessageId === undefined
        ? {}
        : { providerMessageId: outcome.providerMessageId }),
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    });
    return null;
  },
});
