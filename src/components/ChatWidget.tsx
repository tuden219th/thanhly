"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMode = "ai" | "staff";
type ChatStatus = "idle" | "loading" | "ready" | "error" | "offline";
type ChatMessage = {
  id: string;
  sender_kind: "customer" | "staff" | "ai" | "system";
  body: string;
  created_at: string;
};
type GuestSession = { conversationId: string; channel: ChatMode };
type ApiResult<T> = { data?: T; error?: string; code?: string; messageSaved?: boolean };

const statusCopy: Record<ChatStatus, { title: string; detail: string }> = {
  idle: {
    title: "Chọn cách tư vấn",
    detail: "Bạn có thể chọn trợ lý AI hoặc nhân viên cửa hàng.",
  },
  loading: {
    title: "Đang kết nối",
    detail: "Đang chuẩn bị phiên hội thoại an toàn.",
  },
  ready: {
    title: "Đã kết nối chat",
    detail: "Tin nhắn được lưu trong hội thoại này.",
  },
  error: {
    title: "Chưa thể kết nối",
    detail: "Chat đang gặp sự cố. Vui lòng thử lại hoặc gọi cửa hàng.",
  },
  offline: {
    title: "Bạn đang ngoại tuyến",
    detail: "Kiểm tra kết nối mạng rồi thử lại. Tin nhắn chưa gửi sẽ được giữ trong ô nhập.",
  },
};

class ChatRequestError extends Error {
  constructor(
    message: string,
    public readonly messageSaved = false,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } catch {
    if (!navigator.onLine) throw new ChatRequestError("Bạn đang ngoại tuyến.");
    throw new ChatRequestError("Không kết nối được máy chủ chat.");
  } finally {
    window.clearTimeout(timeout);
  }

  const result = (await response.json().catch(() => ({}))) as ApiResult<T> & T;
  if (!response.ok) {
    throw new ChatRequestError(
      result.error || "Chat đang gặp sự cố. Vui lòng thử lại.",
      result.messageSaved === true,
      result.code,
    );
  }
  return result as T;
}

function StatusNotice({ status, detail }: { status: ChatStatus; detail?: string }) {
  const copy = statusCopy[status];
  const isLoading = status === "loading";
  const isError = status === "error" || status === "offline";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`rounded-2xl border p-4 ${
        status === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : status === "offline"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : status === "ready"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-neutral-200 bg-neutral-50 text-neutral-700"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center ${
            isLoading ? "animate-spin rounded-full border-2 border-current border-r-transparent" : ""
          }`}
        >
          {isLoading ? null : status === "error" ? "!" : status === "ready" ? "✓" : "•"}
        </span>
        <div>
          <p className="text-sm font-bold">{copy.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">{detail || copy.detail}</p>
        </div>
      </div>
    </div>
  );
}

function ChoiceIcon({ kind }: { kind: ChatMode }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${
        kind === "ai" ? "bg-[#fff0e2] text-[#b75c25]" : "bg-sky-100 text-sky-700"
      }`}
    >
      {kind === "ai" ? "✦" : "☏"}
    </span>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [statusDetail, setStatusDetail] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uncertainSend, setUncertainSend] = useState<{ message: string; knownIds: Set<string> } | null>(null);
  const [sessionStorageReady, setSessionStorageReady] = useState(false);
  const activeSessionId = useRef<string | null>(null);
  const sessionStorageKey = "thanhly-chat-session-v1";
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const stored = sessionStorage.getItem(sessionStorageKey);
        if (stored) {
          const restored = JSON.parse(stored) as GuestSession;
          if (
            typeof restored.conversationId === "string" &&
            (restored.channel === "ai" || restored.channel === "staff")
          ) {
            const safeSession = { conversationId: restored.conversationId, channel: restored.channel };
            activeSessionId.current = safeSession.conversationId;
            setSession(safeSession);
            setMode(safeSession.channel);
            setStatus("loading");
          } else {
            sessionStorage.removeItem(sessionStorageKey);
          }
        }
      } catch {
        sessionStorage.removeItem(sessionStorageKey);
      } finally {
        setSessionStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!sessionStorageReady) return;
    try {
      if (session) sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
      else sessionStorage.removeItem(sessionStorageKey);
    } catch {
      // Chat continues for this page view when browser storage is unavailable.
    }
  }, [session, sessionStorageReady]);

  useEffect(() => {
    if (!open || !mode) return;
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, mode, open]);

  const resetExpiredSession = useCallback(() => {
    activeSessionId.current = null;
    setSession(null);
    setMode(null);
    setMessages([]);
    setDraft("");
    setStatus("idle");
    setStatusDetail("Phiên chat đã hết hạn hoặc không còn hợp lệ. Hãy chọn cách tư vấn để bắt đầu phiên mới.");
  }, []);

  const loadMessages = useCallback(async (currentSession: GuestSession) => {
    const response = await requestJson<{
      conversation: { channel: ChatMode; status: string };
      messages: ChatMessage[];
    }>(`/api/chat/sessions/${currentSession.conversationId}/messages`, {
    });
    if (activeSessionId.current !== currentSession.conversationId) return;
    setMessages((current) => {
      const next = response.messages;
      return current.length === next.length && current.every((message, index) =>
        message.id === next[index]?.id && message.body === next[index]?.body &&
        message.sender_kind === next[index]?.sender_kind && message.created_at === next[index]?.created_at,
      ) ? current : next;
    });
    setMode(response.conversation.channel);
    setSession((existing) => {
      if (
        existing?.conversationId === currentSession.conversationId &&
        existing.channel === response.conversation.channel
      ) {
        return existing;
      }
      return { ...currentSession, channel: response.conversation.channel };
    });
    return response.messages;
  }, []);

  useEffect(() => {
    if (!open || !session) return;
    let active = true;

    const refresh = async () => {
      try {
        await loadMessages(session);
        if (active) {
          setStatus("ready");
          setStatusDetail("");
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof ChatRequestError && error.code === "invalid_chat_session") {
          resetExpiredSession();
          return;
        }
        setStatus(!navigator.onLine ? "offline" : "error");
        setStatusDetail(error instanceof Error ? error.message : statusCopy.error.detail);
      }
    };

    let timeout: number | undefined;
    const poll = async () => {
      if (!active) return;
      if (document.visibilityState === "visible") await refresh();
      if (active) timeout = window.setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      active = false;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [loadMessages, open, resetExpiredSession, session]);

  async function chooseMode(nextMode: ChatMode) {
    setMode(nextMode);
    setStatus("loading");
    setStatusDetail("");

    try {
      if (session && nextMode === "staff" && session.channel === "ai") {
        await requestJson(`/api/chat/sessions/${session.conversationId}/handoff`, {
          method: "POST",
        });
        const handedOff = { ...session, channel: "staff" as const };
        setSession(handedOff);
        await loadMessages(handedOff);
      } else if (session && session.channel === nextMode) {
        await loadMessages(session);
      } else {
        const created = await requestJson<GuestSession>("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: nextMode }),
        });
        activeSessionId.current = created.conversationId;
        setSession(created);
        setMessages([]);
      }
      setStatus("ready");
    } catch (error) {
      if (error instanceof ChatRequestError && error.code === "invalid_chat_session") {
        resetExpiredSession();
        return;
      }
      setStatus(!navigator.onLine ? "offline" : "error");
      setStatusDetail(error instanceof Error ? error.message : statusCopy.error.detail);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !draft.trim() || sending || status !== "ready") return;

    const message = draft.trim();
    const knownIds = new Set(messages.map((item) => item.id));
    setSending(true);
    setStatusDetail("");
    try {
      await requestJson(`/api/chat/sessions/${session.conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      }, 40_000);
      setDraft("");
      await loadMessages(session);
      setStatus("ready");
    } catch (error) {
      if (error instanceof ChatRequestError && error.code === "invalid_chat_session") {
        resetExpiredSession();
        return;
      }
      let confirmedSaved = error instanceof ChatRequestError && error.messageSaved;
      try {
        const refreshed = (await loadMessages(session)) ?? [];
        confirmedSaved ||= refreshed.some(
          (item) => item.sender_kind === "customer" && item.body === message && !knownIds.has(item.id),
        );
      } catch {
        // Keep the draft and block another send until the visitor checks the saved history.
      }
      if (confirmedSaved) {
        setDraft("");
        setUncertainSend(null);
      } else {
        setUncertainSend({ message, knownIds });
      }
      setStatus(!navigator.onLine ? "offline" : "error");
      setStatusDetail(error instanceof Error ? error.message : statusCopy.error.detail);
    } finally {
      setSending(false);
    }
  }

  async function retryConnection() {
    if (!session) return;
    setStatus("loading");
    setStatusDetail("");
    try {
      const refreshed = (await loadMessages(session)) ?? [];
      if (uncertainSend) {
        const found = refreshed.some(
          (item) => item.sender_kind === "customer" && item.body === uncertainSend.message && !uncertainSend.knownIds.has(item.id),
        );
        if (found) {
          setDraft("");
          setUncertainSend(null);
        } else {
          setStatusDetail("Chưa thấy tin trong lịch sử. Hãy chờ vài giây kiểm tra lại hoặc chủ động cho phép gửi lại.");
        }
      }
      setStatus("ready");
    } catch (error) {
      if (error instanceof ChatRequestError && error.code === "invalid_chat_session") {
        resetExpiredSession();
        return;
      }
      setStatus(!navigator.onLine ? "offline" : "error");
      setStatusDetail(error instanceof Error ? error.message : statusCopy.error.detail);
    }
  }

  function closeChat() {
    setOpen(false);
  }

  const waitingForBackend = !session || status !== "ready" || Boolean(uncertainSend);

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {open && (
        <section
          id="site-chat-panel"
          aria-label="Chat tư vấn Thanh Lý Từ Đến"
          className="fixed inset-x-3 bottom-[5.25rem] flex max-h-[min(680px,calc(100dvh-7rem))] min-h-[min(420px,calc(100dvh-7rem))] flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-white text-[#24231f] shadow-2xl shadow-black/20 sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[400px]"
        >
          <header className="flex items-center gap-3 bg-[#25231f] px-4 py-4 text-white">
            {mode ? (
              <button
                type="button"
                onClick={() => setMode(null)}
                aria-label="Quay lại chọn cách tư vấn"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
              >
                ←
              </button>
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#c96a2b] text-xl">
                ☎
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">
                {mode === "ai"
                  ? "Trợ lý AI"
                  : mode === "staff"
                    ? "Nhân viên tư vấn"
                    : "Từ Đến tư vấn"}
              </p>
              <p className="mt-0.5 text-xs text-white/65">
                Thanh lý minh bạch · Nghĩa Đô
              </p>
            </div>
            <button
              type="button"
              onClick={closeChat}
              aria-label="Đóng cửa sổ chat"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              ×
            </button>
          </header>

          {!mode ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-5">
              <div className="mb-5">
                <p className="text-lg font-bold">Bạn muốn được hỗ trợ thế nào?</p>
                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  Chọn một cách tư vấn để bắt đầu.
                </p>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void chooseMode("ai")}
                  disabled={status === "loading"}
                  className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 p-4 text-left transition hover:border-[#c96a2b]/50 hover:bg-[#fffaf6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c96a2b] disabled:cursor-wait disabled:opacity-60"
                >
                  <ChoiceIcon kind="ai" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">Trợ lý AI</span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500">
                      Hỏi về hàng thanh lý hoặc trò chuyện tổng quát.
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-neutral-400">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => void chooseMode("staff")}
                  disabled={status === "loading"}
                  className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 p-4 text-left transition hover:border-sky-300 hover:bg-sky-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-wait disabled:opacity-60"
                >
                  <ChoiceIcon kind="staff" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">Nhân viên tư vấn</span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500">
                      Trao đổi trực tiếp với nhân viên cửa hàng.
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-neutral-400">›</span>
                </button>
              </div>
              <div className="mt-auto pt-5">
                <StatusNotice status={status} detail={statusDetail || undefined} />
              </div>
            </div>
          ) : (
            <>
              <div ref={messageListRef} className="flex-1 space-y-4 overflow-y-auto overscroll-contain scroll-smooth bg-[#f8f7f4] p-4 [scrollbar-gutter:stable]">
                {messages.length === 0 && status === "ready" && (
                  <div className="rounded-2xl border border-white bg-white p-4 text-sm leading-6 text-neutral-600 shadow-sm">
                    {mode === "ai"
                      ? "Hãy đặt câu hỏi. Trợ lý chỉ tư vấn giá và số lượng khi dữ liệu sản phẩm xác nhận được."
                      : "Tin nhắn của bạn sẽ vào hàng chờ để nhân viên được phân công tiếp nhận."}
                  </div>
                )}
                {messages.map((message) => {
                  const mine = message.sender_kind === "customer";
                  const sender = message.sender_kind === "ai"
                    ? "Trợ lý AI"
                    : message.sender_kind === "staff"
                      ? "Nhân viên tư vấn"
                      : message.sender_kind === "system"
                        ? "Thông báo"
                        : "Bạn";
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${mine ? "rounded-br-md bg-[#c96a2b] text-white" : "rounded-bl-md border border-white bg-white text-[#24231f]"}`}>
                        <p className={`mb-1 text-[11px] font-bold ${mine ? "text-white/70" : "text-neutral-400"}`}>{sender}</p>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                      </div>
                    </div>
                  );
                })}
                {status !== "ready" && <StatusNotice status={status} detail={statusDetail || undefined} />}
                {session && status !== "ready" && status !== "loading" && (
                  <button
                    type="button"
                    onClick={() => void retryConnection()}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c96a2b]"
                  >
                    {uncertainSend ? "Kiểm tra tin nhắn đã gửi" : "Thử kết nối lại"}
                  </button>
                )}
                {uncertainSend && (
                  <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    Chưa xác nhận được tin nhắn đã lưu hay chưa. Chat đang khóa gửi lại để tránh trùng tin.
                    <button type="button" onClick={() => setUncertainSend(null)} className="ml-1 font-bold underline">Cho phép gửi lại</button>
                  </p>
                )}
              </div>
              {mode === "ai" && session?.channel === "ai" && (
                <div className="border-t border-neutral-100 bg-white px-3 pt-3">
                  <button
                    type="button"
                    disabled={status === "loading"}
                    onClick={() => void chooseMode("staff")}
                    className="w-full rounded-xl border border-[#c96a2b]/25 bg-[#fffaf6] px-4 py-2.5 text-sm font-bold text-[#a94f1f] transition hover:bg-[#fff2e7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c96a2b] disabled:opacity-60"
                  >
                    Gặp nhân viên tư vấn
                  </button>
                </div>
              )}
              <form className="border-t border-neutral-200 bg-white p-3" onSubmit={(event) => void sendMessage(event)}>
                <label className="sr-only" htmlFor="chat-message">Tin nhắn</label>
                <div className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-2">
                  <textarea
                    id="chat-message"
                    rows={1}
                    maxLength={10_000}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={waitingForBackend || sending}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={waitingForBackend ? "Đang chờ kết nối chat" : "Nhập tin nhắn…"}
                    className="max-h-24 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-neutral-700 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={waitingForBackend || sending || !draft.trim()}
                    aria-label="Gửi tin nhắn"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c96a2b] text-white transition hover:bg-[#ad5724] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                  >
                    {sending ? "…" : "↑"}
                  </button>
                </div>
                <p className="mt-2 px-1 text-[11px] leading-4 text-neutral-400">
                  Không gửi mật khẩu, mã xác thực hoặc thông tin thanh toán trong chat.
                </p>
              </form>
            </>
          )}
        </section>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-controls="site-chat-panel"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 items-center gap-2 rounded-full bg-[#c96a2b] px-5 text-sm font-bold text-white shadow-xl shadow-[#7e3f1d]/30 transition hover:bg-[#ad5724] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c96a2b]"
      >
        <span aria-hidden="true" className="text-lg">{open ? "×" : "☏"}</span>
        {open ? "Đóng chat" : "Chat tư vấn"}
      </button>
    </div>
  );
}
