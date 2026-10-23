import { createGroundedAiReply } from "@/lib/chat/ai";
import {
  ChatHttpError,
  consumeRateLimit,
  errorResponse,
  getAdminClient,
  readJsonBody,
  requireSameOrigin,
  validateMessage,
  verifyGuestSession,
} from "@/lib/chat/server";

type RouteContext = { params: Promise<{ id: string }> };

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!validId(id)) throw new ChatHttpError("Không tìm thấy hội thoại.", 404, "not_found");
    const admin = getAdminClient();
    const session = await verifyGuestSession(admin, request, id);
    await consumeRateLimit(admin, session.tokenHash, "guest_message", 60, 60);

    const [{ data: conversation, error: conversationError }, { data: messages, error: messagesError }] =
      await Promise.all([
        admin.from("chat_conversations").select("id, channel, status").eq("id", id).maybeSingle(),
        admin
          .from("chat_messages")
          .select("id, sender_kind, body, created_at")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true })
          .limit(100),
      ]);

    if (conversationError || messagesError || !conversation) {
      throw new ChatHttpError("Chưa thể tải hội thoại.", 503, "chat_unavailable");
    }

    return Response.json(
      { conversation, messages: messages ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    if (!validId(id)) throw new ChatHttpError("Không tìm thấy hội thoại.", 404, "not_found");
    const body = await readJsonBody<{ message?: unknown }>(request);
    const message = validateMessage(body.message);
    const admin = getAdminClient();
    const session = await verifyGuestSession(admin, request, id);
    await consumeRateLimit(admin, session.tokenHash, "guest_message", 30, 60);

    const { data: conversation, error: conversationError } = await admin
      .from("chat_conversations")
      .select("id, channel, status")
      .eq("id", session.conversationId)
      .maybeSingle();
    if (conversationError || !conversation) {
      throw new ChatHttpError("Không tìm thấy hội thoại.", 404, "not_found");
    }
    if (conversation.status === "closed") {
      throw new ChatHttpError("Hội thoại đã đóng.", 409, "conversation_closed");
    }

    const { data: customerMessage, error: customerError } = await admin
      .from("chat_messages")
      .insert({ conversation_id: session.conversationId, sender_kind: "customer", body: message })
      .select("id, sender_kind, body, created_at")
      .single();
    if (customerError || !customerMessage) {
      throw new ChatHttpError("Chưa lưu được tin nhắn. Vui lòng thử lại.", 503, "message_not_saved");
    }

    let aiReply: string | null = null;
    if (conversation.channel === "ai") {
      try {
        await consumeRateLimit(admin, session.tokenHash, "ai_reply", 12, 3600);
        const { data: history, error: historyError } = await admin
          .from("chat_messages")
          .select("sender_kind, body")
          .eq("conversation_id", session.conversationId)
          .order("created_at", { ascending: false })
          .limit(13);
        if (historyError) throw new ChatHttpError("Chưa thể tải ngữ cảnh hội thoại.", 503, "chat_unavailable");

        aiReply = await createGroundedAiReply(
          admin,
          (history ?? []).reverse().slice(-12),
        );
      } catch (error) {
        const response = error instanceof ChatHttpError ? error.message : "Trợ lý AI đang gặp sự cố.";
        return Response.json(
          {
            error: `${response} Tin nhắn của bạn đã được lưu; hãy chuyển sang nhân viên tư vấn hoặc chờ thử lại.`,
            code: error instanceof ChatHttpError ? error.code : "ai_unavailable",
            messageSaved: true,
          },
          { status: error instanceof ChatHttpError ? error.status : 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    if (aiReply) {
      const { error: aiMessageError } = await admin.from("chat_messages").insert({
        conversation_id: session.conversationId,
        sender_kind: "ai",
        body: aiReply,
      });
      if (aiMessageError) {
        return Response.json(
          {
            error: "Tin nhắn đã được lưu nhưng chưa lưu được câu trả lời AI. Bạn có thể chuyển sang nhân viên tư vấn.",
            code: "ai_reply_not_saved",
            messageSaved: true,
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    return Response.json(
      { message: customerMessage, aiReplyCreated: Boolean(aiReply) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
