/**
 * Conversational shopping plan for URL-free owner messages.
 *
 * The model is an untrusted classifier. Its output never reaches the database,
 * a provider, or a reply before {@link parseShoppingPlan} has rejected every
 * extra, malformed, mismatched, multiline, or overlong value. This module is
 * pure except for {@link callShoppingModel}, which talks to OpenAI over native
 * `fetch` and deliberately never logs a request body, a response body, an
 * exception that may carry one, the API key, or the raw inbound text.
 */

export const SHOPPING_MISSING = [
  "item",
  "recipient",
  "style",
  "size",
  "budget",
  "other",
] as const;

export type ShoppingMissing = (typeof SHOPPING_MISSING)[number];

export const MAX_QUERY_LENGTH = 200;
export const MAX_QUESTION_LENGTH = 160;
export const MAX_SUBJECT_LENGTH = 80;
export const MAX_CONSTRAINTS_LENGTH = 160;

export const OPENAI_MODEL = "gpt-5.6-luna";
/** `gpt-5.6-luna` rejects "minimal"; "none" is its lowest reasoning effort. */
export const OPENAI_REASONING_EFFORT = "none";
export const OPENAI_TIMEOUT_MS = 12_000;
export const OPENAI_MAX_OUTPUT_TOKENS = 600;

/** The only shape persisted for a pending clarification. */
export type Clarification = {
  subject: string;
  constraints: string;
  missing: ShoppingMissing;
};

/** The three model outcomes; there is no fourth. */
export type ShoppingPlan =
  | { action: "search"; query: string }
  | { action: "clarify"; question: string; continuation: Clarification }
  | { action: "unsupported"; unsupportedReason: "purchase" | "unrelated" };

const PLAN_KEYS = [
  "action",
  "query",
  "question",
  "continuation",
  "unsupportedReason",
] as const;
const CONTINUATION_KEYS = ["subject", "constraints", "missing"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  record: Record<string, unknown>,
  keys: readonly string[],
) => {
  const actual = Object.keys(record);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
};

/**
 * One bounded, single-line string. Control characters and line breaks are
 * rejected so a model cannot smuggle structure or a newline into a stored
 * brief or a reply. `allowEmpty` covers a brief with no known constraints yet.
 */
const boundedLine = (
  value: unknown,
  max: number,
  allowEmpty: boolean,
): string | null => {
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  if (/[\r\n\u0000-\u001f\u007f]/.test(value)) return null;
  const trimmed = value.trim();
  return allowEmpty || trimmed.length > 0 ? trimmed : null;
};

const singleLine = (value: unknown, max: number) =>
  boundedLine(value, max, false);

/**
 * A clarify question: one bounded single-line question with exactly one `?`,
 * as the final non-space character. A single question may still carry a
 * compact list of details before the mark.
 */
const questionLine = (value: unknown, max: number) => {
  const line = boundedLine(value, max, false);
  if (line === null || line.indexOf("?") !== line.lastIndexOf("?")) {
    return null;
  }
  return line.endsWith("?") ? line : null;
};

/**
 * Safe, static fallback questions keyed by the structured `missing` field.
 * The model reliably classifies a vague message as needing clarification
 * but sometimes phrases the free-text `question` outside the single-line,
 * one-`?`, bounded-length format (a parenthetical numbered list, a trailing
 * period). Rather than fail the whole turn to a generic "I couldn't
 * understand that", fall back to one of these when only the free-text
 * question is malformed — `continuation` (the structured part) still has to
 * validate normally.
 */
export const FALLBACK_QUESTION: Record<ShoppingMissing, string> = {
  item: "What product are you looking for?",
  recipient: "Who's this for?",
  style: "What style or color are you thinking?",
  size: "What size do you need?",
  budget: "What's your budget?",
  other: "Can you give me a bit more detail?",
};

const parseContinuation = (value: unknown): Clarification | null => {
  if (!isPlainObject(value) || !hasExactKeys(value, CONTINUATION_KEYS)) {
    return null;
  }
  const subject = boundedLine(value.subject, MAX_SUBJECT_LENGTH, true);
  const constraints = boundedLine(
    value.constraints,
    MAX_CONSTRAINTS_LENGTH,
    true,
  );
  const missing = value.missing;
  if (
    subject === null ||
    constraints === null ||
    typeof missing !== "string" ||
    !(SHOPPING_MISSING as readonly string[]).includes(missing)
  ) {
    return null;
  }
  return {
    subject,
    constraints,
    missing: missing as ShoppingMissing,
  };
};

/**
 * Validate untrusted model output into a trusted plan, or `null`. Fails closed
 * on extra keys or an invalid field used by the selected action. Fields from
 * inactive branches are ignored: strict JSON Schema fixes their types, but
 * smaller models sometimes populate them despite being told to use null.
 */
export const parseShoppingPlan = (value: unknown): ShoppingPlan | null => {
  if (!isPlainObject(value) || !hasExactKeys(value, PLAN_KEYS)) return null;

  if (value.action === "search") {
    const query = singleLine(value.query, MAX_QUERY_LENGTH);
    if (query === null || value.unsupportedReason !== "none") return null;
    return { action: "search", query };
  }

  if (value.action === "clarify") {
    const continuation = parseContinuation(value.continuation);
    if (continuation === null || value.unsupportedReason !== "none") {
      return null;
    }
    const question =
      questionLine(value.question, MAX_QUESTION_LENGTH) ??
      FALLBACK_QUESTION[continuation.missing];
    return { action: "clarify", question, continuation };
  }

  if (value.action === "unsupported") {
    const reason = value.unsupportedReason;
    if (reason !== "purchase" && reason !== "unrelated") return null;
    return { action: "unsupported", unsupportedReason: reason };
  }

  return null;
};

/** Strict JSON Schema requested from OpenAI. All fields required, no extras. */
export const SHOPPING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "action",
    "query",
    "question",
    "continuation",
    "unsupportedReason",
  ],
  properties: {
    action: {
      type: "string",
      enum: ["clarify", "search", "unsupported"],
    },
    query: { type: ["string", "null"] },
    question: { type: ["string", "null"] },
    continuation: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["subject", "constraints", "missing"],
      properties: {
        subject: { type: "string" },
        constraints: { type: "string" },
        missing: { type: "string", enum: SHOPPING_MISSING },
      },
    },
    unsupportedReason: {
      type: "string",
      enum: ["purchase", "unrelated", "none"],
    },
  },
};

export const SHOPPING_SYSTEM_PROMPT = [
  "You are the shopping assistant for a product price watcher. You only help find and watch physical products. You cannot buy anything.",
  "Return exactly one JSON object matching the schema. Choose one action:",
  '- "search": there is enough context to find useful product results. Put a short product search query in "query". Use only facts explicitly present in the current message or prior brief. Never invent or default a recipient, gender, use, style, size, color, brand, model, or budget. Set "question" and "continuation" to null and "unsupportedReason" to "none".',
  '- "clarify": the request is genuinely about finding a physical product, but missing details would make results broad or useless. Put ONE short question in "question": a single sentence, at most 140 characters, ending in exactly one "?" and nothing after it — no parenthetical examples, no numbered or bulleted list, no second sentence. Put only known facts in "continuation": a bounded "subject", "constraints", and the most important "missing" field. Set "query" to null and "unsupportedReason" to "none".',
  '- "unsupported": the primary request is to purchase now (unsupportedReason "purchase") or is not about finding or watching a physical product (unsupportedReason "unrelated"). Jokes, advice, explanations, coding, services, courses, books requested as information, greetings, small talk, slang check-ins ("wyd", "sup"), and general conversation are unrelated even when they mention a product or technology. A message with no product signal at all is unrelated, not clarify. Do not reinterpret an unrelated request as shopping and do not ask whether the user meant a product. Set "query", "question" and "continuation" to null.',
  'Example: "find me some shoes" is clarify. Ask what kind of shoes, size, and budget; do not invent running shoes, a gender, or a price.',
  'Example: "tell me a joke about databases" is unsupported/unrelated. Do not ask whether they want database products.',
  'Example: "wyd" or "new here, what\'s good" is unsupported/unrelated. There is no product to clarify.',
  'Example: "find black Adidas Samba shoes size 10 under $100" is search with exactly those facts.',
  "If a prior brief is provided, merge it with the new message without adding facts. Keep every string single-line and within its limit. A budget is only a maximum price to watch; it never authorizes a purchase.",
].join("\n");

/**
 * The structured user input. The prior brief is passed as data so a
 * clarification answer merges instead of starting over.
 */
export const buildModelUserContent = (
  message: string,
  prior: Clarification | null,
) =>
  JSON.stringify({
    message,
    priorBrief:
      prior === null
        ? null
        : {
            subject: prior.subject,
            constraints: prior.constraints,
            missing: prior.missing,
          },
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Pull the JSON text out of a Responses API body without trusting its shape. */
export const extractResponseText = (value: unknown): string | null => {
  const record = asRecord(value);
  if (record === null) return null;
  if (typeof record.output_text === "string") return record.output_text;
  const output = record.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const message = asRecord(item);
    if (message?.type !== "message") continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const textPart = asRecord(part);
      if (
        textPart?.type === "output_text" &&
        typeof textPart.text === "string"
      ) {
        return textPart.text;
      }
    }
  }
  return null;
};

export type ModelCallResult =
  { kind: "ok"; plan: ShoppingPlan } | { kind: "failed" };

/**
 * One bounded OpenAI Responses call. Any failure — missing key, non-2xx,
 * timeout, a body that will not parse, or a plan that fails validation — is
 * the same `failed` result. Nothing here logs or throws a body.
 */
export const callShoppingModel = async (args: {
  apiKey: string;
  message: string;
  prior: Clarification | null;
}): Promise<ModelCallResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        reasoning: { effort: OPENAI_REASONING_EFFORT },
        max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: SHOPPING_SYSTEM_PROMPT }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildModelUserContent(args.message, args.prior),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "shopping_plan",
            strict: true,
            schema: SHOPPING_JSON_SCHEMA,
          },
        },
      }),
    });
    if (!response.ok) return { kind: "failed" };
    const body = await response.json();
    const text = extractResponseText(body);
    if (text === null) return { kind: "failed" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { kind: "failed" };
    }
    const plan = parseShoppingPlan(parsed);
    return plan === null ? { kind: "failed" } : { kind: "ok", plan };
  } catch {
    // Never rethrow or log: an exception can carry a request or response body.
    return { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
};
