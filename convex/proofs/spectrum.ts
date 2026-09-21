"use node";

import { createHmac, randomUUID } from "node:crypto";
import { v } from "convex/values";
import { env, internalAction } from "../_generated/server";
import { spectrum } from "../spectrum";

const responseValidator = v.object({
  status: v.number(),
  body: v.string(),
});

export const verifyWebhook = internalAction({
  args: {},
  returns: v.object({
    forged: responseValidator,
    first: responseValidator,
    duplicate: responseValidator,
    storedOccurrences: v.number(),
  }),
  handler: async (ctx) => {
    const messageId = `proof-${randomUUID()}`;
    const spaceId = `proof-${randomUUID()}`;
    const body = JSON.stringify({
      event: "message.received",
      message: {
        id: messageId,
        platform: "imessage",
        direction: "incoming",
        timestamp: new Date().toISOString(),
        sender: { id: "synthetic-proof-sender", platform: "imessage" },
        space: { id: spaceId, platform: "imessage", type: "dm" },
        content: { type: "read" },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `v0=${createHmac("sha256", env.SPECTRUM_WEBHOOK_SECRET)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`;

    const send = async (value: string) => {
      const response = await fetch(`${env.CONVEX_SITE_URL}/spectrum/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-spectrum-signature": value,
          "x-spectrum-timestamp": timestamp,
        },
        body,
      });
      return { status: response.status, body: await response.text() };
    };

    const forged = await send(`v0=${"0".repeat(64)}`);
    const first = await send(signature);
    const duplicate = await send(signature);
    const messages = await spectrum.listMessages(ctx, { spaceId, limit: 10 });

    return {
      forged,
      first,
      duplicate,
      storedOccurrences: messages.filter(
        (message) => message.messageId === messageId,
      ).length,
    };
  },
});
