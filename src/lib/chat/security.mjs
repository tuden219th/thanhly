import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** @returns {string} */
export function createGuestToken() {
  return randomBytes(32).toString("base64url");
}

/** @param {string} token @returns {string} */
export function hashGuestToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** @param {string} secret @param {string} subject @returns {string} */
export function hashRateLimitSubject(secret, subject) {
  return createHmac("sha256", secret).update(subject, "utf8").digest("hex");
}

/** @param {string} token @returns {boolean} */
export function isValidGuestToken(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  return Buffer.from(token, "base64url").length === 32;
}

/** @param {string} token @param {string} storedHash @returns {boolean} */
export function tokenMatchesHash(token, storedHash) {
  if (!isValidGuestToken(token) || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const supplied = Buffer.from(hashGuestToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return timingSafeEqual(supplied, expected);
}

/** @param {string} sessionConversationId @param {string} requestedConversationId @returns {boolean} */
export function guestSessionMatchesConversation(sessionConversationId, requestedConversationId) {
  return sessionConversationId === requestedConversationId;
}

/** @param {unknown} value @returns {value is string} */
export function isValidChatMessage(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized.length > 0 && Array.from(normalized).length <= 10_000;
}
