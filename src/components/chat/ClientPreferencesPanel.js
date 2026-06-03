import React, { useState } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";
import { BRANDS } from "../../constants";

const CONDITIONS = ["Grade A", "Grade B", "Grade A or B", "Any"];
const FREQUENCIES = [
  { label: "Daily",        days: 1 },
  { label: "Every 3 days", days: 3 },
  { label: "Weekly",       days: 7 },
  { label: "Every 2 weeks",days: 14 },
  { label: "Monthly",      days: 30 },
];

export default function ClientPreferencesPanel() {
  const { activeCustomerId, activeCustomer, loadCustomers } = useCustomers();
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const prefs = activeCustomer?.preferences || {};

  const [form, setForm] = useState({
    brands:               prefs.brands              || [],
    condition:            prefs.condition            || "",
    budget_min:           prefs.budget_min           || "",
    budget_max:           prefs.budget_max           || "",
    typical_quantity:     prefs.typical_quantity     || "",
    order_frequency_days: prefs.order_frequency_days || 14,
    notes:                prefs.notes               || "",
  });

  function startEdit() {
    const p = activeCustomer?.preferences || {};
    setForm({
      brands:               p.brands              || [],
      condition:            p.condition            || "",
      budget_min:           p.budget_min           || "",
      budget_max:           p.budget_max           || "",
      typical_quantity:     p.typical_quantity     || "",
      order_frequency_days: p.order_frequency_days || 14,
      notes:                p.notes               || "",
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    await supabase.from("customers").update({ preferences: form }).eq("id", activeCustomerId);
    await loadCustomers();
    setSaving(false);
    setEditing(false);
  }

  function toggleBrand(brand) {
    const current = form.brands || [];
    setForm(f => ({
      ...f,
      brands: current.includes(brand)
        ? current.filter(b => b !== brand)
        : [...current, brand],
    }));
  }

  const hasPrefs = prefs.brands?.length || prefs.condition || prefs.budget_max;

  return (
    <div style={{ borderTop: "1px solid #F1F5F9" }}>
      <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F8FAFC" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>🎯 Standing Preferences</div>
          {!hasPrefs && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>What do they regularly buy?</div>}
          {hasPrefs && !editing && (
            <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
              {(prefs.brands || []).join(", ") || "Any brand"}
              {prefs.condition ? ` · ${prefs.condition}` : ""}
              {prefs.budget_max ? ` · AED ${prefs.budget_min || 0}–${prefs.budget_max}` : ""}
              {prefs.typical_quantity ? ` · ${prefs.typical_quantity} units` : ""}
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

          {/* Brands */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>BRANDS THEY BUY</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {["HP", "Dell", "Lenovo", "Apple", "Microsoft", "Asus", "Acer", "Samsung"].map(b => {
                const sel = (form.brands || []).includes(b);
                return (
                  <button key={b} onClick={() => toggleBrand(b)}
                    style={{ padding: "5px 10px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      background: sel ? "#6366F1" : "#F1F5F9",
                      color:      sel ? "#fff"    : "#64748B" }}>
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

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

          {/* Budget range */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>BUDGET PER UNIT (AED)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" value={form.budget_min} onChange={e => setForm(f => ({ ...f, budget_min: e.target.value }))}
                placeholder="Min"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none" }} />
              <span style={{ color: "#94A3B8", fontSize: 12 }}>to</span>
              <input type="number" value={form.budget_max} onChange={e => setForm(f => ({ ...f, budget_max: e.target.value }))}
                placeholder="Max"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none" }} />
            </div>
          </div>

          {/* Typical quantity + frequency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>TYPICAL QTY</div>
              <input type="number" value={form.typical_quantity} onChange={e => setForm(f => ({ ...f, typical_quantity: e.target.value }))}
                placeholder="e.g. 10"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>ORDER FREQUENCY</div>
              <select value={form.order_frequency_days} onChange={e => setForm(f => ({ ...f, order_frequency_days: Number(e.target.value) }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 11, outline: "none", boxSizing: "border-box" }}>
                {FREQUENCIES.map(f => <option key={f.days} value={f.days}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>NOTES</div>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Pays cash, prefers morning calls, needs invoice"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>

          <button onClick={save} disabled={saving}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: saving ? "#E2E8F0" : "#6366F1", color: saving ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      )}
    </div>
  );
}
