import React from "react";
import { useParts } from "../../context/PartsContext";
import { useUI } from "../../context/UIContext";
import Spinner from "../ui/Spinner";
import PartSaleModal from "../modals/PartSaleModal";
import { PART_ICONS, PART_CATEGORIES, EMPTY_PART } from "../../constants";

export default function PartsView() {
  const {
    parts, partsLoading, loadParts,
    showAddPart, setShowAddPart,
    editingPart, setEditingPart,
    partForm, setPartForm,
    showPartSale, setShowPartSale,
    partSaleTarget, setPartSaleTarget,
    partsSold, partsSoldLoading,
    partsRevMTD, loadPartsRevMTD,
    savePart, deletePart,
    loadPartsSold,
  } = useParts();
  const { showToast } = useUI();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>🔧 Spare Parts</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{parts.length} part{parts.length !== 1 ? "s" : ""} in inventory</div>
        </div>
        <button onClick={() => { setEditingPart(null); setPartForm(EMPTY_PART); setShowAddPart(true); }}
          style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          + Add Part
        </button>
      </div>

      {partsLoading && <Spinner />}

      {!partsLoading && parts.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#CBD5E1" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔧</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No parts yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tap + Add Part to start tracking spare parts</div>
        </div>
      )}

      {parts.map(p => (
        <div key={p.id} style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 18 }}>{PART_ICONS[p.category] || "🔧"}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{p.category}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10,
                  background: p.quantity === 0 ? "#FEF2F2" : "#ECFDF5",
                  color:      p.quantity === 0 ? "#EF4444" : "#059669",
                }}>
                  {p.quantity === 0 ? "Out of stock" : `×${p.quantity}`}
                </span>
              </div>
              {p.compatible_with && <div style={{ fontSize: 12, color: "#6366F1", fontWeight: 600 }}>🖥️ {p.compatible_with}</div>}
              {p.specs        && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{p.specs}</div>}
              {p.condition    && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{p.condition}</div>}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
              {p.sell_price && <div style={{ fontSize: 14, fontWeight: 800, color: "#10B981" }}>AED {Number(p.sell_price).toLocaleString()}</div>}
              {p.cost_price && <div style={{ fontSize: 11, color: "#94A3B8" }}>Cost: AED {Number(p.cost_price).toLocaleString()}</div>}
              {p.sell_price && p.cost_price && (() => {
                const prof = Number(p.sell_price) - Number(p.cost_price);
                return <div style={{ fontSize: 11, fontWeight: 700, color: prof >= 0 ? "#10B981" : "#EF4444" }}>+AED {prof.toLocaleString()}/unit</div>;
              })()}
            </div>
          </div>
          {p.source && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>📦 {p.source}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setEditingPart(p); setPartForm({ category: p.category || "RAM", compatible_with: p.compatible_with || "", specs: p.specs || "", condition: p.condition || "Used", quantity: p.quantity ?? 1, cost_price: p.cost_price ?? "", sell_price: p.sell_price ?? "", source: p.source || "", notes: p.notes || "" }); setShowAddPart(true); }}
              style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✏️ Edit</button>
            <button onClick={() => { setPartSaleTarget(p); setShowPartSale(true); }}
              disabled={p.quantity === 0}
              style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: p.quantity === 0 ? "not-allowed" : "pointer",
                       background: p.quantity === 0 ? "#F1F5F9" : "#6366F1", color: p.quantity === 0 ? "#94A3B8" : "#fff" }}>⚡ Sell</button>
            <button onClick={() => { if (window.confirm("Delete this part?")) deletePart(p.id); }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🗑</button>
          </div>
        </div>
      ))}

      {/* Add/Edit Part Modal */}
      {showAddPart && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 440 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{editingPart ? "Edit Part" : "Add Part"}</span>
                <button onClick={() => { setShowAddPart(false); setEditingPart(null); setPartForm(EMPTY_PART); }} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>CATEGORY</div>
                <select value={partForm.category} onChange={e => setPartForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", background: "#fff" }}>
                  {PART_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {[
                { label: "COMPATIBLE WITH",   key: "compatible_with", ph: 'e.g. "MacBook Air M2" or "Universal"' },
                { label: "SPECS",             key: "specs",           ph: 'e.g. "8GB DDR4 3200MHz"' },
                { label: "SUPPLIER / SOURCE", key: "source",          ph: "e.g. Electro CW, local market" },
              ].map(({ label, key, ph }) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                  <input value={partForm[key]} onChange={e => setPartForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>CONDITION</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["New", "Used", "Pulled"].map(c => (
                    <button key={c} onClick={() => setPartForm(f => ({ ...f, condition: c }))}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                               background: partForm.condition === c ? "#6366F1" : "#F1F5F9",
                               color:      partForm.condition === c ? "#fff"    : "#64748B" }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "QUANTITY",   key: "quantity",   type: "number", ph: "1" },
                  { label: "COST (AED)", key: "cost_price", type: "number", ph: "0" },
                  { label: "SELL (AED)", key: "sell_price", type: "number", ph: "0" },
                ].map(({ label, key, type, ph }) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                    <input type={type} value={partForm[key]} onChange={e => setPartForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES</div>
                <textarea value={partForm.notes} onChange={e => setPartForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  placeholder="Any extra notes…"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowAddPart(false); setEditingPart(null); setPartForm(EMPTY_PART); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button onClick={savePart}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  {editingPart ? "Save Changes" : "Add Part"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
