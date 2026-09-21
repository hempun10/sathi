import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  CLAIM_TTL_MS,
  hashClaimToken,
  hmacSenderKey,
  newClaimToken,
} from "./crypto";
import { spectrum } from "./spectrum";

const HELP =
  "I can watch a product and ask before buying. Text me your name to get set up.";

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

const claimLink = (siteUrl: string | undefined, token: string) =>
  siteUrl === undefined
    ? undefined
    : `${siteUrl.replace(/\/$/, "")}/claim?token=${token}`;

const replyText = (outcome: string, link: string | undefined) => {
  if (outcome === "asked_for_name") {
    return "What should I call you?";
  }
  if (outcome === "holding") {
    return "You're set up. Product watches aren't live yet, so there's nothing to watch right now.";
  }
  return link === undefined
    ? "You're set up. Your settings link is still being configured."
    : `Here is your private settings link. It works once and expires in 15 minutes: ${link}`;
};

export const respond = internalAction({
  args: {
    spaceId: v.string(),
    chainId: v.string(),
    messages: v.array(v.any()),
    carried: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reply = async (text: string) => {
      await spectrum.send(ctx, {
        spaceId: args.spaceId,
        chainId: args.chainId,
        content: { type: "text", text },
      });
    };

    const latest = args.messages.at(-1) ?? args.carried.at(-1);
    const { senderId, text } = parseInbound(latest);

    if (senderId === undefined || text === undefined) {
      await reply(HELP);
      await spectrum.completeChain(ctx, args);
      return null;
    }

    if (await spectrum.isCancelled(ctx, args)) {
      return null;
    }

    const now = Date.now();
    const token = newClaimToken();
    const outcome = await ctx.runMutation(internal.members.onboard, {
      senderKey: await hmacSenderKey(env.SENDER_HMAC_SECRET, senderId),
      text,
      tokenHash: await hashClaimToken(token),
      claimExpiresAt: now + CLAIM_TTL_MS,
      now,
    });

    if (await spectrum.isCancelled(ctx, args)) {
      return null;
    }

    const link =
      outcome === "activated" || outcome === "settings_link"
        ? claimLink(env.SITE_URL, token)
        : undefined;
    await reply(replyText(outcome, link));
    await spectrum.completeChain(ctx, args);
    return null;
  },
});
