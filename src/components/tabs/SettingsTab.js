import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import { useImportContext } from "../../context/ImportContext";
import { saveAnthropicKey } from "../../utils/helpers";

export default function SettingsTab({
  importWhatsAppChat,
  importSingleChatFile,
  importMultipleChatFiles,
  exportData,
  handleLogoutWithUI,
  fileInputRef,
  multipleFileInputRef,
}) {
  const { anthropicKey, setAnthropicKey, keyInput, setKeyInput, session } = useAuth();
  const { isMobile, setView } = useUI();
  const {
    importText, setImportText,
    importing,
    importResult, setImportResult,
    importingMultiple,
    importMultipleProgress,
    importMultipleResult, setImportMultipleResult,
    exporting,
  } = useImportContext();

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={() => setView("list")} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer", fontSize: 18 }}>←</button>
        <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>Settings</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 12, letterSpacing: 0.5 }}>ANTHROPIC API KEY</div>
          <input value={keyInput || anthropicKey} onChange={e => setKeyInput(e.target.value)} placeholder="sk-ant-api03-..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 11, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <button onClick={() => { const k = keyInput || anthropicKey; saveAnthropicKey(k); setAnthropicKey(k); alert("Saved!"); }}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Save Key
          </button>
        </div>

        {/* Import WhatsApp Chat */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>📥 IMPORT WHATSAPP CHATS</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 1.6 }}>
            Export each chat as a .txt file (WhatsApp → Chat → ⋮ → More → Export → Without media).<br/>
            Each file = one customer. Claude extracts specs, stage, budget automatically.
          </div>

          {/* Hidden file inputs */}
          <input type="file" accept=".txt" ref={fileInputRef} style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) importSingleChatFile(e.target.files[0]); e.target.value = ""; }} />
          <input type="file" accept=".txt" multiple ref={multipleFileInputRef} style={{ display: "none" }}
            onChange={e => { if (e.target.files?.length) importMultipleChatFiles(Array.from(e.target.files)); e.target.value = ""; }} />

          {/* Progress bar for multiple import */}
          {importingMultiple && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#EEF2FF", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#6366F1", fontWeight: 700, marginBottom: 6 }}>
                Processing {importMultipleProgress.current} of {importMultipleProgress.total} chats...
              </div>
              <div style={{ height: 4, borderRadius: 4, background: "#C7D2FE" }}>
                <div style={{ height: "100%", borderRadius: 4, background: "#6366F1", width: `${importMultipleProgress.total ? (importMultipleProgress.current / importMultipleProgress.total) * 100 : 0}%`, transition: "width 0.3s" }} />
              </div>
            </div>
          )}

          {/* Multiple import result */}
          {importMultipleResult && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ECFDF5", marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#10B981" }}>
              ✅ {importMultipleResult.created}/{importMultipleResult.total} chats imported{importMultipleResult.failed > 0 ? ` (${importMultipleResult.failed} failed)` : ""}
            </div>
          )}

          {/* Single import result */}
          {importResult && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: importResult.success ? "#ECFDF5" : "#FEF2F2", color: importResult.success ? "#10B981" : "#EF4444", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
              {importResult.message}
            </div>
          )}

          {/* File import buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => { setImportResult(null); fileInputRef.current?.click(); }}
              disabled={importing || importingMultiple || !anthropicKey}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: importing || importingMultiple || !anthropicKey ? "#E2E8F0" : "#6366F1", color: importing || importingMultiple || !anthropicKey ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {importing ? "⏳ Importing..." : "📄 One Chat File"}
            </button>
            <button onClick={() => { setImportMultipleResult(null); multipleFileInputRef.current?.click(); }}
              disabled={importing || importingMultiple || !anthropicKey}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: importing || importingMultiple || !anthropicKey ? "#E2E8F0" : "#10B981", color: importing || importingMultiple || !anthropicKey ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {importingMultiple ? "⏳ Processing..." : "📂 Multiple Files"}
            </button>
          </div>

          {/* Paste fallback */}
          <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", marginBottom: 8, letterSpacing: 0.5 }}>OR PASTE CHAT TEXT (FALLBACK)</div>
            <textarea value={importText} onChange={e => setImportText(e.target.value)}
              placeholder="Paste WhatsApp chat text here..."
              rows={4}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8, lineHeight: 1.5 }} />
            <button onClick={importWhatsAppChat} disabled={importing || !importText.trim() || !anthropicKey}
              style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: importing || !importText.trim() || !anthropicKey ? "#E2E8F0" : "#6366F1", color: importing || !importText.trim() || !anthropicKey ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {importing ? "⏳ Importing..." : "Import from Pasted Text →"}
            </button>
          </div>

          {!anthropicKey && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 8, textAlign: "center" }}>Add Anthropic API key above first</div>}
        </div>

        {/* Export Data */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>📤 EXPORT DATA</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.5 }}>
            Download all your customers and deals as JSON + CSV backup.
          </div>
          <button onClick={exportData} disabled={exporting}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: exporting ? "#E2E8F0" : "#10B981", color: exporting ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: exporting ? "not-allowed" : "pointer" }}>
            {exporting ? "⏳ Exporting..." : "📥 Download Backup (JSON + CSV)"}
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>ACCOUNT</div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>{session?.user?.email}</div>
          <button onClick={handleLogoutWithUI}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
