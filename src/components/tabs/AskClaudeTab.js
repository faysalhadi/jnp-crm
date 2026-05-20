import React from "react";
import { QUICK_ACTIONS } from "../../constants";
import { useUI } from "../../context/UIContext";

export default function AskClaudeTab({
  anthropicKey,
  askMessages, setAskMessages,
  askInput, setAskInput,
  askLoading, setAskLoading,
  askBottomRef,
  sendAskMessage,
}) {
  const { isMobile } = useUI();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

      {/* Quick action grid — shown when chat is empty */}
      {askMessages.length === 0 && (
        <div style={{ padding: "16px 12px 0", overflowY: "auto" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>🤖 Business Assistant</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>Ask anything about your stock, clients, or revenue</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {QUICK_ACTIONS.map(a => (
              <button key={a.label} onClick={() => sendAskMessage(a.question)} disabled={askLoading}
                style={{ padding: "14px 10px", borderRadius: 16, border: "1.5px solid #E2E8F0", background: "#fff", cursor: "pointer", textAlign: "left", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", opacity: askLoading ? 0.5 : 1 }}>
                <div style={{ fontSize: 22, marginBottom: 5 }}>{a.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", lineHeight: 1.3 }}>{a.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 4px" }}>
        {askMessages.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button onClick={() => setAskMessages([])}
              style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
              🗑 Clear chat
            </button>
          </div>
        )}
        {askMessages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "owner" ? "flex-end" : "flex-start", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#CBD5E1", marginBottom: 3 }}>
              {msg.role === "owner" ? "You" : "🤖 Claude"}
            </div>
            <div style={{
              maxWidth: "88%", padding: "11px 14px", fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-line",
              borderRadius: msg.role === "owner" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              background: msg.role === "owner" ? "#DCFCE7" : "#F3E8FF",
              color: msg.role === "owner" ? "#14532D" : "#4C1D95",
              border: msg.role === "owner" ? "1px solid #BBF7D0" : "1px solid #DDD6FE",
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {askLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14 }}>
            <div style={{ padding: "10px 16px", borderRadius: "4px 16px 16px 16px", background: "#F3E8FF", border: "1px solid #DDD6FE", display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <span key={i} style={{ fontSize: 14, color: "#7C3AED", animation: `pulse 1s ${d}s infinite` }}>●</span>
              ))}
              <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
            </div>
          </div>
        )}
        <div ref={askBottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: "10px 12px 100px", background: "#fff", borderTop: "1px solid #F1F5F9" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={askInput}
            onChange={e => setAskInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAskMessage(askInput); } }}
            placeholder="Ask anything about your business..."
            rows={2}
            style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5 }}
          />
          <button onClick={() => sendAskMessage(askInput)} disabled={askLoading || !askInput.trim()}
            style={{ width: 46, height: 52, borderRadius: 12, border: "none", background: askLoading || !askInput.trim() ? "#E2E8F0" : "#7C3AED", color: askLoading || !askInput.trim() ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 20, cursor: askLoading || !askInput.trim() ? "not-allowed" : "pointer", flexShrink: 0 }}>
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
