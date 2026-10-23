import {
  ChatHttpError,
  consumeRateLimit,
  errorResponse,
  getAdminClient,
  requireSameOrigin,
  verifyGuestSession,
} from "@/lib/chat/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ChatHttpError("Không tìm thấy hội thoại.", 404, "not_found");
    }

    const admin = getAdminClient();
    const session = await verifyGuestSession(admin, request, id);
    await consumeRateLimit(admin, session.tokenHash, "handoff", 5, 3600);

    const { data: current, error: readError } = await admin
      .from("chat_conversations")
      .select("channel, status")
      .eq("id", session.conversationId)
      .maybeSingle();
    if (readError || !current) throw new ChatHttpError("Không tìm thấy hội thoại.", 404, "not_found");
    if (current.status === "closed") throw new ChatHttpError("Hội thoại đã đóng.", 409, "conversation_closed");

    if (current.channel !== "staff") {
      const { error } = await admin
        .from("chat_conversations")
        .update({ channel: "staff", status: "waiting", assigned_staff_id: null })
        .eq("id", session.conversationId)
        .eq("channel", "ai");
      if (error) throw new ChatHttpError("Chưa thể chuyển hội thoại cho nhân viên.", 503, "handoff_unavailable");
    }

    return Response.json(
      { conversationId: session.conversationId, channel: "staff", status: "waiting" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
