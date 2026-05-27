import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";
import { TIERS, STAGES } from "../../constants";

export default function ContactSheet({ onClose }) {
  const {
    activeCustomer,
    activeCustomerId,
    loadCustomers,
  } = useCustomers();

  const [notes, setNotes] = useState(activeCustomer?.notes || "");
  const [notesSaving, setNotesSaving] = useState(false);
  const [email, setEmail] = useState(activeCustomer?.email || "");

  useEffect(() => {
    setNotes(activeCustomer?.notes || "");
    setEmail(activeCustomer?.email || "");
  }, [activeCustomer?.id]); // eslint-disable-line

  if (!activeCustomer) return null;

  const tier = TIERS[activeCustomer.tier] || TIERS.cold;
  const initials = (activeCustomer.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const closedDeals = (activeCustomer.deals || []).filter(d => d.stage === "closed");
  const totalRevenue = closedDeals.reduce((a, d) => a + (Number(d.value) || 0), 0);
  const totalDeals = (activeCustomer.deals || []).length;
  const lastActive = activeCustomer.last_activity_at || activeCustomer.last_active;
  const daysAgo = lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000) : null;

  const saveNotes = async () => {
    setNotesSaving(true);
    await supabase.from("customers").update({ notes }).eq("id", activeCustomerId);
    await loadCustomers();
    setNotesSaving(false);
  };

  const saveEmail = async () => {
    await supabase.from("customers").update({ email }).eq("id", activeCustomerId);
    await loadCustomers();
  };

  const cType = activeCustomer.contact_type || "client";
  const typeBadgeStyle = {
    client:   { bg: "#EEF2FF", color: "#534AB7", label: "Client" },
    trader:   { bg: "#FFFBEB", color: "#D97706", label: "🟡 Trader" },
    supplier: { bg: "#EFF6FF", color: "#2563EB", label: "🔵 Supplier" },
    walkin:   { bg: "#EEF2FF", color: "#534AB7", label: "⚡ Walk-in" },
  }[cType] || { bg: "#EEF2FF", color: "#534AB7", label: "Client" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end" }}
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "85vh", overflowY: "auto", paddingBottom: 20 }}>

        {/* Handle */}
        <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "12px auto 16px" }} />

        {/* Avatar + name */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#534AB7", margin: "0 auto 10px" }}>
            {initials}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{activeCustomer.name}</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: typeBadgeStyle.bg, color: typeBadgeStyle.color }}>{typeBadgeStyle.label}</span>
            {cType === "client" && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: tier.bg, color: tier.color }}>{tier.icon} {tier.label}</span>}
            {activeCustomer.urgent && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#FEF2F2", color: "#EF4444" }}>🔴 Urgent</span>}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 16px", marginBottom: 16 }}>
          {[
            { label: "Deals", value: totalDeals },
            { label: "Revenue", value: totalRevenue > 0 ? `AED ${totalRevenue >= 1000 ? (totalRevenue/1000).toFixed(1)+"k" : totalRevenue}` : "—", color: "#10B981" },
            { label: "Last active", value: daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : daysAgo ? `${daysAgo}d ago` : "—" },
          ].map(s => (
            <div key={s.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color || "#0F172A" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Contact info */}
        <div style={{ padding: "0 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>CONTACT INFO</div>
          <div style={{ background: "#F8FAFC", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #F1F5F9" }}>
              <span style={{ fontSize: 12, color: "#64748B" }}>Phone</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#534AB7" }}>{activeCustomer.number || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #F1F5F9" }}>
              <span style={{ fontSize: 12, color: "#64748B" }}>Type</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{typeBadgeStyle.label}</span>
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Email</div>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={saveEmail}
                placeholder="Add email address..."
                style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ padding: "0 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>
            NOTES {notesSaving && <span style={{ color: "#10B981", fontWeight: 400 }}>• saving...</span>}
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder={cType === "trader" ? 'e.g. "Deals in bulk, prefers HP. Pays cash. Reliable."' : 'e.g. "Prefers MacBook. Budget flexible. Comes weekends."'}
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box", color: "#334155", background: "#F8FAFC" }}
          />
        </div>

        {/* Deal history */}
        {(activeCustomer.deals || []).length > 0 && (
          <div style={{ padding: "0 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>DEAL HISTORY</div>
            <div style={{ background: "#F8FAFC", borderRadius: 12, overflow: "hidden" }}>
              {(activeCustomer.deals || []).slice(0, 5).map((deal, i) => {
                const stageLabel = STAGES.find(s => s.id === deal.stage)?.label || deal.stage;
                const device = [deal.brand, deal.model].filter(Boolean).join(" ") || "Device TBD";
                const isClosed = deal.stage === "closed";
                return (
                  <div key={deal.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: i < (activeCustomer.deals.length - 1) ? "1px solid #F1F5F9" : "none" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#334155" }}>{device}</div>
                      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>
                        {deal.created_at ? new Date(deal.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isClosed ? "#10B981" : "#534AB7" }}>
                        {(deal.value || deal.budget) ? `AED ${Number(deal.value || deal.budget).toLocaleString()}` : "—"}
                      </div>
                      <div style={{ fontSize: 10, color: isClosed ? "#10B981" : "#94A3B8", marginTop: 1 }}>{stageLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, padding: "0 16px" }}>
          {activeCustomer.number && (
            <a href={`https://wa.me/${activeCustomer.number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
              style={{ flex: 1, padding: "11px 0", borderRadius: 12, background: "#ECFDF5", color: "#10B981", fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>
              📱 WhatsApp
            </a>
          )}
          <button onClick={onClose}
            style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
