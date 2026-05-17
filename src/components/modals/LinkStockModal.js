import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import Spinner from "../ui/Spinner";
import { parseGB, labelGB } from "../../utils/helpers";

export default function LinkStockModal({ customer, deal, onClose, onDone }) {
  const [devices,    setDevices]    = useState([]);
  const [parts,      setParts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState("devices"); // "devices" | "parts"
  const [devSearch,  setDevSearch]  = useState("");
  const [partSearch, setPartSearch] = useState("");
  const [selItems,   setSelItems]   = useState([]);   // array of selected item objects
  const [prices,     setPrices]     = useState({});   // { [id]: price string }
  const [quantities, setQuantities] = useState({});   // { [id]: qty number } for parts
  const [saving,         setSaving]         = useState(false);
  const [upgradeRam,     setUpgradeRam]     = useState(null);
  const [upgradeRamPrice,setUpgradeRamPrice]= useState("");
  const [upgradeSsd,     setUpgradeSsd]     = useState(null);
  const [upgradeSsdPrice,setUpgradeSsdPrice]= useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("stock").select("*").eq("status", "available").order("brand"),
      supabase.from("stock_parts").select("*").gt("quantity", 0).order("category"),
    ]).then(([{ data: d }, { data: p }]) => {
      setDevices(d || []);
      setParts(p || []);
      setLoading(false);
    });
  }, []);

  function toggleItem(item, isDevice) {
    const id = item.id;
    const already = selItems.find(s => s.id === id);
    if (already) {
      setSelItems(s => s.filter(x => x.id !== id));
      setPrices(p => { const n = { ...p }; delete n[id]; return n; });
      setQuantities(q => { const n = { ...q }; delete n[id]; return n; });
    } else {
      setSelItems(s => [...s, { ...item, _isDevice: isDevice }]);
      setPrices(p => ({ ...p, [id]: String(isDevice ? (item.max_price || "") : (item.sell_price || "")) }));
      if (!isDevice) setQuantities(q => ({ ...q, [id]: 1 }));
    }
  }

  const selDevices = selItems.filter(i => i._isDevice);
  const selParts   = selItems.filter(i => !i._isDevice);

  const grandTotal = selItems.reduce((sum, item) => {
    const price = Number(prices[item.id]) || 0;
    const qty   = item._isDevice ? 1 : (quantities[item.id] || 1);
    return sum + price * qty;
  }, 0);

  const grandProfit = selItems.reduce((sum, item) => {
    const price = Number(prices[item.id]) || 0;
    const cost  = Number(item.cost_price) || 0;
    const qty   = item._isDevice ? 1 : (quantities[item.id] || 1);
    return sum + (price - cost) * qty;
  }, 0);

  const filtDev  = devices.filter(d =>
    [d.brand, d.model, d.processor, d.ram, d.ssd, d.condition].filter(Boolean).join(" ").toLowerCase().includes(devSearch.toLowerCase()));
  const filtPart = parts.filter(p =>
    [p.category, p.specs, p.compatible_with].filter(Boolean).join(" ").toLowerCase().includes(partSearch.toLowerCase()));

  async function confirm() {
    if (selItems.length === 0) return;
    if (!deal?.id) { alert("No active deal found. Please try again."); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const firstDevice = selDevices[0] || null;

      for (const item of selDevices) {
        const soldPrice = Number(prices[item.id]) || 0;
        await supabase.from("stock").update({
          status: "sold",
          sold_price: soldPrice,
          sold_at: now,
          sold_to_customer_id: customer?.id || null,
        }).eq("id", item.id);
        if (upgradeRam || upgradeSsd) {
          const specUpdate = {};
          if (upgradeRam) specUpdate.ram = labelGB(upgradeRam);
          if (upgradeSsd) specUpdate.ssd = labelGB(upgradeSsd);
          await supabase.from("stock").update(specUpdate).eq("id", item.id);
        }
      }

      for (const item of selParts) {
        const salePrice = Number(prices[item.id]) || 0;
        const qty = quantities[item.id] || 1;
        const newQty = (item.quantity || 0) - qty;
        await supabase.from("stock_parts").update({ quantity: newQty }).eq("id", item.id);
        const partLabel = [item.category, item.specs].filter(Boolean).join(" — ");
        await supabase.from("parts_sales").insert({
          part_id: item.id,
          category: item.category || "",
          specs: item.specs || "",
          compatible_with: item.compatible_with || "",
          quantity_sold: qty,
          sell_price: salePrice,
          cost_price: Number(item.cost_price) || 0,
          total_revenue: salePrice * qty,
          total_cost: (Number(item.cost_price) || 0) * qty,
          profit: (salePrice - (Number(item.cost_price) || 0)) * qty,
          customer_name: customer?.name || "Customer",
          customer_id: customer?.id || null,
          payment_method: "cash",
          sold_at: now,
          notes: partLabel,
        });
      }

      await supabase.from("deals").update({
        stage: "closed",
        closed_at: now,
        value: grandTotal,
        ...(firstDevice ? { stock_item_id: firstDevice.id } : {}),
        ...(customer?.contact_type === "walkin" ? { sale_type: "walkin" } : {}),
      }).eq("id", deal.id);

      // Save to deal_items for deal-centric tracking
      for (const item of selDevices) {
        await supabase.from("deal_items").insert({
          deal_id: deal.id,
          item_type: "device",
          stock_id: item.id,
          brand: item.brand || null,
          model: item.model || null,
          ram: item.ram || null,
          ssd: item.ssd || null,
          condition: item.condition || null,
          processor: item.processor || null,
          serial_number: item.serial_number || null,
          agreed_price: Number(prices[item.id]) || 0,
        });
      }
      for (const item of selParts) {
        await supabase.from("deal_items").insert({
          deal_id: deal.id,
          item_type: "part",
          part_id: item.id,
          category: item.category || null,
          specs: item.specs || null,
          quantity: quantities[item.id] || 1,
          agreed_price: Number(prices[item.id]) || 0,
        });
      }

      onDone();
    } catch (e) {
      setSaving(false);
      alert("Error: " + (e.message || "Unknown error"));
    }
  }

  const isSelected = (id) => !!selItems.find(s => s.id === id);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480 }}>

          {/* Header */}
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>✅ Link Stock to Deal</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                {customer?.name || "Customer"} — {[deal?.brand, deal?.model].filter(Boolean).join(" ") || "Open deal"}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #F1F5F9" }}>
            {[["devices", "💻 Devices"], ["parts", "🔧 Parts"]].map(([tab, label]) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                  background: activeTab === tab ? "#6366F1" : "#fff",
                  color: activeTab === tab ? "#fff" : "#64748B",
                  borderBottom: activeTab === tab ? "2px solid #6366F1" : "2px solid transparent",
                  transition: "all 0.15s" }}>
                {label}
                {tab === "devices" && selDevices.length > 0 && (
                  <span style={{ marginLeft: 6, background: activeTab === tab ? "rgba(255,255,255,0.3)" : "#EEF2FF", color: activeTab === tab ? "#fff" : "#6366F1", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>
                    {selDevices.length}
                  </span>
                )}
                {tab === "parts" && selParts.length > 0 && (
                  <span style={{ marginLeft: 6, background: activeTab === tab ? "rgba(255,255,255,0.3)" : "#EEF2FF", color: activeTab === tab ? "#fff" : "#6366F1", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>
                    {selParts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Devices tab */}
            {activeTab === "devices" && (
              <>
                <input value={devSearch} onChange={e => setDevSearch(e.target.value)} placeholder="🔍 Search devices…"
                  style={{ width: "100%", padding: "9px 13px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                {loading ? <Spinner /> : (
                  <>
                    <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                      {filtDev.length === 0
                        ? <div style={{ textAlign: "center", padding: "24px 0", color: "#CBD5E1", fontSize: 13 }}>{devSearch ? "No matches" : "No available devices"}</div>
                        : filtDev.map(d => {
                            const sel = isSelected(d.id);
                            const specs = [d.processor, d.ram, d.ssd, d.condition].filter(Boolean).join(" · ");
                            return (
                              <div key={d.id} onClick={() => toggleItem(d, true)}
                                style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                                         border: `1.5px solid ${sel ? "#6366F1" : "#F1F5F9"}`, background: sel ? "#EEF2FF" : "#F8FAFC" }}>
                                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `2px solid ${sel ? "#6366F1" : "#CBD5E1"}`, background: sel ? "#6366F1" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {sel && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{[d.brand, d.model].filter(Boolean).join(" ") || "Device"}</div>
                                  {specs && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{specs}</div>}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1", flexShrink: 0 }}>AED {Number(d.max_price || 0).toLocaleString()}</div>
                              </div>
                            );
                          })
                      }
                    </div>
                    {selDevices.map(d => {
                      const curRam = parseGB(d.ram); const curSsd = parseGB(d.ssd);
                      const ramOpts = [8,16,32,64].filter(g => g > curRam);
                      const ssdOpts = [256,512,1024,2048].filter(g => g > curSsd);
                      return (
                        <div key={d.id} style={{ background: "#EEF2FF", borderRadius: 10, border: "1.5px solid #C7D2FE", overflow: "hidden" }}>
                          <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "#6366F1" }}>
                            {[d.brand, d.model].filter(Boolean).join(" ") || "Device"}
                          </div>
                          <div style={{ padding: "0 12px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Sale price: AED</span>
                            <input type="number" value={prices[d.id] || ""} onChange={e => setPrices(p => ({ ...p, [d.id]: e.target.value }))}
                              style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #C7D2FE", fontSize: 14, fontWeight: 800, outline: "none", color: "#6366F1" }} />
                          </div>
                          {(ramOpts.length > 0 || ssdOpts.length > 0) && (
                            <div style={{ margin: "0 12px 10px", padding: "10px 12px", background: "#FFFBEB", borderRadius: 10, border: "1px solid #FDE68A" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#D97706", marginBottom: 6 }}>⬆ SPEC UPGRADE</div>
                              {ramOpts.length > 0 && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700, marginBottom: 3 }}>RAM</div>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    <button onClick={() => { setUpgradeRam(null); setPrices(p => ({ ...p, [d.id]: String((Number(d.max_price)||0)+(upgradeSsd?(Number(upgradeSsdPrice)||0):0)) })); }}
                                      style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${!upgradeRam?"#F59E0B":"#E2E8F0"}`, background: !upgradeRam?"#F59E0B":"#fff", color: !upgradeRam?"#fff":"#64748B", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{labelGB(curRam)||"Cur"}</button>
                                    {ramOpts.map(gb => (
                                      <button key={gb} onClick={() => { setUpgradeRam(gb); }}
                                        style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${upgradeRam===gb?"#F59E0B":"#E2E8F0"}`, background: upgradeRam===gb?"#F59E0B":"#fff", color: upgradeRam===gb?"#fff":"#64748B", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{labelGB(gb)}</button>
                                    ))}
                                    {upgradeRam && <input type="number" placeholder="+AED" value={upgradeRamPrice}
                                      onChange={e => { setUpgradeRamPrice(e.target.value); setPrices(p => ({ ...p, [d.id]: String((Number(d.max_price)||0)+(Number(e.target.value)||0)+(upgradeSsd?(Number(upgradeSsdPrice)||0):0)) })); }}
                                      style={{ width: 70, padding: "3px 6px", borderRadius: 6, border: "1px solid #FDE68A", fontSize: 11, outline: "none", color: "#D97706" }} />}
                                  </div>
                                </div>
                              )}
                              {ssdOpts.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700, marginBottom: 3 }}>STORAGE</div>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    <button onClick={() => { setUpgradeSsd(null); setPrices(p => ({ ...p, [d.id]: String((Number(d.max_price)||0)+(upgradeRam?(Number(upgradeRamPrice)||0):0)) })); }}
                                      style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${!upgradeSsd?"#F59E0B":"#E2E8F0"}`, background: !upgradeSsd?"#F59E0B":"#fff", color: !upgradeSsd?"#fff":"#64748B", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{labelGB(curSsd)||"Cur"}</button>
                                    {ssdOpts.map(gb => (
                                      <button key={gb} onClick={() => { setUpgradeSsd(gb); }}
                                        style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${upgradeSsd===gb?"#F59E0B":"#E2E8F0"}`, background: upgradeSsd===gb?"#F59E0B":"#fff", color: upgradeSsd===gb?"#fff":"#64748B", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{labelGB(gb)}</button>
                                    ))}
                                    {upgradeSsd && <input type="number" placeholder="+AED" value={upgradeSsdPrice}
                                      onChange={e => { setUpgradeSsdPrice(e.target.value); setPrices(p => ({ ...p, [d.id]: String((Number(d.max_price)||0)+(upgradeRam?(Number(upgradeRamPrice)||0):0)+(Number(e.target.value)||0)) })); }}
                                      style={{ width: 70, padding: "3px 6px", borderRadius: 6, border: "1px solid #FDE68A", fontSize: 11, outline: "none", color: "#D97706" }} />}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
            {/* Parts tab */}
            {activeTab === "parts" && (
              <>
                <input value={partSearch} onChange={e => setPartSearch(e.target.value)} placeholder="🔍 Search parts…"
                  style={{ width: "100%", padding: "9px 13px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                {loading ? <Spinner /> : (
                  <>
                    <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                      {filtPart.length === 0
                        ? <div style={{ textAlign: "center", padding: "24px 0", color: "#CBD5E1", fontSize: 13 }}>{partSearch ? "No matches" : "No parts in stock"}</div>
                        : filtPart.map(p => {
                            const sel = isSelected(p.id);
                            return (
                              <div key={p.id} onClick={() => toggleItem(p, false)} style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                                       border: `1.5px solid ${sel ? "#6366F1" : "#F1F5F9"}`, background: sel ? "#EEF2FF" : "#F8FAFC" }}>
                                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `2px solid ${sel ? "#6366F1" : "#CBD5E1"}`, background: sel ? "#6366F1" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {sel && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{p.category}{p.specs ? ` · ${p.specs}` : ""}</div>
                                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                                    {p.compatible_with && <span>{p.compatible_with} · </span>}
                                    <span>×{p.quantity} in stock</span>
                                  </div>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1", flexShrink: 0 }}>AED {Number(p.sell_price || 0).toLocaleString()}</div>
                              </div>
                            );
                          })
                      }
                    </div>
                    {selParts.map(p => (
                      <div key={p.id} style={{ background: "#EEF2FF", borderRadius: 10, border: "1.5px solid #C7D2FE", padding: "8px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#6366F1", marginBottom: 6 }}>
                          {p.category}{p.specs ? ` · ${p.specs}` : ""}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600, flexShrink: 0 }}>Qty:</span>
                          <input type="number" min={1} max={p.quantity} value={quantities[p.id] || 1}
                            onChange={e => setQuantities(q => ({ ...q, [p.id]: Math.min(p.quantity, Math.max(1, parseInt(e.target.value) || 1)) }))}
                            style={{ width: 60, padding: "6px 8px", borderRadius: 8, border: "1.5px solid #C7D2FE", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "center" }} />
                          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600, flexShrink: 0 }}>Price: AED</span>
                          <input type="number" value={prices[p.id] || ""} onChange={e => setPrices(pr => ({ ...pr, [p.id]: e.target.value }))}
                            style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #C7D2FE", fontSize: 14, fontWeight: 800, outline: "none", color: "#6366F1" }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
            {/* Summary */}
            {selItems.length > 0 && (
              <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>SUMMARY</div>
                {selDevices.map(d => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 4 }}>
                    <span>{[d.brand, d.model].filter(Boolean).join(" ") || "Device"}</span>
                    <span style={{ fontWeight: 700 }}>AED {(Number(prices[d.id]) || 0).toLocaleString()}</span>
                  </div>
                ))}
                {selParts.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 4 }}>
                    <span>{p.category}{p.specs ? ` · ${p.specs}` : ""} ×{quantities[p.id] || 1}</span>
                    <span style={{ fontWeight: 700 }}>AED {((Number(prices[p.id]) || 0) * (quantities[p.id] || 1)).toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #E2E8F0", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>AED {grandTotal.toLocaleString()}</span>
                </div>
                {grandProfit !== 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>Profit</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: grandProfit >= 0 ? "#10B981" : "#EF4444" }}>AED {grandProfit.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <button onClick={confirm} disabled={saving || selItems.length === 0}
              style={{ padding: 13, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800,
                cursor: saving || selItems.length === 0 ? "not-allowed" : "pointer",
                background: saving || selItems.length === 0 ? "#E2E8F0" : "#10B981",
                color: saving || selItems.length === 0 ? "#94A3B8" : "#fff" }}>
              {saving ? "Saving…" : selItems.length === 0 ? "✅ Confirm Sale" : `✅ Confirm Sale — AED ${grandTotal.toLocaleString()}`}
            </button>
            <button onClick={() => onDone()}
              style={{ padding: 11, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>
              Not from stock — close deal only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
