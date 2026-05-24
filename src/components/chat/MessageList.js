import React, { useRef, useEffect, useState } from "react";
import { timeAgo } from "../../utils/helpers";
import { useCustomers } from "../../context/CustomerContext";
import { useChat } from "../../context/ChatContext";
import { useChatActions } from "../../hooks/useChatActions";

export default function MessageList() {
  const { activeCustomer } = useCustomers();
  const {
    messages,
    replyMode, setReplyMode,
    replyingToId, setReplyingToId,
    generatedReply, setGeneratedReply,
    generatedReplyLoading,
    editingGenerated, setEditingGenerated,
    copied, setCopied,
    editSent, setEditSent,
    showSupplierReply, setShowSupplierReply,
    supplierReplyCtx, setSupplierReplyCtx,
    supplierReplyGmail, setSupplierReplyGmail,
    supplierReplyWA, setSupplierReplyWA,
    supplierReplyLoading, setSupplierReplyLoading,
    copiedSupGmail, setCopiedSupGmail,
    copiedSupWA, setCopiedSupWA,
  } = useChat();
  const {
    confirmSent,
    markNotSent,
    copyMsg,
    generateAIReply,
    sendAIReply,
    generateOpeningMessage,
    generateSupplierReply,
    deleteMessage,
  } = useChatActions();

  const bottomRef = useRef(null);
  const longPressTimer = useRef(null);
  const [longPressId, setLongPressId] = useState(null);
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handler = () => setLongPressId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Desktop: only mouseDown starts the timer, mouseUp clears it
  // No mouseLeave — it fires on slightest cursor movement and cancels timer
  const handleMouseDown = (msgId) => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      setLongPressId(msgId);
    }, 600);
  };

  const handleMouseUp = () => {
    clearTimeout(longPressTimer.current);
  };

  // Mobile touch
  const handleTouchStart = (msgId) => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      setLongPressId(msgId);
    }, 500);
  };

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current);
  };

  const handleCopy = (e, text, msgId) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(text);
    setLongPressId(null);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleDelete = async (e, msgId) => {
    e.stopPropagation();
    e.preventDefault();
    setLongPressId(null);
    if (deleteMessage) await deleteMessage(msgId);
  };

  return (
    <>
      <div style={{ flex: 1, padding: "12px", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>

        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "30px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", marginBottom: 20 }}>No messages yet</div>
            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <button onClick={() => setReplyMode("myself")}
                style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ✏️ I'll start typing
              </button>
              <button onClick={generateOpeningMessage}
                style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                🤖 AI opens
              </button>
            </div>
          </div>
        )}

        {messages.length > 0 && messages[0]?.ts && (Date.now() - new Date(messages[0].ts).getTime()) > 3600000 && (
          <div style={{ textAlign: "center", padding: "5px 12px", borderRadius: 8, background: "#F1F5F9", fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
            📱 Imported from WhatsApp
          </div>
        )}

        {(() => {
          const lastAssistantTs = messages
            .filter(m => m.role === "assistant" && m.sent && m.sent !== "NOT_SENT")
            .map(m => new Date(m.ts).getTime()).sort().pop() || 0;

          const unansweredMsgs = messages.filter(
            m => m.role === "customer" && new Date(m.ts).getTime() > lastAssistantTs
          );
          const lastUnansweredId = unansweredMsgs.length > 0
            ? unansweredMsgs[unansweredMsgs.length - 1].id
            : null;

          return messages.map(msg => {
            const isCustomer = msg.role === "customer";
            const isSent     = msg.sent && msg.sent !== "NOT_SENT";
            const isNotSent  = msg.sent === "NOT_SENT";
            const display    = isSent && msg.sent !== msg.content ? msg.sent : msg.content;
            const showReplyBtns = isCustomer && msg.id === lastUnansweredId && replyingToId !== msg.id;
            const isMenuOpen = longPressId === msg.id;
            const isCopied   = copiedMsgId === msg.id;

            return (
              <div key={msg.id}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: isCustomer ? "flex-start" : "flex-end", gap: 4 }}>
                  <div style={{ fontSize: 10, color: "#CBD5E1" }}>
                    {isCustomer ? (msg.is_voice ? "🎤 Voice Note" : `👤 ${activeCustomer.name}`) : "You"} · {timeAgo(msg.ts)}
                  </div>

                  <div
                    onMouseDown={() => handleMouseDown(msg.id)}
                    onMouseUp={handleMouseUp}
                    onTouchStart={() => handleTouchStart(msg.id)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchEnd}
                    style={{
                      maxWidth: "84%",
                      padding: "10px 13px",
                      fontSize: 13.5,
                      lineHeight: 1.7,
                      whiteSpace: "pre-line",
                      borderRadius: isCustomer ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                      background: isMenuOpen
                        ? (isCustomer ? "#DDE1E7" : "#4338CA")
                        : (isCustomer ? "#F1F5F9" : "#6366F1"),
                      color: isCustomer ? "#334155" : "#fff",
                      border: isCustomer ? "1px solid #E2E8F0" : "none",
                      opacity: isNotSent ? 0.45 : 1,
                      cursor: "pointer",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                    }}>
                    {display}
                  </div>

                  {isMenuOpen && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => handleCopy(e, display, msg.id)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: "1px solid #E2E8F0",
                          background: "#fff",
                          color: "#334155",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                        }}>
                        📋 Copy
                      </button>
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => handleDelete(e, msg.id)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: "1px solid #FEE2E2",
                          background: "#FEF2F2",
                          color: "#EF4444",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                        }}>
                        🗑 Delete
                      </button>
                    </div>
                  )}

                  {isCopied && (
                    <div style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>✓ Copied!</div>
                  )}

                  {isSent && !isCustomer && (
                    <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>✓ Sent · {timeAgo(msg.ts)}</div>
                  )}
                  {isNotSent && !isCustomer && (
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>Not sent</div>
                  )}
                </div>

                {showReplyBtns && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button onClick={() => { setReplyingToId(msg.id); setReplyMode("myself"); }}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ✏️ Reply Myself
                    </button>
                    <button onClick={() => generateAIReply(msg.id)}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      🤖 AI Reply
                    </button>
                  </div>
                )}
              </div>
            );
          });
        })()}

        {generatedReplyLoading && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ padding: "10px 16px", borderRadius: "16px 4px 16px 16px", background: "#EEF2FF", border: "1px solid #C7D2FE", display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <span key={i} style={{ fontSize: 14, color: "#6366F1", animation: `pulse 1s ${d}s infinite` }}>●</span>
              ))}
              <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showSupplierReply && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>✍️ Generate Reply</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{activeCustomer.name} · Supplier</div>
                </div>
                <button onClick={() => setShowSupplierReply(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>WHAT DO YOU WANT TO SAY?</div>
              <textarea value={supplierReplyCtx} onChange={e => setSupplierReplyCtx(e.target.value)} rows={3}
                placeholder='e.g. "Accept their lot offer, ask for invoice and shipping quote"'
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 14 }} />
              <button onClick={generateSupplierReply} disabled={supplierReplyLoading} style={{
                width: "100%", padding: 13, borderRadius: 12, border: "none", marginBottom: 18,
                background: supplierReplyLoading ? "#E2E8F0" : "#2563EB",
                color: supplierReplyLoading ? "#94A3B8" : "#fff",
                fontWeight: 800, fontSize: 14, cursor: "pointer",
              }}>
                {supplierReplyLoading ? "⏳ Generating…" : "⚡ Generate Gmail + WhatsApp"}
              </button>
              {supplierReplyGmail && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>📧 GMAIL — FORMAL</div>
                  <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>{supplierReplyGmail}</div>
                  <button onClick={() => { navigator.clipboard.writeText(supplierReplyGmail); setCopiedSupGmail(true); setTimeout(() => setCopiedSupGmail(false), 2000); }}
                    style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupGmail ? "#ECFDF5" : "#F1F5F9", color: copiedSupGmail ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {copiedSupGmail ? "✓ Copied!" : "📋 Copy Gmail"}
                  </button>
                </div>
              )}
              {supplierReplyWA && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>💬 WHATSAPP — SHORT</div>
                  <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>{supplierReplyWA}</div>
                  <button onClick={() => { navigator.clipboard.writeText(supplierReplyWA); setCopiedSupWA(true); setTimeout(() => setCopiedSupWA(false), 2000); }}
                    style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupWA ? "#ECFDF5" : "#F1F5F9", color: copiedSupWA ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {copiedSupWA ? "✓ Copied!" : "📋 Copy WhatsApp"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editSent && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: "#0F172A" }}>✏️ Edit Before Sending</div>
            <textarea value={editSent.text} onChange={e => setEditSent(p => ({ ...p, text: e.target.value }))} rows={5}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1.5px solid #C7D2FE", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.6 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => confirmSent(editSent.msgId, editSent.text)}
                style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                Confirm Sent →
              </button>
              <button onClick={() => setEditSent(null)}
                style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
