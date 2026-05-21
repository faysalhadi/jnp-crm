import React from "react";
import { useAuth } from "../../context/AuthContext";
import { saveAnthropicKey } from "../../utils/helpers";

export default function ApiKeySetup() {
  const { anthropicKey, keyInput, setKeyInput, setAnthropicKey } = useAuth();

  if (anthropicKey) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>ONE-TIME SETUP</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Add Anthropic API Key</div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
          Get your key from <strong>console.anthropic.com</strong> → API Keys. Stored locally on your device only.
        </div>
        <input value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="sk-ant-api03-..."
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 12, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
        <button onClick={() => { saveAnthropicKey(keyInput); setAnthropicKey(keyInput); }} disabled={!keyInput.startsWith("sk-")}
          style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: keyInput.startsWith("sk-") ? "#6366F1" : "#E2E8F0", color: keyInput.startsWith("sk-") ? "#fff" : "#94A3B8", fontWeight: 700, fontSize: 14, cursor: keyInput.startsWith("sk-") ? "pointer" : "not-allowed" }}>
          Save & Continue →
        </button>
      </div>
    </div>
  );
}
