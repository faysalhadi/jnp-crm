import React, { useState } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";

const CONDITIONS  = ["Grade A", "Grade B", "Grade A or B", "Any"];
const FREQUENCIES = [
  { label: "Daily",         days: 1  },
  { label: "Every 3 days",  days: 3  },
  { label: "Weekly",        days: 7  },
  { label: "Every 2 weeks", days: 14 },
  { label: "Monthly",       days: 30 },
];

export default function ClientPreferencesPanel() {
  const { activeCustomerId, activeCustomer, loadCustomers } = useCustomers();
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const prefs = activeCustomer?.preferences || {};

  const [form, setForm] = useState({
    condition:            prefs.condition            || "",
    order_frequency_days: prefs.order_frequency_days || 14,
  });

  function startEdit() {
    const p = activeCustomer?.preferences || {};
    setForm({
      condition:            p.condition            || "",
      order_frequency_days: p.order_frequency_days || 14,
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    // Merge with existing prefs to preserve any other fields
    const existing = activeCustomer?.preferences || {};
    await supabase.from("customers").update({
      preferences: {
        ...existing,
        condition:            form.condition,
        order_frequency_days: form.order_frequency_days,
      }
    }).eq("id", activeCustomerId);
    await loadCustomers();
    setSaving(false);
    setEditing(false);
  }

  const hasPrefs = prefs.condition || prefs.order_frequency_days;
  const freqLabel = FREQUENCIES.find(f => f.days === prefs.order_frequency_days)?.label;

  return (
    <div style={{ borderTop: "1px solid #F1F5F9" }}>
      <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F8FAFC" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>🎯 Preferences</div>
          {!hasPrefs && !editing && (
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>Condition · Order frequency</div>
          )}
          {hasPrefs && !editing && (
            <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
              {[prefs.condition, freqLabel ? `Buys ${freqLabel.toLowerCase()}` : null].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <button onClick={editing ? () => setEditing(false) : startEdit}
          style={{ padding: "5px 12px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: editing ? "#F1F5F9" : "#6366F1",
            color:      editing ? "#64748B" : "#fff" }}>
          {editing ? "Cancel" : hasPrefs ? "Edit" : "+ Set"}
        </button>
      </div>

      {editing && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Condition */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>CONDITION</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {CONDITIONS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, condition: c }))}
                  style={{ padding: "5px 10px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: form.condition === c ? "#6366F1" : "#F1F5F9",
                    color:      form.condition === c ? "#fff"    : "#64748B" }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Order frequency */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>ORDER FREQUENCY</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {FREQUENCIES.map(f => (
                <button key={f.days} onClick={() => setForm(frm => ({ ...frm, order_frequency_days: f.days }))}
                  style={{ padding: "5px 10px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: form.order_frequency_days === f.days ? "#6366F1" : "#F1F5F9",
                    color:      form.order_frequency_days === f.days ? "#fff"    : "#64748B" }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={save} disabled={saving}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none",
              background: saving ? "#E2E8F0" : "#6366F1",
              color: saving ? "#94A3B8" : "#fff",
              fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
