import test from "node:test";
import assert from "node:assert/strict";
import {
  createGuestToken,
  guestSessionMatchesConversation,
  hashGuestToken,
  hashRateLimitSubject,
  isValidChatMessage,
  isValidGuestToken,
  tokenMatchesHash,
} from "../src/lib/chat/security.mjs";

test("guest tokens are random, high entropy shaped, and never stored as the token itself", () => {
  const first = createGuestToken();
  const second = createGuestToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(isValidGuestToken(first), true);
  assert.notEqual(first, second);
  assert.notEqual(hashGuestToken(first), first);
  assert.match(hashGuestToken(first), /^[a-f0-9]{64}$/);
});

test("a guest token authorizes only its matching hash", () => {
  const token = createGuestToken();
  const otherToken = createGuestToken();
  const hash = hashGuestToken(token);

  assert.equal(tokenMatchesHash(token, hash), true);
  assert.equal(tokenMatchesHash(otherToken, hash), false);
  assert.equal(tokenMatchesHash("invalid", hash), false);
  assert.equal(tokenMatchesHash(token, "not-a-hash"), false);
});

test("a guest session cannot be scoped to another conversation id", () => {
  const conversationA = "00000000-0000-4000-8000-000000000201";
  const conversationB = "00000000-0000-4000-8000-000000000202";

  assert.equal(guestSessionMatchesConversation(conversationA, conversationA), true);
  assert.equal(guestSessionMatchesConversation(conversationA, conversationB), false);
});

test("rate limit subject hashes are keyed and do not expose the source value", () => {
  const subject = "127.0.0.1";
  const hash = hashRateLimitSubject("a-test-secret-at-least-32-characters", subject);

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, subject);
  assert.notEqual(hash, hashRateLimitSubject("a-different-test-secret-at-least-32", subject));
});

test("chat messages enforce required content and the code-point length limit", () => {
  assert.equal(isValidChatMessage("  "), false);
  assert.equal(isValidChatMessage("Xin chào"), true);
  assert.equal(isValidChatMessage("🙂".repeat(10_000)), true);
  assert.equal(isValidChatMessage("🙂".repeat(10_001)), false);
  assert.equal(isValidChatMessage({ message: "not a string" }), false);
});
