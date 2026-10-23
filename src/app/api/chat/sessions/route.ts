import {
  ChatHttpError,
  consumeRateLimit,
  errorResponse,
  getAdminClient,
  getRateLimitSubjectHash,
  readJsonBody,
  requireSameOrigin,
} from "@/lib/chat/server";
import { createGuestToken, hashGuestToken } from "@/lib/chat/security.mjs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody<{ channel?: unknown }>(request, 2_000);
    if (body.channel !== "ai" && body.channel !== "staff") {
      throw new ChatHttpError("Chọn Trợ lý AI hoặc Nhân viên tư vấn.", 400, "invalid_channel");
    }

    const admin = getAdminClient();
    const ipHash = await getRateLimitSubjectHash(request);
    await consumeRateLimit(admin, ipHash, "session_create", 8, 3600);

    const token = createGuestToken();
    const tokenHash = hashGuestToken(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: conversationId, error } = await admin.rpc(
      "chat_create_guest_conversation",
      {
        p_channel: body.channel,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      },
    );

    if (error || typeof conversationId !== "string") {
      throw new ChatHttpError("Chưa thể tạo phiên chat.", 503, "chat_unavailable");
    }

    const cookieName = `chat_session_${conversationId}`;
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return Response.json(
      { conversationId, channel: body.channel, expiresAt },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": `${cookieName}=${token}; Path=/api/chat/sessions/${conversationId}; Max-Age=1209600; HttpOnly; SameSite=Lax${secure}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
