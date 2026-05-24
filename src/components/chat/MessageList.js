import React, { useRef, useEffect, useState, useCallback } from "react";
import { useCustomers } from "../../context/CustomerContext";
import { useChat } from "../../context/ChatContext";
import { useChatActions } from "../../hooks/useChatActions";

// ── date helpers ──────────────────────────────────────────────────────────────
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// ── sub-components ────────────────────────────────────────────────────────────
function DateSeparator({ ts }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>
        {formatDateLabel(ts)}
      </div>
      <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
    </div>
  );
}

function MessageBubble({ msg, customerName, isLongPressed, copied, onLongPressStart, onLongPressEnd, onCopy, onDelete }) {
  const isCustomer = msg.role === "customer";
  const isSent     = msg.sent && msg.sent !== "NOT_SENT";
  const isNotSent  = msg.sent === "NOT_SENT";
  const display    = isSent && msg.sent !== msg.content ? msg.sent : msg.content;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isCustomer ? "flex-start" : "flex-end", gap: 2 }}>
      {/* sender + time */}
      <div style={{ fontSize: 10, color: "#CBD5E1", display: "flex", gap: 4 }}>
        <span>{isCustomer ? `👤 ${customerName}` : "You"}</span>
        <span>·</span>
        <span>{formatTime(msg.ts)}</span>
      </div>

      {/* bubble */}
      <div
        onMouseDown={() => onLongPressStart(msg.id)}
        onMouseUp={onLongPressEnd}
        onMouseLeave={onLongPressEnd}
        onTouchStart={() => onLongPressStart(msg.id)}
        onTouchEnd={onLongPressEnd}
        style={{
          maxWidth: "84%",
          padding: "10px 13px",
          fontSize: 13.5,
          lineHeight: 1.7,
          whiteSpace: "pre-line",
          borderRadius: isCustomer ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
          background: isCustomer ? "#F1F5F9" : "#6366F1",
          color: isCustomer ? "#334155" : "#fff",
          border: isCustomer ? "1px solid #E2E8F0" : "none",
          opacity: isNotSent ? 0.45 : 1,
          cursor: "pointer",
          userSelect: "none",
          WebkitUserSelect: "none",
          transition: "opacity 0.15s",
        }}>
        {display}
      </div>

      {/* context menu */}
      {isLongPressed && (
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(display, msg.id); }}
            style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: "1px solid #E2E8F0",
              background: copied === msg.id ? "#ECFDF5" : "#F8FAFC",
              color: copied === msg.id ? "#059669" : "#475569",
            }}>
            {copied === msg.id ? "✓ Copied!" : "📋 Copy"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(msg.id); }}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            🗑 Delete
          </button>
        </div>
      )}

      {/* status badges */}
      {isSent && !isCustomer && (
        <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>✓ Sent via WA</div>
      )}
      {isNotSent && !isCustomer && (
        <div style={{ fontSize: 10, color: "#94A3B8" }}>Not sent</div>
      )}
    </div>
  );
}

function ReplyButtons({ msgId, onReplyMyself, onAIReply }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
      <button
        onClick={() => onReplyMyself(msgId)}
        style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        ✏️ Reply Myself
      </button>
      <button
        onClick={() => onAIReply(msgId)}
        style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        🤖 AI Reply
      </button>
    </div>
  );
}

function AITypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ padding: "10px 16px", borderRadius: "16px 4px 16px 16px", background: "#EEF2FF", border: "1px solid #C7D2FE", display: "flex", gap: 4, alignItems: "center" }}>
        {[0, 0.2, 0.4].map((d, i) => (
          <span key={i} style={{ fontSize: 14, color: "#6366F1", animation: `ml-pulse 1s ${d}s infinite` }}>●</span>
        ))}
        <style>{`@keyframes ml-pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
      </div>
    </div>
  );
}

function ScrollToBottomBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute", bottom: 12, right: 14,
        width: 34, height: 34, borderRadius: "50%",
        border: "1px solid #E2E8F0", background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, cursor: "pointer", color: "#6366F1",
      }}>
      ↓
    </button>
  );
}

function SupplierReplyModal({
  customer, supplierReplyCtx, setSupplierReplyCtx,
  supplierReplyLoading, generateSupplierReply,
  supplierReplyGmail, supplierReplyWA,
  copiedSupGmail, setCopiedSupGmail,
  copiedSupWA, setCopiedSupWA,
  onClose,
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>✍️ Generate Reply</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{customer.name} · Supplier</div>
            </div>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>

          {/* context input */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>WHAT DO YOU WANT TO SAY?</div>
          <textarea
            value={supplierReplyCtx}
            onChange={e => setSupplierReplyCtx(e.target.value)}
            rows={3}
            placeholder='e.g. "Accept their lot offer, ask for invoice and shipping quote"'
            style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 14 }}
          />
          <button
            onClick={generateSupplierReply}
            disabled={supplierReplyLoading}
            style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", marginBottom: 18, fontWeight: 800, fontSize: 14, cursor: "pointer", background: supplierReplyLoading ? "#E2E8F0" : "#2563EB", color: supplierReplyLoading ? "#94A3B8" : "#fff" }}>
            {supplierReplyLoading ? "⏳ Generating…" : "⚡ Generate Gmail + WhatsApp"}
          </button>

          {/* gmail result */}
          {supplierReplyGmail && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>📧 GMAIL — FORMAL</div>
              <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                {supplierReplyGmail}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(supplierReplyGmail); setCopiedSupGmail(true); setTimeout(() => setCopiedSupGmail(false), 2000); }}
                style={{ padding: "6px 16px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: copiedSupGmail ? "#ECFDF5" : "#F1F5F9", color: copiedSupGmail ? "#059669" : "#64748B" }}>
                {copiedSupGmail ? "✓ Copied!" : "📋 Copy Gmail"}
              </button>
            </div>
          )}

          {/* whatsapp result */}
          {supplierReplyWA && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>💬 WHATSAPP — SHORT</div>
              <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                {supplierReplyWA}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(supplierReplyWA); setCopiedSupWA(true); setTimeout(() => setCopiedSupWA(false), 2000); }}
                style={{ padding: "6px 16px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: copiedSupWA ? "#ECFDF5" : "#F1F5F9", color: copiedSupWA ? "#059669" : "#64748B" }}>
                {copiedSupWA ? "✓ Copied!" : "📋 Copy WhatsApp"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditSentOverlay({ editSent, setEditSent, confirmSent }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: "#0F172A" }}>✏️ Edit Before Sending</div>
        <textarea
          value={editSent.text}
          onChange={e => setEditSent(p => ({ ...p, text: e.target.value }))}
          rows={5}
          style={{ width: "100%", padding: 12, borderRadius: 12, border: "1.5px solid #C7D2FE", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.6 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={() => confirmSent(editSent.msgId, editSent.text)}
            style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            Confirm Sent →
          </button>
          <button
            onClick={() => setEditSent(null)}
            style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function MessageList() {
  const { activeCustomer } = useCustomers();
  const {
    messages,
    replyMode, setReplyMode,
    replyingToId, setReplyingToId,
    generatedReplyLoading,
    showSupplierReply, setShowSupplierReply,
    supplierReplyCtx, setSupplierReplyCtx,
    supplierReplyGmail, supplierReplyWA,
    supplierReplyLoading,
    copiedSupGmail, setCopiedSupGmail,
    copiedSupWA, setCopiedSupWA,
    editSent, setEditSent,
    copied,
  } = useChat();
  const {
    confirmSent,
    generateAIReply,
    generateOpeningMessage,
    generateSupplierReply,
    deleteMessage,
    copyMsg,
  } = useChatActions();

  const scrollRef   = useRef(null);
  const bottomRef   = useRef(null);
  const timerRef    = useRef(null);
  const [longPressId,   setLongPressId]   = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // auto-scroll to bottom on new messages, unless user scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // show scroll-to-bottom button when user scrolls up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 180);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // dismiss context menu on outside click
  useEffect(() => {
    const dismiss = () => setLongPressId(null);
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, []);

  const handleLongPressStart = useCallback((msgId) => {
    timerRef.current = setTimeout(() => setLongPressId(msgId), 480);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  const handleDelete = useCallback(async (msgId) => {
    setLongPressId(null);
    await deleteMessage(msgId);
  }, [deleteMessage]);

  const handleCopy = useCallback((text, id) => {
    copyMsg(text, id);
    setLongPressId(null);
  }, [copyMsg]);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  // compute the last unanswered customer message id
  const lastAssistantTs = messages
    .filter(m => m.role === "assistant" && m.sent && m.sent !== "NOT_SENT")
    .map(m => new Date(m.ts).getTime())
    .sort((a, b) => a - b)
    .pop() || 0;

  const unansweredIds = messages
    .filter(m => m.role === "customer" && new Date(m.ts).getTime() > lastAssistantTs)
    .map(m => m.id);

  const lastUnansweredId = unansweredIds[unansweredIds.length - 1] ?? null;

  return (
    <>
      {/* ── message list ──────────────────────────────────────────────────── */}
      <div ref={scrollRef} style={{ flex: 1, padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", position: "relative" }}>

        {/* empty state */}
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "30px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", marginBottom: 20 }}>No messages yet</div>
            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <button
                onClick={() => setReplyMode("myself")}
                style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ✏️ I'll start typing
              </button>
              <button
                onClick={generateOpeningMessage}
                style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                🤖 AI opens
              </button>
            </div>
          </div>
        )}

        {/* messages with date separators */}
        {messages.map((msg, idx) => {
          const prevMsg = messages[idx - 1];
          const showDate = !prevMsg || !isSameDay(msg.ts, prevMsg.ts);
          const showReplyBtns = msg.id === lastUnansweredId && replyingToId !== msg.id;

          return (
            <div key={msg.id}>
              {showDate && <DateSeparator ts={msg.ts} />}
              <MessageBubble
                msg={msg}
                customerName={activeCustomer.name}
                isLongPressed={longPressId === msg.id}
                copied={copied}
                onLongPressStart={handleLongPressStart}
                onLongPressEnd={handleLongPressEnd}
                onCopy={handleCopy}
                onDelete={handleDelete}
              />
              {showReplyBtns && (
                <ReplyButtons
                  msgId={msg.id}
                  onReplyMyself={(id) => { setReplyingToId(id); setReplyMode("myself"); }}
                  onAIReply={generateAIReply}
                />
              )}
            </div>
          );
        })}

        {/* AI typing indicator */}
        {generatedReplyLoading && <AITypingIndicator />}

        <div ref={bottomRef} />

        {/* scroll to bottom button */}
        {showScrollBtn && <ScrollToBottomBtn onClick={scrollToBottom} />}
      </div>

      {/* ── supplier reply modal ──────────────────────────────────────────── */}
      {showSupplierReply && (
        <SupplierReplyModal
          customer={activeCustomer}
          supplierReplyCtx={supplierReplyCtx}
          setSupplierReplyCtx={setSupplierReplyCtx}
          supplierReplyLoading={supplierReplyLoading}
          generateSupplierReply={generateSupplierReply}
          supplierReplyGmail={supplierReplyGmail}
          supplierReplyWA={supplierReplyWA}
          copiedSupGmail={copiedSupGmail}
          setCopiedSupGmail={setCopiedSupGmail}
          copiedSupWA={copiedSupWA}
          setCopiedSupWA={setCopiedSupWA}
          onClose={() => setShowSupplierReply(false)}
        />
      )}

      {/* ── edit sent overlay ─────────────────────────────────────────────── */}
      {editSent && (
        <EditSentOverlay
          editSent={editSent}
          setEditSent={setEditSent}
          confirmSent={confirmSent}
        />
      )}
    </>
  );
}
