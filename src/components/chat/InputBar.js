import React, { useState } from "react";
import { callClaude, buildSystemPromptFromCache } from "../../utils/claude";
import { useCustomers } from "../../context/CustomerContext";

export default function InputBar({
  messages,
  incomingText, setIncomingText,
  replyMode, setReplyMode,
  replyingToId, setReplyingToId,
  directReplyText, setDirectReplyText,
  generatedReply, setGeneratedReply,
  generatedReplyLoading, setGeneratedReplyLoading,
  editingGenerated, setEditingGenerated,
  anthropicKey,
  cachedStock,
  addIncomingMessage,
  generateAIReply,
  sendAIReply,
  sendDirectReply,
  generateOpeningMessage,
  handleConfirmSale,
  handleReserveDevice,
}) {
  const { activeCustomer, activeDeal } = useCustomers();
  const [aiComposeContext, setAiComposeContext] = useState("");

  return (
    <div style={{ padding: "10px 12px 20px", background: "#fff", borderTop: "1px solid #F1F5F9", position: "sticky", bottom: 0 }}>

      {/* AI compose box — shown when user taps 🤖 AI button */}
      {replyMode === "ai_compose" && (
        <div style={{ marginBottom: 12, background: "#EEF2FF", borderRadius: 14, padding: 12, border: "1px solid #C7D2FE" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", letterSpacing: 0.5, marginBottom: 6 }}>🤖 AI COMPOSE</div>
          <textarea
            value={aiComposeContext}
            onChange={e => setAiComposeContext(e.target.value)}
            placeholder="What do you want to say? e.g. 'Follow up on MacBook, offer 10% discount'"
            rows={2}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #C7D2FE", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", background: "#fff", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={async () => {
                if (!anthropicKey) { alert("Add Anthropic API key in Settings first."); return; }
                setGeneratedReplyLoading(true);
                setGeneratedReply("");
                setReplyMode("ai");
                try {
                  const history = messages.map(m => ({
                    role: m.role === "customer" ? "user" : "assistant",
                    content: m.sent && m.sent !== "NOT_SENT" ? m.sent : m.content,
                  }));
                  const contextMsg = aiComposeContext.trim()
                    ? `Context from owner: ${aiComposeContext.trim()}`
                    : "Generate a friendly follow-up message";
                  const fullHistory = history.length > 0
                    ? [...history, { role: "user", content: contextMsg }]
                    : [{ role: "user", content: contextMsg }];
                  const raw = await callClaude(anthropicKey, fullHistory, buildSystemPromptFromCache(cachedStock));
                  const clean = raw.replace(/```json|```/g, "").trim();
                  let parsed;
                  try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
                  setGeneratedReply(parsed.reply || raw);
                  setAiComposeContext("");
                } catch {
                  setGeneratedReply("⚠️ Error generating. Check your API key.");
                }
                setGeneratedReplyLoading(false);
              }}
              disabled={generatedReplyLoading}
              style={{ flex: 1, padding: "8px", borderRadius: 10, border: "none", background: generatedReplyLoading ? "#E2E8F0" : "#6366F1", color: generatedReplyLoading ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {generatedReplyLoading ? "⏳ Generating..." : "⚡ Generate"}
            </button>
            <button
              onClick={() => { setReplyMode(null); setAiComposeContext(""); setGeneratedReply(""); }}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* AI generated reply box — shown above inputs when ready */}
      {generatedReply && !generatedReplyLoading && (
        <div style={{ marginBottom: 12, background: "#EEF2FF", borderRadius: 14, padding: 12, border: "1px solid #C7D2FE" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", letterSpacing: 0.5, marginBottom: 6 }}>🤖 SUGGESTED REPLY</div>
          {editingGenerated ? (
            <textarea value={generatedReply} onChange={e => setGeneratedReply(e.target.value)} rows={3} autoFocus
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #6366F1", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", background: "#fff" }} />
          ) : (
            <div style={{ fontSize: 13, color: "#1E1B4B", lineHeight: 1.65, whiteSpace: "pre-line" }}>
              {generatedReply}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={async () => {
              const text = generatedReply.trim();
              await sendAIReply();
              if (activeCustomer?.number) {
                const number = activeCustomer.number.replace(/\D/g, "");
                window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
              }
            }}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              📱 Send on WA
            </button>
            <button onClick={() => setEditingGenerated(v => !v)}
              style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #C7D2FE", background: "#fff", color: "#6366F1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {editingGenerated ? "Done" : "✏️ Edit"}
            </button>
            <button onClick={() => { setGeneratedReply(""); setReplyingToId(null); setEditingGenerated(false); }}
              style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              ❌ Skip
            </button>
          </div>
        </div>
      )}

      {/* ── PRIMARY ACTION BAR ── */}
      <div style={{ marginBottom: 8 }}>
        {/* Reserve — primary action for WhatsApp clients */}
        <button
          onClick={handleReserveDevice}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            marginBottom: 6,
          }}
        >
          🔒 Reserve Device
        </button>
        {/* Confirm Sale — secondary action */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleConfirmSale}
            style={{
              background: "none",
              border: "none",
              color: "#6366F1",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
              padding: "2px 8px",
            }}
          >
            ⚡ Confirm Sale instead →
          </button>
        </div>
      </div>

      {/* TOP ROW — paste client's incoming message */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
        <textarea
          value={incomingText}
          onChange={e => setIncomingText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addIncomingMessage(); } }}
          placeholder="New message from client..."
          rows={1}
          style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5, background: "#F8FAFC" }}
        />
        <button onClick={addIncomingMessage} disabled={!incomingText.trim()}
          style={{ padding: "9px 14px", height: 38, borderRadius: 10, border: "none", background: incomingText.trim() ? "#22C55E" : "#E2E8F0", color: incomingText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 12, cursor: incomingText.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap", flexShrink: 0 }}>
          + Add
        </button>
      </div>

      {/* BOTTOM ROW — type your own outgoing message (always usable) */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        {/* AI compose button — always visible */}
        <button
          onClick={() => {
            setReplyMode(replyMode === "ai_compose" ? null : "ai_compose");
            setGeneratedReply("");
            setEditingGenerated(true);
          }}
          style={{ width: 40, height: 52, borderRadius: 12, border: "none", background: replyMode === "ai_compose" ? "#6366F1" : "#EEF2FF", color: replyMode === "ai_compose" ? "#fff" : "#6366F1", fontWeight: 800, fontSize: 11, cursor: "pointer", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontSize: 8, fontWeight: 700 }}>AI</span>
        </button>
        <textarea
          id="ownerReplyInput"
          value={directReplyText}
          onChange={e => setDirectReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDirectReply(); } }}
          placeholder="Type your message..."
          rows={2}
          style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5 }}
        />
        {/* Save only — shown when no number */}
        {!activeCustomer?.number && (
          <button onClick={sendDirectReply} disabled={!directReplyText.trim()}
            style={{ width: 46, height: 52, borderRadius: 12, border: "none", background: directReplyText.trim() ? "#6366F1" : "#E2E8F0", color: directReplyText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 20, cursor: directReplyText.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}>
            ↑
          </button>
        )}
        {/* Combined Save + WhatsApp — shown when number exists */}
        {activeCustomer?.number && (
          <button
            onClick={async () => {
              const text = directReplyText.trim();
              if (!text) return;
              await sendDirectReply();
              const number = activeCustomer.number.replace(/\D/g, "");
              window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
            }}
            disabled={!directReplyText.trim()}
            style={{ height: 52, padding: "0 14px", borderRadius: 12, border: "none", background: directReplyText.trim() ? "#25D366" : "#E2E8F0", color: directReplyText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 13, cursor: directReplyText.trim() ? "pointer" : "not-allowed", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <span style={{ fontSize: 16 }}>📱</span>
            <span style={{ fontSize: 9, fontWeight: 700 }}>Send</span>
          </button>
        )}
      </div>
    </div>
  );
}
