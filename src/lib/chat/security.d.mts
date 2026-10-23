export function createGuestToken(): string;
export function hashGuestToken(token: string): string;
export function hashRateLimitSubject(secret: string, subject: string): string;
export function isValidGuestToken(token: string): boolean;
export function tokenMatchesHash(token: string, storedHash: string): boolean;
export function guestSessionMatchesConversation(
  sessionConversationId: string,
  requestedConversationId: string,
): boolean;
export function isValidChatMessage(value: unknown): value is string;
