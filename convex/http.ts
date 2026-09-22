import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { components, internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { sha256Hex } from "./crypto";
import { pickerOpenGraph, renderPickerPage } from "./pickerPage";
import { spectrum } from "./spectrum";

const http = httpRouter();

const WEBHOOK_PATH = "/api/webhooks/firecrawl";
const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_ID_LENGTH = 256;
const MAX_URL_LENGTH = 2_048;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

auth.addHttpRoutes(http);

http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () =>
    Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    ),
  ),
});

const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const isValidId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  ID_PATTERN.test(value);

/** Compare two equal-length hex digests without an early length return. */
const fixedTimeEqualHex = (left: string, right: string) => {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
};

/**
 * Stream the body and abort as soon as it exceeds the cap, instead of
 * buffering an arbitrarily large payload first.
 */
const readBoundedBody = async (req: Request): Promise<Uint8Array | null> => {
  const stream = req.body;
  if (stream === null) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

type WebhookEnvelope = {
  eventType: "monitor.page";
  webhookId: string;
  monitorId: string;
  checkId: string;
  eventUrl: string;
  pageStatus: "same" | "new" | "changed" | "removed" | "error";
  isMeaningful?: boolean;
};

const PAGE_STATUSES = ["same", "new", "changed", "removed", "error"] as const;

const validateEnvelope = (value: unknown): WebhookEnvelope | null => {
  const record = asRecord(value);
  if (record === null) return null;
  if (record.type !== "monitor.page") return null;
  const webhookId = record.webhookId;
  if (!isValidId(webhookId)) return null;
  const data = record.data;
  if (!Array.isArray(data) || data.length !== 1) return null;
  const item = asRecord(data[0]);
  if (item === null) return null;
  const monitorId = item.monitorId;
  const checkId = item.checkId;
  if (!isValidId(monitorId) || !isValidId(checkId)) return null;
  const status = item.status;
  if (
    typeof status !== "string" ||
    !(PAGE_STATUSES as readonly string[]).includes(status)
  ) {
    return null;
  }
  const eventUrl = item.url;
  if (
    typeof eventUrl !== "string" ||
    eventUrl.length === 0 ||
    eventUrl.length > MAX_URL_LENGTH
  ) {
    return null;
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(eventUrl);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== "https:") return null;

  const judgment = asRecord(item.judgment);
  const isMeaningful =
    typeof item.isMeaningful === "boolean"
      ? item.isMeaningful
      : typeof judgment?.meaningful === "boolean"
        ? judgment.meaningful
        : undefined;

  return {
    eventType: "monitor.page",
    webhookId,
    monitorId,
    checkId,
    eventUrl,
    pageStatus: status as WebhookEnvelope["pageStatus"],
    isMeaningful,
  };
};

http.route({
  path: WEBHOOK_PATH,
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const configuredToken = env.FIRECRAWL_MONITOR_WEBHOOK_TOKEN;
    if (typeof configuredToken !== "string" || configuredToken.length === 0) {
      return new Response(null, { status: 401 });
    }
    const expected = `Bearer ${configuredToken}`;
    const [providedHash, expectedHash] = await Promise.all([
      sha256Hex(req.headers.get("authorization") ?? ""),
      sha256Hex(expected),
    ]);
    if (!fixedTimeEqualHex(providedHash, expectedHash)) {
      return new Response(null, { status: 401 });
    }

    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
      return new Response(null, { status: 413 });
    }
    const bytes = await readBoundedBody(req);
    if (bytes === null) {
      return new Response(null, { status: 413 });
    }

    const raw = new TextDecoder().decode(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }
    const envelope = validateEnvelope(parsed);
    if (envelope === null) {
      return new Response(null, { status: 400 });
    }

    const bodyHash = await sha256Hex(raw);
    try {
      await ctx.runMutation(internal.productWatches.claimEvent, {
        dedupeKey: `${envelope.eventType}:${envelope.webhookId}`,
        domainKey: `${envelope.monitorId}:${envelope.checkId}:${envelope.eventType}`,
        eventType: envelope.eventType,
        webhookId: envelope.webhookId,
        monitorId: envelope.monitorId,
        checkId: envelope.checkId,
        eventUrl: envelope.eventUrl,
        pageStatus: envelope.pageStatus,
        isMeaningful: envelope.isMeaningful,
        bodyHash,
        now: Date.now(),
      });
    } catch {
      return new Response(null, { status: 500 });
    }

    return new Response(null, { status: 202 });
  }),
});

// ---------------------------------------------------------------------------
// Picker page API. Registered before the static catch-all so /api/pick wins.
// ---------------------------------------------------------------------------

const PICK_NO_STORE = { "Cache-Control": "no-store" } as const;

// A static hosting route would miss the extension-less `/pick` path and serve
// the landing page. Render the picker itself, with per-session Open Graph tags,
// so a plain link unfurls with the right preview and a 200 rather than a 302.
http.route({
  path: "/pick",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const token = new URL(req.url).searchParams.get("t");
    if (!isValidId(token)) {
      return new Response(null, { status: 404, headers: PICK_NO_STORE });
    }
    const session = await ctx.runQuery(
      internal.productWatches.getPickerSessionForToken,
      { tokenHash: await sha256Hex(token), now: Date.now() },
    );
    if (session === null) {
      return new Response(null, { status: 404, headers: PICK_NO_STORE });
    }
    return new Response(
      renderPickerPage(pickerOpenGraph(session.candidates), token),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }),
});

http.route({
  path: "/api/pick",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const token = new URL(req.url).searchParams.get("t");
    if (!isValidId(token)) {
      return new Response(null, { status: 404, headers: PICK_NO_STORE });
    }
    const session = await ctx.runQuery(
      internal.productWatches.getPickerSessionForToken,
      { tokenHash: await sha256Hex(token), now: Date.now() },
    );
    if (session === null) {
      return new Response(null, { status: 404, headers: PICK_NO_STORE });
    }
    // The query returns only candidates, so no member, space, or token
    // identifier can reach the response.
    return Response.json(
      { candidates: session.candidates },
      { headers: PICK_NO_STORE },
    );
  }),
});

http.route({
  path: "/api/pick",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
      return new Response(null, { status: 413, headers: PICK_NO_STORE });
    }
    const bytes = await readBoundedBody(req);
    if (bytes === null) {
      return new Response(null, { status: 413, headers: PICK_NO_STORE });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return new Response(null, { status: 400, headers: PICK_NO_STORE });
    }
    const record = asRecord(parsed);
    if (record === null) {
      return new Response(null, { status: 400, headers: PICK_NO_STORE });
    }
    const token = record.token;
    const productUrl = record.productUrl;
    const sizeLabel = record.sizeLabel;
    const capPriceMinor = record.capPriceMinor;
    if (
      !isValidId(token) ||
      typeof productUrl !== "string" ||
      productUrl.length === 0 ||
      productUrl.length > MAX_URL_LENGTH ||
      (sizeLabel !== undefined && typeof sizeLabel !== "string") ||
      (capPriceMinor !== undefined &&
        (typeof capPriceMinor !== "number" ||
          !Number.isSafeInteger(capPriceMinor) ||
          capPriceMinor < 0))
    ) {
      return new Response(null, { status: 400, headers: PICK_NO_STORE });
    }

    try {
      const result = await ctx.runAction(
        internal.photon.submitPickerChoice,
        {
          tokenHash: await sha256Hex(token),
          productUrl,
          sizeLabel,
          capPriceMinor,
        },
      );
      if (result.kind === "ok") {
        return Response.json(
          {
            status: "ok",
            title: result.title,
            sizeLabel: result.sizeLabel,
            capPriceMinor: result.capPriceMinor,
          },
          { headers: PICK_NO_STORE },
        );
      }
      if (result.kind === "invalid") {
        return new Response(null, { status: 404, headers: PICK_NO_STORE });
      }
      if (result.kind === "conflict") {
        return new Response(null, { status: 409, headers: PICK_NO_STORE });
      }
      if (result.kind === "scrape_failed" || result.kind === "setup_failed") {
        return new Response(null, { status: 502, headers: PICK_NO_STORE });
      }
      return new Response(null, { status: 400, headers: PICK_NO_STORE });
    } catch {
      return new Response(null, { status: 500, headers: PICK_NO_STORE });
    }
  }),
});

spectrum.registerRoutes(http);
registerStaticRoutes(http, components.staticHosting);

export default http;
