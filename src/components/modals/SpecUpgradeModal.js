import React, { useState } from "react";
import { parseGB, labelGB } from "../../utils/helpers";

export default function SpecUpgradeModal({ item, onClose, onApply }) {
  const RAM_TIERS = [8, 16, 32, 64];
  const SSD_TIERS = [256, 512, 1024, 2048];

  const curRam = parseGB(item.ram);
  const curSsd = parseGB(item.ssd);

  const ramOptions = RAM_TIERS.filter(g => g > curRam);
  const ssdOptions = SSD_TIERS.filter(g => g > curSsd);

  const [selRam,    setSelRam]    = useState(null);
  const [ramPrices, setRamPrices] = useState({});
  const [selSsd,    setSelSsd]    = useState(null);
  const [ssdPrices, setSsdPrices] = useState({});

  const base     = Number(item.max_price) || 0;
  const ramCost  = selRam ? (Number(ramPrices[selRam]) || 0) : 0;
  const ssdCost  = selSsd ? (Number(ssdPrices[selSsd]) || 0) : 0;
  const final    = base + ramCost + ssdCost;
  const hasUpgrade = selRam || selSsd;

  const upgradeNote = [
    selRam ? `RAM ${item.ram || "?"} → ${labelGB(selRam)}` : null,
    selSsd ? `Storage ${item.ssd || "?"} → ${labelGB(selSsd)}` : null,
  ].filter(Boolean).join(", ");

  function apply(option) {
    onApply(option, {
      newRam:      selRam ? labelGB(selRam) : item.ram,
      newSsd:      selSsd ? labelGB(selSsd) : item.ssd,
      finalPrice:  final,
      upgradeNote: upgradeNote || null,
    });
  }

  const OptionRow = ({ label, options, sel, setSel, prices, setPrices, cur }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div onClick={() => setSel(null)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
                   border: `1.5px solid ${sel === null ? "#6366F1" : "#F1F5F9"}`,
                   background: sel === null ? "#EEF2FF" : "#F8FAFC", cursor: "pointer" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${sel === null ? "#6366F1" : "#CBD5E1"}`,
                        background: sel === null ? "#6366F1" : "transparent", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: sel === null ? "#6366F1" : "#64748B" }}>
            {cur > 0 ? labelGB(cur) : "Current"} — no change
          </span>
        </div>
        {options.map(gb => (
          <div key={gb} onClick={() => setSel(gb)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
                     border: `1.5px solid ${sel === gb ? "#F59E0B" : "#F1F5F9"}`,
                     background: sel === gb ? "#FFFBEB" : "#F8FAFC", cursor: "pointer" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${sel === gb ? "#F59E0B" : "#CBD5E1"}`,
                          background: sel === gb ? "#F59E0B" : "transparent", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: sel === gb ? "#D97706" : "#0F172A" }}>
              {labelGB(gb)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>+AED</span>
              <input type="number" placeholder="0" value={prices[gb] ?? ""}
                onClick={e => { e.stopPropagation(); setSel(gb); }}
                onChange={e => { setSel(gb); setPrices(p => ({ ...p, [gb]: e.target.value })); }}
                style={{ width: 72, padding: "4px 8px", borderRadius: 8, border: "1.5px solid #FDE68A",
                         fontSize: 13, fontWeight: 700, textAlign: "right", outline: "none", color: "#D97706" }} />
            </div>
          </div>
        ))}
        {options.length === 0 && (
          <div style={{ fontSize: 12, color: "#CBD5E1", padding: "6px 12px" }}>Already at max tier</div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480 }}>
          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>⬆ Spec Upgrade</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                {[item.brand, item.model].filter(Boolean).join(" ") || "Device"}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ padding: 16 }}>
            {/* Current specs */}
            <div style={{ padding: "10px 14px", background: "#F8FAFC", borderRadius: 12, marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "Base Price", value: `AED ${base.toLocaleString()}` },
                item.ram     && { label: "RAM",     value: item.ram },
                item.ssd     && { label: "Storage", value: item.ssd },
                item.condition && { label: "Condition", value: item.condition },
              ].filter(Boolean).map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700, letterSpacing: 0.4 }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{f.value}</div>
                </div>
              ))}
            </div>

            <OptionRow label="RAM UPGRADE" options={ramOptions} sel={selRam} setSel={setSelRam}
              prices={ramPrices} setPrices={setRamPrices} cur={curRam} />
            <OptionRow label="STORAGE UPGRADE" options={ssdOptions} sel={selSsd} setSel={setSelSsd}
              prices={ssdPrices} setPrices={setSsdPrices} cur={curSsd} />

            {/* Price breakdown */}
            <div style={{ padding: "12px 14px", background: "#FFFBEB", borderRadius: 12, marginBottom: 14, border: "1px solid #FDE68A" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#92400E", marginBottom: 4 }}>
                <span>Base price</span><span>AED {base.toLocaleString()}</span>
              </div>
              {selRam && ramCost > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#92400E", marginBottom: 4 }}>
                  <span>+ RAM {labelGB(selRam)}</span><span>AED {ramCost.toLocaleString()}</span>
                </div>
              )}
              {selSsd && ssdCost > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#92400E", marginBottom: 4 }}>
                  <span>+ Storage {labelGB(selSsd)}</span><span>AED {ssdCost.toLocaleString()}</span>
                </div>
              )}
              <div style={{ borderTop: "1px solid #FDE68A", paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#D97706" }}>
                <span>Final price</span><span>AED {final.toLocaleString()}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => apply("update_stock")} disabled={!hasUpgrade}
                style={{ padding: 13, borderRadius: 12, border: "none", fontSize: 13, fontWeight: 800,
                         cursor: hasUpgrade ? "pointer" : "not-allowed",
                         background: hasUpgrade ? "#6366F1" : "#E2E8F0",
                         color: hasUpgrade ? "#fff" : "#94A3B8" }}>
                💾 Update Stock Specs + Sell
              </button>
              <button onClick={() => apply("price_only")} disabled={!hasUpgrade}
                style={{ padding: 13, borderRadius: 12, border: "1.5px solid #6366F1", fontSize: 13, fontWeight: 800,
                         cursor: hasUpgrade ? "pointer" : "not-allowed",
                         background: "#fff", color: hasUpgrade ? "#6366F1" : "#94A3B8" }}>
                ⚡ Sell at AED {final.toLocaleString()} (keep stock as-is)
              </button>
              {!hasUpgrade && (
                <div style={{ textAlign: "center", fontSize: 11, color: "#94A3B8" }}>Select an upgrade above to continue</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
