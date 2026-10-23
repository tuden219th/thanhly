import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";
import {
  hashGuestToken,
  hashRateLimitSubject,
  guestSessionMatchesConversation,
  isValidChatMessage,
  isValidGuestToken,
} from "@/lib/chat/security.mjs";

export class ChatHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ChatHttpError";
  }
}

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new ChatHttpError(
      "Máy chủ chat chưa được cấu hình Supabase.",
      503,
      "chat_not_configured",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ChatHttpError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { error: "Chat đang gặp sự cố. Vui lòng thử lại sau.", code: "chat_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ChatHttpError("Yêu cầu không hợp lệ.", 403, "invalid_origin");
  }
}

export async function readJsonBody<T>(request: Request, maxBytes = 48_000): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ChatHttpError("Định dạng yêu cầu không hợp lệ.", 415, "invalid_content_type");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new ChatHttpError("Nội dung yêu cầu quá lớn.", 413, "request_too_large");
  }

  if (!request.body) {
    throw new ChatHttpError("Nội dung yêu cầu bị thiếu.", 400, "invalid_body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ChatHttpError("Nội dung yêu cầu quá lớn.", 413, "request_too_large");
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ChatHttpError("Nội dung JSON không hợp lệ.", 400, "invalid_json");
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof ChatHttpError) throw error;
    throw new ChatHttpError("Nội dung JSON không hợp lệ.", 400, "invalid_json");
  }
}

export async function getRateLimitSubjectHash(request: Request): Promise<string> {
  const secret = process.env.CHAT_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) {
    throw new ChatHttpError(
      "Máy chủ chat chưa được cấu hình giới hạn truy cập.",
      503,
      "chat_not_configured",
    );
  }

  const address = request.headers.get("x-real-ip") ??
    (process.env.NODE_ENV === "development" ? "127.0.0.1" : "");
  if (!address || isIP(address) === 0) {
    throw new ChatHttpError(
      "Máy chủ chưa nhận diện được địa chỉ kết nối an toàn.",
      503,
      "rate_limit_unavailable",
    );
  }

  return hashRateLimitSubject(secret, address);
}

export async function consumeRateLimit(
  admin: ReturnType<typeof getAdminClient>,
  subjectHash: string,
  bucket: "session_create" | "guest_message" | "ai_reply" | "handoff",
  maxRequests: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await admin.rpc("chat_consume_rate_limit", {
    p_subject_hash: subjectHash,
    p_bucket: bucket,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error || typeof data !== "boolean") {
    throw new ChatHttpError("Chưa thể kiểm tra giới hạn truy cập.", 503, "rate_limit_unavailable");
  }
  if (!data) {
    throw new ChatHttpError("Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau.", 429, "rate_limited");
  }
}

export type VerifiedGuestSession = {
  conversationId: string;
  tokenHash: string;
};

export async function verifyGuestSession(
  admin: ReturnType<typeof getAdminClient>,
  request: Request,
  conversationId: string,
): Promise<VerifiedGuestSession> {
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)?.[1];
  const cookieName = `chat_session_${conversationId}`;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  const cookieToken = cookie?.slice(cookieName.length + 1);
  const token = bearerToken ?? cookieToken ?? "";
  if (!isValidGuestToken(token)) {
    throw new ChatHttpError("Phiên chat không hợp lệ hoặc đã hết hạn.", 401, "invalid_chat_session");
  }

  const tokenHash = hashGuestToken(token);
  const { data, error } = await admin
    .from("chat_guest_sessions")
    .select("conversation_id, expires_at")
    .eq("token_hash", tokenHash)
    .eq("conversation_id", conversationId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new ChatHttpError("Chưa thể xác minh phiên chat.", 503, "chat_unavailable");
  }
  if (!data || !guestSessionMatchesConversation(data.conversation_id, conversationId)) {
    throw new ChatHttpError("Phiên chat không hợp lệ hoặc đã hết hạn.", 401, "invalid_chat_session");
  }

  return { conversationId: data.conversation_id, tokenHash };
}

export function validateMessage(value: unknown): string {
  if (!isValidChatMessage(value)) {
    throw new ChatHttpError("Tin nhắn cần có từ 1 đến 10.000 ký tự.", 400, "invalid_message");
  }
  return value.trim();
}
