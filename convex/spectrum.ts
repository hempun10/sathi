import { Spectrum } from "@spectrum-ts/convex";
import { createFunctionHandle } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";

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

/** Roughly 5.5 seconds of scheduled polling at 250ms per attempt. */
const ACK_POLL_ATTEMPTS = 22;
const ACK_POLL_INTERVAL_MS = 250;

/**
 * Durable follow-up to one owner turn's acknowledgement. It is scheduled
 * alongside the owner flow and never blocks it. It polls the component outbox
 * by status for the exact acknowledgement row and enqueues the one-shot
 * chain-bound typing indicator only after that row is sent. A failed,
 * cancelled, superseded, or already-answered chain never types. The bound is
 * established by the scheduler and the row's own status, not a blind sleep.
 */
export const typeAfterAck = internalAction({
  args: {
    spaceId: v.string(),
    chainId: v.string(),
    ackClientGuid: v.string(),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 0;
    if (
      await spectrum.isCancelled(ctx, {
        spaceId: args.spaceId,
        chainId: args.chainId,
      })
    ) {
      return null;
    }

    const rows = await spectrum.listOutbox(ctx, {
      spaceId: args.spaceId,
      limit: 30,
    });
    const ack = rows.find((row) => row.clientGuid === args.ackClientGuid);
    if (ack !== undefined) {
      if (ack.status === "cancelled" || ack.status === "failed") return null;
      if (ack.status === "sent") {
        // A sent row whose guid is prefixed with this chain is this turn's own
        // reply, so the answer is already out and typing would arrive behind
        // it. The chain-less ack and other turns' rows never match the prefix.
        const answered = rows.some(
          (row) =>
            (row.kind === "send" || row.kind === "reply") &&
            row.status === "sent" &&
            row.clientGuid.startsWith(`${args.chainId}#`),
        );
        if (answered) return null;
        await typingEnqueuer.enqueue(ctx, {
          spaceId: args.spaceId,
          chainId: args.chainId,
        });
        return null;
      }
    }

    if (attempt >= ACK_POLL_ATTEMPTS) return null;
    await ctx.scheduler.runAfter(
      ACK_POLL_INTERVAL_MS,
      internal.spectrum.typeAfterAck,
      { ...args, attempt: attempt + 1 },
    );
    return null;
  },
});
