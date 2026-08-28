import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";
import { useProfile } from "../../context/ProfileContext";
import { saveAnthropicKey } from "../../utils/helpers";
import SalespersonDetailView from "./SalespersonDetailView";

export default function SettingsTab({ exportData, handleLogoutWithUI }) {
  const { anthropicKey, setAnthropicKey, keyInput, setKeyInput, session } = useAuth();
  const { isMobile, setActiveTab } = useUI(); // eslint-disable-line
  const { setView } = useCustomers();
  const { isOwner, profiles, createSalesperson, deleteSalesperson, setViewingAs } = useProfile();

  const [showAddForm, setShowAddForm]       = useState(false);
  const [formData, setFormData]             = useState({ name: "", email: "", password: "", whatsapp_number: "" });
  const [formError, setFormError]           = useState("");
  const [formLoading, setFormLoading]       = useState(false);
  const [deletingId, setDeletingId]         = useState(null);
  const [selectedSalesperson, setSelectedSalesperson] = useState(null);

  async function handleCreate() {
    setFormError("");
    if (!formData.name || !formData.email || !formData.password) {
      setFormError("Name, email and password are required.");
      return;
    }
    setFormLoading(true);
    const err = await createSalesperson(formData);
    setFormLoading(false);
    if (err) { setFormError(err); return; }
    setFormData({ name: "", email: "", password: "", whatsapp_number: "" });
    setShowAddForm(false);
  }

  async function handleDelete(id) {
    setDeletingId(id);
    await deleteSalesperson(id);
    setDeletingId(null);
  }

  const salespersons = (profiles || []).filter(p => p.role === "salesperson");

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", padding: 20 }}>
      {selectedSalesperson && (
        <SalespersonDetailView
          salesperson={selectedSalesperson}
          onClose={() => setSelectedSalesperson(null)}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={() => setView("list")} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer", fontSize: 18 }}>←</button>
        <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>Settings</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Team — owner only */}
        {isOwner && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>👥 TEAM</div>
              <button onClick={() => { setShowAddForm(v => !v); setFormError(""); }}
                style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#EEF2FF", color: "#6366F1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {showAddForm ? "Cancel" : "+ Add Person"}
              </button>
            </div>

            {showAddForm && (
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { key: "name", label: "Full name", placeholder: "e.g. Ahmad" },
                  { key: "email", label: "Email", placeholder: "ahmad@example.com", type: "email" },
                  { key: "password", label: "Password", placeholder: "Min 6 characters", type: "password" },
                  { key: "whatsapp_number", label: "WhatsApp (optional)", placeholder: "+971..." },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 3, letterSpacing: 0.5 }}>{f.label.toUpperCase()}</div>
                    <input
                      type={f.type || "text"}
                      value={formData[f.key]}
                      onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
                {formError && <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{formError}</div>}
                <button onClick={handleCreate} disabled={formLoading}
                  style={{ padding: "9px 0", borderRadius: 10, border: "none", background: formLoading ? "#E2E8F0" : "#10B981", color: formLoading ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {formLoading ? "Creating..." : "Create Salesperson"}
                </button>
              </div>
            )}

            {salespersons.length === 0 && !showAddForm && (
              <div style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: "10px 0" }}>No salespeople yet</div>
            )}

            {salespersons.map(sp => (
              <div key={sp.id} onClick={() => setSelectedSalesperson(sp)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F1F5F9", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#6366F1" }}>
                  {(sp.name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{sp.name}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{sp.email || ""}{sp.whatsapp_number ? ` · ${sp.whatsapp_number}` : ""}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setViewingAs(sp);
                      setView("list");
                      setActiveTab("home");
                    }}
                    style={{ background: "#162040", color: "#5190FF", border: "1px solid #243660", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                    View CRM
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`Remove ${sp.name}? This deletes their account.`)) handleDelete(sp.id);
                    }}
                    disabled={deletingId === sp.id}
                    style={{ background: "none", border: "none", color: "#F07070", cursor: "pointer", fontSize: 11, padding: "2px 6px", fontWeight: 600 }}>
                    {deletingId === sp.id ? "..." : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* API Key */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 12, letterSpacing: 0.5 }}>ANTHROPIC API KEY</div>
          <input value={keyInput || anthropicKey} onChange={e => setKeyInput(e.target.value)} placeholder="sk-ant-api03-..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 11, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <button onClick={() => { const k = keyInput || anthropicKey; saveAnthropicKey(k); setAnthropicKey(k); alert("Saved!"); }}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Save Key
          </button>
        </div>

        {/* Export Data */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>📤 EXPORT DATA</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.5 }}>
            Download all your customers and deals as JSON + CSV backup.
          </div>
          <button onClick={exportData}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            📥 Download Backup (JSON + CSV)
          </button>
        </div>

        {/* Account */}
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
