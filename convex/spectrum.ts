import { Spectrum } from "@spectrum-ts/convex";
import { createFunctionHandle } from "convex/server";
import { components, internal } from "./_generated/api";
import { type ActionCtx } from "./_generated/server";

export const spectrum: Spectrum = new Spectrum(components.spectrum, {
  onBatch: internal.photon.respond,
  sender: internal.sender.deliver,
  mode: "collapse",
  debounceMs: 500,
  pacingMs: 800,
});

/**
 * One-shot typing indicator. The public Spectrum client has no typing method,
 * so this reaches the component's outbox directly with the same chain and the
 * same app sender handle a text send uses. It starts typing once and does not
 * pretend to stop it or heartbeat.
 */
export const enqueueTyping = async (
  ctx: ActionCtx,
  args: { spaceId: string; chainId: string },
) => {
  const sender = await createFunctionHandle(internal.sender.deliver);
  return await ctx.runMutation(components.spectrum.outbox.enqueue, {
    spaceId: args.spaceId,
    chainId: args.chainId,
    kind: "typing",
    sender,
  });
};

/**
 * Indirection so tests can observe the typing enqueue without a live component
 * chain. Production always resolves to {@link enqueueTyping}.
 */
export const typingEnqueuer = {
  enqueue: (ctx: ActionCtx, args: { spaceId: string; chainId: string }) =>
    enqueueTyping(ctx, args),
};
