const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** SHA-256 of a value, hex encoded. Used for claim-token lookup keys. */
export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
};

/** HMAC-SHA256 of a normalized sender id, hex encoded. */
export const hmacSenderKey = async (secret: string, senderId: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(senderId.trim().toLowerCase()),
  );
  return toHex(new Uint8Array(signature));
};

/** 256 bits of entropy, hex encoded. */
export const newClaimToken = () =>
  toHex(crypto.getRandomValues(new Uint8Array(32)));

export const hashClaimToken = sha256Hex;

export const CLAIM_TTL_MS = 15 * 60 * 1000;

/**
 * Trim, collapse whitespace, strip control characters, and enforce a
 * 1-50 visible-character limit. Returns null when nothing usable remains.
 */
export const normalizeDisplayName = (raw: string) => {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...cleaned].length;
  if (length < 1 || length > 50) {
    return null;
  }
  return cleaned;
};
