"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Conversation = {
  id: string;
  channel: "ai" | "staff";
  status: "waiting" | "in_progress" | "closed";
  assigned_staff_id: string | null;
  created_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_kind: "customer" | "staff" | "ai" | "system";
  sender_user_id: string | null;
  body: string;
  created_at: string;
};

type StatusFilter = "waiting" | "in_progress" | "closed";

const statusLabel: Record<StatusFilter, string> = {
  waiting: "Đang chờ",
  in_progress: "Đang xử lý",
  closed: "Đã đóng",
};

export default function StaffInboxPage() {
  const router = useRouter();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("waiting");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uncertainReply, setUncertainReply] = useState<{ body: string; knownIds: Set<string> } | null>(null);
  const [error, setError] = useState("");

  const loadConversations = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("chat_conversations")
      .select("id, channel, status, assigned_staff_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (queryError) throw queryError;
    const rows = (data ?? []) as Conversation[];
    rows.sort((a, b) => {
      const waitingDifference = Number(b.status === "waiting") - Number(a.status === "waiting");
      return waitingDifference || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setConversations((current) => current.length === rows.length && current.every((item, index) => {
      const next = rows[index];
      return item.id === next.id && item.status === next.status &&
        item.assigned_staff_id === next.assigned_staff_id && item.created_at === next.created_at &&
        item.channel === next.channel;
    }) ? current : rows);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: queryError } = await supabase
      .from("chat_messages")
      .select("id, conversation_id, sender_kind, sender_user_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (queryError) throw queryError;
    const rows = (data ?? []) as Message[];
    setMessages((current) => current.length === rows.length && current.every((item, index) => {
      const next = rows[index];
      return item.id === next.id && item.body === next.body && item.sender_kind === next.sender_kind &&
        item.sender_user_id === next.sender_user_id && item.created_at === next.created_at;
    }) ? current : rows);
    return rows;
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) {
          router.replace("/quanly/login");
          return;
        }

        const { data: staff, error: staffError } = await supabase
          .from("chat_staff")
          .select("user_id")
          .eq("user_id", data.user.id)
          .eq("is_active", true)
          .maybeSingle();
        if (staffError) throw staffError;
        if (!staff) {
          setError("Tài khoản này chưa được cấp quyền hộp thư tư vấn.");
          return;
        }

        if (!active) return;
        setStaffId(data.user.id);
        setAuthorized(true);
        await loadConversations();
      } catch {
        if (active) setError("Chưa tải được hộp thư. Kiểm tra cấu hình Supabase và migration chat.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [loadConversations, router]);

  useEffect(() => {
    if (!authorized) return;
    let active = true;

    let timeout: number | undefined;
    const refreshInbox = async () => {
      try {
        if (document.visibilityState === "visible") await loadConversations();
      } catch {
        if (active) setError("Mất kết nối tới danh sách hội thoại. Đang thử cập nhật lại.");
      }
      if (active) timeout = window.setTimeout(() => void refreshInbox(), 15_000);
    };

    timeout = window.setTimeout(() => void refreshInbox(), 15_000);
    return () => {
      active = false;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [authorized, loadConversations]);

  const selectedConversationId = selected?.id;

  useEffect(() => {
    if (!authorized || !selectedConversationId) return;
    let active = true;
    let timeout: number | undefined;
    const poll = async () => {
      if (!active) return;
      try {
        const [conversationResult, messagesResult] = document.visibilityState === "visible" ? await Promise.all([
          supabase
            .from("chat_conversations")
            .select("id, channel, status, assigned_staff_id, created_at")
            .eq("id", selectedConversationId)
            .maybeSingle(),
          supabase
            .from("chat_messages")
            .select("id, conversation_id, sender_kind, sender_user_id, body, created_at")
            .eq("conversation_id", selectedConversationId)
            .order("created_at", { ascending: true })
            .limit(200),
        ]) : [null, null];
        if (!active) return;
        if (conversationResult?.error || messagesResult?.error) {
          throw conversationResult?.error ?? messagesResult?.error;
        }
        if (conversationResult?.data) {
          const next = conversationResult.data as Conversation;
          setSelected((current) => current && current.id === next.id && current.status === next.status &&
            current.assigned_staff_id === next.assigned_staff_id && current.channel === next.channel &&
            current.created_at === next.created_at ? current : next);
        }
        if (messagesResult?.data) {
          const rows = messagesResult.data as Message[];
          setMessages((current) => current.length === rows.length && current.every((item, index) => {
            const next = rows[index];
            return item.id === next.id && item.body === next.body && item.sender_kind === next.sender_kind &&
              item.sender_user_id === next.sender_user_id && item.created_at === next.created_at;
          }) ? current : rows);
        }
      } catch {
        if (active) setError("Mất kết nối tới hộp thư. Đang thử cập nhật lại.");
      }
      if (active) timeout = window.setTimeout(() => void poll(), 5_000);
    };

    void poll();
    return () => {
      active = false;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [authorized, selectedConversationId]);

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.status === filter),
    [conversations, filter],
  );

  async function selectConversation(conversation: Conversation) {
    setError("");
    try {
      if (!conversation.assigned_staff_id) {
        const { data: claimed, error: claimError } = await supabase.rpc(
          "chat_claim_conversation",
          { p_conversation_id: conversation.id },
        );
        if (claimError) throw claimError;
        if (!claimed) {
          throw new Error("Hội thoại vừa được một nhân viên khác tiếp nhận.");
        }
      }

      const activeConversation = conversation.assigned_staff_id
        ? conversation
        : { ...conversation, assigned_staff_id: staffId, status: "in_progress" as const };
      setSelected(activeConversation);
      await loadMessages(conversation.id);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa mở được hội thoại.");
      await loadConversations().catch(() => undefined);
    }
  }

  async function changeStatus(status: StatusFilter) {
    if (!selected) return;
    setError("");
    const { data, error: updateError } = await supabase
      .from("chat_conversations")
      .update({ status })
      .eq("id", selected.id)
      .select("id, channel, status, assigned_staff_id, created_at")
      .maybeSingle();
    if (updateError || !data) {
      setError("Không đổi được trạng thái. Kiểm tra quyền phân công hội thoại.");
      return;
    }
    setSelected(data as Conversation);
    setConversations((current) => current.map((item) => item.id === data.id ? data as Conversation : item));
  }

  async function sendReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !staffId || !draft.trim() || sending || uncertainReply || selected.status === "closed") return;

    const body = draft.trim();
    const knownIds = new Set(messages.map((message) => message.id));
    setSending(true);
    setError("");
    try {
      const { error: insertError } = await supabase.from("chat_messages").insert({
        conversation_id: selected.id,
        sender_kind: "staff",
        sender_user_id: staffId,
        body,
      });
      if (insertError) {
        setUncertainReply({ body, knownIds });
        setError("Chưa xác nhận được tin nhắn. Kiểm tra lịch sử trước khi gửi lại để tránh trùng tin.");
      } else {
        setUncertainReply(null);
        setDraft("");
        await loadMessages(selected.id);
        await loadConversations();
      }
    } catch {
      setUncertainReply({ body, knownIds });
      setError("Mất kết nối nên chưa xác nhận được tin nhắn. Kiểm tra lịch sử trước khi gửi lại để tránh trùng tin.");
    } finally {
      setSending(false);
    }
  }

  async function checkReplyStatus() {
    if (!selected || !uncertainReply) return;
    setError("");
    try {
      const rows = await loadMessages(selected.id);
      const found = rows.some(
        (message) => message.sender_kind === "staff" && message.sender_user_id === staffId &&
          message.body === uncertainReply.body && !uncertainReply.knownIds.has(message.id),
      );
      if (found) {
        setDraft("");
        setUncertainReply(null);
        setError("Tin nhắn đã được gửi thành công.");
      } else {
        setError("Chưa thấy tin nhắn trong lịch sử. Đợi vài giây rồi kiểm tra lại trước khi cho phép gửi lại.");
      }
    } catch {
      setError("Chưa tải được lịch sử để xác nhận. Vui lòng thử kiểm tra lại.");
    }
  }

  const visibleMessages = messages;

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-[#24231f]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4">
          <Link href="/quanly" className="text-lg font-bold tracking-tight">
            <span className="text-[#c96a2b]">Từ Đến</span> · Hộp thư tư vấn
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/quanly" className="text-neutral-500 hover:text-[#c96a2b]">Quản lý sản phẩm</Link>
            <Link href="/" className="text-neutral-500 hover:text-[#c96a2b]">Xem website</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-10">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c96a2b]">Khu vực nhân viên</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Hộp thư tư vấn</h1>
          <p className="mt-2 text-sm text-neutral-500">Danh sách cập nhật định kỳ; nhân viên chỉ xem hội thoại được phân công và hàng chờ chung.</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-500">Đang xác minh quyền nhân viên…</div>
        ) : !authorized ? (
          <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <h2 className="font-bold">Không có quyền truy cập hộp thư</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">Chỉ tài khoản đã đăng nhập và được thêm vào danh sách nhân viên chat mới xem được hội thoại.</p>
            <Link href="/quanly" className="mt-4 inline-flex rounded-xl bg-[#c96a2b] px-4 py-2.5 text-sm font-bold text-white">Quay lại quản lý</Link>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="flex gap-1 border-b border-neutral-100 p-2">
                {(Object.keys(statusLabel) as StatusFilter[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilter(status)}
                    className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${filter === status ? "bg-[#fff2e7] text-[#a94f1f]" : "text-neutral-500 hover:bg-neutral-50"}`}
                  >
                    {statusLabel[status]}
                  </button>
                ))}
              </div>
              <div className="max-h-[360px] overflow-y-auto lg:max-h-[680px]">
                {visibleConversations.length === 0 ? (
                  <p className="p-6 text-center text-sm text-neutral-500">Không có hội thoại trong mục này.</p>
                ) : visibleConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => void selectConversation(conversation)}
                    className={`w-full border-b border-neutral-100 p-4 text-left transition hover:bg-neutral-50 ${selected?.id === conversation.id ? "bg-[#fffaf6]" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{conversation.channel === "ai" ? "Hội thoại trợ lý AI" : "Khách cần tư vấn"}</span>
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-600">{conversation.assigned_staff_id ? "Đã nhận" : "Hàng chờ"}</span>
                    </span>
                    <span className="mt-1 block text-xs text-neutral-400">{new Date(conversation.created_at).toLocaleString("vi-VN")}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              {!selected ? (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-neutral-500">Chọn một hội thoại bên trái để xem nội dung.</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 p-4">
                    <div>
                      <h2 className="font-bold">{selected.channel === "ai" ? "Hội thoại trợ lý AI" : "Khách tư vấn"}</h2>
                      <p className="mt-1 text-xs text-neutral-500">{statusLabel[selected.status]} · {selected.assigned_staff_id === staffId ? "Đang phân công cho bạn" : "Hàng chờ"}</p>
                    </div>
                    <div className="flex gap-2">
                      {selected.status !== "closed" && (
                        <button type="button" onClick={() => void changeStatus("closed")} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50">Đóng hội thoại</button>
                      )}
                      {selected.status === "closed" && (
                        <button type="button" onClick={() => void changeStatus("in_progress")} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50">Mở lại</button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto bg-[#f8f7f4] p-4">
                    {visibleMessages.length === 0 ? (
                      <p className="rounded-xl bg-white p-4 text-sm text-neutral-500">Chưa có tin nhắn.</p>
                    ) : visibleMessages.map((message) => {
                      const label = message.sender_kind === "customer"
                        ? "Khách"
                        : message.sender_kind === "ai"
                          ? "Trợ lý AI"
                          : message.sender_kind === "staff"
                            ? message.sender_user_id === staffId ? "Bạn" : "Nhân viên"
                            : "Thông báo";
                      return (
                        <article key={message.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-bold text-[#a94f1f]">{label}</span>
                            <time className="text-neutral-400">{new Date(message.created_at).toLocaleString("vi-VN")}</time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                        </article>
                      );
                    })}
                  </div>
                  <form onSubmit={(event) => void sendReply(event)} className="border-t border-neutral-200 p-3">
                    {selected.status === "closed" ? (
                      <p className="px-2 py-3 text-sm text-neutral-500">Hội thoại đã đóng. Mở lại để tiếp tục trả lời.</p>
                    ) : selected.assigned_staff_id !== staffId ? (
                      <p className="px-2 py-3 text-sm text-neutral-500">Nhận hội thoại từ hàng chờ để gửi trả lời.</p>
                    ) : (
                      <div className="space-y-2">
                        {uncertainReply && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                            Chưa xác nhận được tin đã lưu. Kiểm tra lịch sử trước khi gửi lại.
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="button" onClick={() => void checkReplyStatus()} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold">Kiểm tra tin nhắn</button>
                              <button type="button" onClick={() => setUncertainReply(null)} className="rounded-lg px-3 py-1.5 font-semibold underline">Cho phép gửi lại</button>
                            </div>
                          </div>
                        )}
                      <div className="flex items-end gap-2">
                        <textarea
                          rows={2}
                          maxLength={10_000}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          placeholder="Nhập nội dung trả lời…"
                          className="min-h-12 flex-1 resize-y rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#c96a2b]"
                        />
                        <button type="submit" disabled={sending || Boolean(uncertainReply) || !draft.trim()} className="rounded-xl bg-[#c96a2b] px-4 py-3 text-sm font-bold text-white hover:bg-[#ad5724] disabled:opacity-50">{sending ? "Đang gửi…" : "Gửi"}</button>
                      </div>
                      </div>
                    )}
                  </form>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
