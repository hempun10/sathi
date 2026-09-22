"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import {
  CLAIM_TTL_MS,
  hashClaimToken,
  hmacSenderKey,
  newClaimToken,
} from "./crypto";
import {
  parseCapText,
  parseProductUrl,
  parseWatchMessage,
  titleForMessage,
} from "./productWatches";
import { callShoppingModel } from "./shopping";
import * as spectrumModule from "./spectrum";

const spectrum = spectrumModule.spectrum;
const typingEnqueuer = spectrumModule.typingEnqueuer;

const HELP =
  "I can watch a product and tell you when its price or availability changes. Text me your name to get set up.";

const SETUP_FAILURE =
  "I couldn't set up that watch. Nothing is watching the product right now.";
const CONFLICT =
  "Another watch just finished setting up or clearing out. Try again in a moment.";
const ACCOUNT_MISMATCH = "I couldn't match that watch to your account.";
const SEARCH_FAILURE = "I couldn't search right now. Try again in a moment.";
const NO_RESULTS =
  "I couldn't find anything for that. Try a more specific description.";
const PICKER_FAILURE =
  "I found options but couldn't build the picks page. Try again in a moment.";
const INVALID_URL =
  "That isn't a public HTTPS product link I can watch. Nothing was set up.";
const MODEL_FAILURE =
  "I couldn't understand that just now. Try again in a moment.";
const PURCHASE_REPLY =
  "I can help find and watch products, but I can't buy them yet.";
const UNRELATED_REPLY = "I only help find and watch products.";
const ALREADY_WATCHING = "You're already watching that product.";
const UNEXPECTED_FAILURE =
  "Something went wrong on my end. Nothing was set up — try again in a moment.";
const CLARIFY_CANCELLED = "No problem — nothing is being watched.";
const CLARIFY_GIVE_UP =
  "I still don't have enough to search for that. Try again with a fuller description.";
const TEXT_ONLY = "I can only read text messages right now.";
const CANCEL_WORDS = new Set([
  "cancel",
  "never mind",
  "nevermind",
  "stop",
  "reset",
]);

const parseInbound = (value: unknown) => {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const senderId =
    typeof record.senderId === "string" ? record.senderId : undefined;

  let text: string | undefined;
  const content = record.content;
  if (typeof content === "object" && content !== null) {
    const fields = content as Record<string, unknown>;
    if (fields.type === "text" && typeof fields.text === "string") {
      text = fields.text;
    }
  }

  return { senderId, text };
};

/**
 * Collapse one whole batch — `carried` (an earlier, superseded turn's
 * messages, oldest first) followed by `messages` (this burst, oldest first)
 * — into a single logical turn instead of reading only the last message.
 * Collapse mode exists so a quick multi-text burst reads as one turn; reading
 * only `messages.at(-1)` silently drops every earlier line (and all of
 * `carried`, which is otherwise unreachable whenever the new burst is
 * non-empty). Every text-bearing entry is joined in order, and the sender is
 * taken from the most recent entry that has one.
 */
export const combineBurst = (carried: unknown[], messages: unknown[]) => {
  let senderId: string | undefined;
  const lines: string[] = [];
  for (const item of [...carried, ...messages]) {
    const parsed = parseInbound(item);
    if (parsed.senderId !== undefined) senderId = parsed.senderId;
    if (parsed.text !== undefined && parsed.text.length > 0) {
      lines.push(parsed.text);
    }
  }
  return {
    senderId,
    text: lines.length === 0 ? undefined : lines.join("\n"),
  };
};

const claimLink = (siteUrl: string | undefined, token: string) =>
  siteUrl === undefined
    ? undefined
    : `${siteUrl.replace(/\/$/, "")}/claim?token=${token}`;

const replyText = (outcome: string, link: string | undefined) => {
  if (outcome === "asked_for_name") {
    return "What should I call you?";
  }
  return link === undefined
    ? "You're set up. Your settings link is still being configured."
    : `Here is your private settings link. It works once and expires in 15 minutes: ${link}`;
};

const formatUsd = (minor: number) => `$${(minor / 100).toFixed(2)}`;

type Locality = {
  searchNearMe?: boolean;
  searchRadiusMeters?: number;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
};

const sendReply = async (
  ctx: ActionCtx,
  args: { spaceId: string; chainId: string },
  text: string,
) => {
  await spectrum.send(ctx, {
    spaceId: args.spaceId,
    chainId: args.chainId,
    content: { type: "text", text },
  });
};

const directWatchReply = (
  title: string,
  priceMinor: number,
  capPriceMinor: number | undefined,
) => {
  const when =
    capPriceMinor === undefined
      ? "I'll message you when the price or availability changes."
      : `I'll message you when it's in stock at ${formatUsd(capPriceMinor)} or less.`;
  return `Done — I'm watching ${titleForMessage(title)} at ${formatUsd(priceMinor)}. ${when}`;
};

/**
 * Direct-link path. A valid HTTPS product URL skips the model entirely and
 * reuses the trusted scrape → reserve → monitor chain. The acknowledgement and
 * typing indicator were already sent by the caller.
 */
const handleDirectUrl = async (
  ctx: ActionCtx,
  args: { spaceId: string; chainId: string },
  senderKey: string,
  rawUrl: string,
  capPriceMinor: number | undefined,
) => {
  const parsed = parseProductUrl(rawUrl);
  if (parsed === null) {
    await sendReply(ctx, args, INVALID_URL);
    await spectrum.completeChain(ctx, args);
    return;
  }
  if (await spectrum.isCancelled(ctx, args)) return;

  // A direct link is a fresh, unambiguous intent. Drop any pending
  // URL-free clarification so a later unrelated reply (still within its TTL)
  // can never be silently merged with a brief about a different product.
  const now = Date.now();
  const state = await ctx.runQuery(internal.members.readClarification, {
    senderKey,
    now,
  });
  if (state.continuation !== null) {
    await ctx.runMutation(internal.members.clearClarification, {
      senderKey,
      expectedRevision: state.revision,
      revision: now,
      now,
    });
  }
  if (await spectrum.isCancelled(ctx, args)) return;

  const scraped = await ctx.runAction(internal.firecrawl.scrapeProduct, {
    productUrl: parsed.productUrl,
  });
  if (await spectrum.isCancelled(ctx, args)) return;
  if (scraped.kind !== "ok") {
    await sendReply(ctx, args, SETUP_FAILURE);
    await spectrum.completeChain(ctx, args);
    return;
  }

  if (await spectrum.isCancelled(ctx, args)) return;

  const reserved = await ctx.runMutation(internal.productWatches.requestWatch, {
    senderKey,
    productUrl: parsed.productUrl,
    merchantHost: parsed.merchantHost,
    capPriceMinor,
    notifySpaceId: args.spaceId,
    now: Date.now(),
  });
  if (reserved.kind === "already_exists") {
    await sendReply(ctx, args, ALREADY_WATCHING);
    await spectrum.completeChain(ctx, args);
    return;
  }
  if (reserved.kind === "conflict") {
    await sendReply(ctx, args, CONFLICT);
    await spectrum.completeChain(ctx, args);
    return;
  }
  if (reserved.kind !== "created") {
    await sendReply(ctx, args, ACCOUNT_MISMATCH);
    await spectrum.completeChain(ctx, args);
    return;
  }

  const created = await ctx.runAction(
    internal.firecrawl.createMonitorForWatch,
    {
      watchId: reserved.watchId,
      priceMinor: scraped.priceMinor,
      available: scraped.available,
    },
  );
  if (await spectrum.isCancelled(ctx, args)) return;
  if (created !== "activated") {
    await sendReply(ctx, args, SETUP_FAILURE);
    await spectrum.completeChain(ctx, args);
    return;
  }

  await sendReply(
    ctx,
    args,
    directWatchReply(scraped.title, scraped.priceMinor, capPriceMinor),
  );
  await spectrum.completeChain(ctx, args);
};

/**
 * URL-free path. The model only classifies and extracts; every branch checks
 * cancellation around the provider call and the bounded state change.
 */
const handleUrlFree = async (
  ctx: ActionCtx,
  args: { spaceId: string; chainId: string },
  senderKey: string,
  text: string,
  now: number,
) => {
  // An expired brief is treated as no prior context: the read reports it as
  // absent, and the next save overwrites it with a newer revision. No pre-clear
  // is done here, because an intervening clarify must be able to save with the
  // same `now` revision instead of colliding with a revision the clear already
  // advanced to.
  const state = await ctx.runQuery(internal.members.readClarification, {
    senderKey,
    now,
  });

  // A bare cancel word while a clarification is open bails out deterministically
  // — no reason to spend a model call on it.
  if (
    state.continuation !== null &&
    CANCEL_WORDS.has(text.trim().toLowerCase())
  ) {
    await ctx.runMutation(internal.members.clearClarification, {
      senderKey,
      expectedRevision: state.revision,
      revision: now,
      now,
    });
    await sendReply(ctx, args, CLARIFY_CANCELLED);
    await spectrum.completeChain(ctx, args);
    return;
  }

  const apiKey = env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    await sendReply(ctx, args, MODEL_FAILURE);
    await spectrum.completeChain(ctx, args);
    return;
  }
  if (await spectrum.isCancelled(ctx, args)) return;

  const model = await callShoppingModel({
    apiKey,
    message: text,
    prior: state.continuation,
  });
  if (await spectrum.isCancelled(ctx, args)) return;
  if (model.kind !== "ok") {
    await sendReply(ctx, args, MODEL_FAILURE);
    await spectrum.completeChain(ctx, args);
    return;
  }
  const plan = model.plan;

  if (plan.action === "clarify") {
    if (await spectrum.isCancelled(ctx, args)) return;
    const saved = await ctx.runMutation(internal.members.saveClarification, {
      senderKey,
      revision: now,
      subject: plan.continuation.subject,
      constraints: plan.continuation.constraints,
      missing: plan.continuation.missing,
      now,
    });
    // Past the round cap, the mutation already cleared the brief; give up
    // instead of asking again.
    await sendReply(
      ctx,
      args,
      saved.capped === true ? CLARIFY_GIVE_UP : plan.question,
    );
    await spectrum.completeChain(ctx, args);
    return;
  }

  if (plan.action === "unsupported") {
    if (await spectrum.isCancelled(ctx, args)) return;
    await ctx.runMutation(internal.members.clearClarification, {
      senderKey,
      expectedRevision: state.revision,
      revision: now,
      now,
    });
    await sendReply(
      ctx,
      args,
      plan.unsupportedReason === "purchase" ? PURCHASE_REPLY : UNRELATED_REPLY,
    );
    await spectrum.completeChain(ctx, args);
    return;
  }

  // Search: clear the consumed revision, then run the trusted Firecrawl path.
  if (await spectrum.isCancelled(ctx, args)) return;
  await ctx.runMutation(internal.members.clearClarification, {
    senderKey,
    expectedRevision: state.revision,
    revision: now,
    now,
  });

  const locality = (await ctx.runQuery(
    internal.productWatches.getMemberLocality,
    { senderKey },
  )) as Locality | null;

  const searchNearMe = locality?.searchNearMe === true;
  const capPriceMinor =
    parseCapText(text) ??
    (state.continuation === null
      ? undefined
      : parseCapText(state.continuation.constraints));

  if (await spectrum.isCancelled(ctx, args)) return;
  const found = await ctx.runAction(internal.firecrawl.searchProducts, {
    query: plan.query,
    searchNearMe,
    searchRadiusMeters: searchNearMe ? locality?.searchRadiusMeters : undefined,
    city: locality?.city,
    region: locality?.region,
    postalCode: locality?.postalCode,
    countryCode: locality?.countryCode,
    maxPriceMinor: capPriceMinor,
  });
  if (await spectrum.isCancelled(ctx, args)) return;
  if (found.kind !== "ok") {
    await sendReply(ctx, args, SEARCH_FAILURE);
    await spectrum.completeChain(ctx, args);
    return;
  }
  if (found.products.length === 0) {
    await sendReply(ctx, args, NO_RESULTS);
    await spectrum.completeChain(ctx, args);
    return;
  }

  if (await spectrum.isCancelled(ctx, args)) return;
  const mintNow = Date.now();
  const token = newClaimToken();
  const minted = await ctx.runMutation(
    internal.productWatches.mintPickerSession,
    {
      senderKey,
      notifySpaceId: args.spaceId,
      tokenHash: await hashClaimToken(token),
      candidates: found.products,
      expiresAt: mintNow + CLAIM_TTL_MS,
      now: mintNow,
    },
  );
  if (await spectrum.isCancelled(ctx, args)) return;

  const siteUrl = env.SITE_URL;
  if (
    minted.kind === "ok" &&
    typeof siteUrl === "string" &&
    siteUrl.length > 0
  ) {
    const pickerUrl = `${siteUrl.replace(/\/$/, "")}/pick?t=${token}`;
    // The picker page already states watch and purchase semantics; the text
    // reply stays a bare link and nothing else.
    await sendReply(
      ctx,
      args,
      `I found ${found.products.length} options: ${pickerUrl}`,
    );
  } else {
    await sendReply(ctx, args, PICKER_FAILURE);
  }
  await spectrum.completeChain(ctx, args);
};

/**
 * One active-owner shopping turn. A typing indicator is enqueued immediately
 * — no text acknowledgement — so the owner sees the native "…" rather than a
 * repeated "Got it" bubble on every single message. The final
 * clarify/search/unsupported/watch reply remains the chain's only answer.
 */
const handleOwnerTurn = async (
  ctx: ActionCtx,
  args: { spaceId: string; chainId: string },
  senderKey: string,
  text: string,
  now: number,
) => {
  await typingEnqueuer.enqueue(ctx, {
    spaceId: args.spaceId,
    chainId: args.chainId,
  });

  // Every known failure inside these two paths already sends a specific
  // reply and completes the chain. This catches anything unexpected — a
  // thrown error rather than a typed `kind !== "ok"` result — so the owner
  // never ends the turn with only the ack and a chain that never answers.
  try {
    const { rawUrl, capPriceMinor } = parseWatchMessage(text);
    if (rawUrl !== undefined) {
      await handleDirectUrl(ctx, args, senderKey, rawUrl, capPriceMinor);
      return;
    }
    await handleUrlFree(ctx, args, senderKey, text, now);
  } catch {
    if (await spectrum.isCancelled(ctx, args)) return;
    await sendReply(ctx, args, UNEXPECTED_FAILURE);
    await spectrum.completeChain(ctx, args);
  }
};

const submitResult = v.union(
  v.object({
    kind: v.literal("ok"),
    title: v.string(),
    sizeLabel: v.optional(v.string()),
    capPriceMinor: v.optional(v.number()),
  }),
  v.object({ kind: v.literal("invalid") }),
  v.object({ kind: v.literal("bad_url") }),
  v.object({ kind: v.literal("bad_cap") }),
  v.object({ kind: v.literal("bad_size") }),
  v.object({ kind: v.literal("conflict") }),
  v.object({ kind: v.literal("scrape_failed") }),
  v.object({ kind: v.literal("setup_failed") }),
);

type SubmitChoiceResult =
  | { kind: "ok"; title: string; sizeLabel?: string; capPriceMinor?: number }
  | {
      kind:
        | "invalid"
        | "bad_url"
        | "bad_cap"
        | "bad_size"
        | "conflict"
        | "scrape_failed"
        | "setup_failed";
    };

/**
 * Picker submit path. The token is consumed and the watch reserved before any
 * provider work, so a double submit can never create two watches. Only then is
 * the exact chosen URL freshly scraped and the monitor created, mirroring the
 * ordering the direct-link path uses for its own provider calls.
 */
export const submitPickerChoice = internalAction({
  args: {
    tokenHash: v.string(),
    productUrl: v.string(),
    sizeLabel: v.optional(v.string()),
    capPriceMinor: v.optional(v.number()),
  },
  returns: submitResult,
  handler: async (ctx, args): Promise<SubmitChoiceResult> => {
    const claim = await ctx.runMutation(
      internal.productWatches.claimPickerChoice,
      {
        tokenHash: args.tokenHash,
        productUrl: args.productUrl,
        sizeLabel: args.sizeLabel,
        capPriceMinor: args.capPriceMinor,
        now: Date.now(),
      },
    );
    if (claim.kind === "created") {
      // fall through to provider work
    } else if (claim.kind === "invalid") {
      return { kind: "invalid" as const };
    } else if (claim.kind === "bad_url") {
      return { kind: "bad_url" as const };
    } else if (claim.kind === "bad_cap") {
      return { kind: "bad_cap" as const };
    } else if (claim.kind === "bad_size") {
      return { kind: "bad_size" as const };
    } else {
      return { kind: "conflict" as const };
    }

    const scraped = await ctx.runAction(internal.firecrawl.scrapeProduct, {
      productUrl: claim.productUrl,
    });
    if (scraped.kind !== "ok") {
      await ctx.runMutation(internal.productWatches.failWatch, {
        watchId: claim.watchId,
        failureCode: "baseline_provider_error",
        now: Date.now(),
      });
      return { kind: "scrape_failed" as const };
    }

    const monitor = await ctx.runAction(
      internal.firecrawl.createMonitorForWatch,
      {
        watchId: claim.watchId,
        priceMinor: scraped.priceMinor,
        available: scraped.available,
      },
    );
    if (monitor !== "activated") {
      await ctx.runMutation(internal.productWatches.failWatch, {
        watchId: claim.watchId,
        failureCode: "monitor_create_failed",
        now: Date.now(),
      });
      return { kind: "setup_failed" as const };
    }

    const when =
      claim.capPriceMinor === undefined
        ? "I'll message you when the price or availability changes."
        : `I'll message you when it's in stock at ${formatUsd(
            claim.capPriceMinor,
          )} or less.`;
    const sizeNote =
      claim.sizeLabel === undefined ? "" : ` Size ${claim.sizeLabel}.`;
    await spectrum.send(ctx, {
      spaceId: claim.notifySpaceId,
      content: {
        type: "text",
        text: `Done — I'm watching ${titleForMessage(
          scraped.title,
        )} at ${formatUsd(scraped.priceMinor)}.${sizeNote} ${when}`,
      },
    });
    return {
      kind: "ok" as const,
      title: scraped.title,
      sizeLabel: claim.sizeLabel,
      capPriceMinor: claim.capPriceMinor,
    };
  },
});

export const respond = internalAction({
  args: {
    spaceId: v.string(),
    chainId: v.string(),
    messages: v.array(v.any()),
    carried: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { senderId, text } = combineBurst(args.carried, args.messages);

    if (senderId === undefined) {
      await sendReply(ctx, args, HELP);
      await spectrum.completeChain(ctx, args);
      return null;
    }

    if (await spectrum.isCancelled(ctx, args)) {
      return null;
    }

    // Known sender, but the burst carried no text (an image, tapback, …).
    // Still route the owner check correctly instead of treating a known
    // sender as anonymous — onboarding itself needs real text, so skip it.
    const senderKey = await hmacSenderKey(env.SENDER_HMAC_SECRET, senderId);
    const isOwner = senderKey === env.OWNER_SENDER_KEY;
    if (text === undefined) {
      await sendReply(ctx, args, isOwner ? TEXT_ONLY : HELP);
      await spectrum.completeChain(ctx, args);
      return null;
    }

    const now = Date.now();
    const token = newClaimToken();
    const outcome = await ctx.runMutation(internal.members.onboard, {
      senderKey,
      text,
      isOwner,
      tokenHash: await hashClaimToken(token),
      claimExpiresAt: now + CLAIM_TTL_MS,
      now,
    });

    if (await spectrum.isCancelled(ctx, args)) {
      return null;
    }

    if (outcome === "holding") {
      // Only the configured owner may command a watch. Non-owners get the
      // generic help and never trigger provider work.
      if (!isOwner) {
        await sendReply(ctx, args, HELP);
        await spectrum.completeChain(ctx, args);
        return null;
      }
      await handleOwnerTurn(ctx, args, senderKey, text, now);
      return null;
    }

    const link =
      outcome === "activated" || outcome === "settings_link"
        ? claimLink(env.SITE_URL, token)
        : undefined;
    await sendReply(ctx, args, replyText(outcome, link));
    await spectrum.completeChain(ctx, args);
    return null;
  },
});
