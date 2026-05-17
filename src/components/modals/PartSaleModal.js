import React, { useState } from "react";
import { supabase } from "../../supabase";

export default function PartSaleModal({ part, onClose, onComplete }) {
  const maxQty = part.quantity || 0;
  const [qtyToSell,    setQtyToSell]    = useState(Math.min(1, maxQty));
  const [customerName, setCustomerName] = useState("");
  const [sellPrice,    setSellPrice]    = useState(String(part.sell_price || ""));
  const [payMethod,    setPayMethod]    = useState("Cash");
  const [saving,       setSaving]       = useState(false);
  const [result,       setResult]       = useState(null);

  const priceN    = Number(sellPrice) || 0;
  const costN     = Number(part.cost_price) || 0;
  const totalRev  = priceN * qtyToSell;
  const totalCost = costN  * qtyToSell;
  const profit    = totalRev - totalCost;
  const margin    = totalRev > 0 ? Math.round((profit / totalRev) * 100) : 0;

  async function complete() {
    if (maxQty === 0) { alert("No stock available"); return; }
    if (qtyToSell < 1 || qtyToSell > maxQty) { alert(`Quantity must be between 1 and ${maxQty}`); return; }
    setSaving(true);
    try {
      const newQty = maxQty - qtyToSell;
      await supabase.from("stock_parts").update({ quantity: newQty }).eq("id", part.id);
      const partLabel = [part.category, part.specs].filter(Boolean).join(" — ");
      const { error: dealError } = await supabase.from("parts_sales").insert({
        part_id:        part.id,
        category:       part.category || "",
        specs:          part.specs || "",
        compatible_with: part.compatible_with || "",
        quantity_sold:  qtyToSell,
        sell_price:     priceN,
        cost_price:     costN,
        total_revenue:  totalRev,
        total_cost:     totalCost,
        profit:         profit,
        customer_name:  customerName.trim() || "Walk-in",
        payment_method: payMethod,
        sold_at:        new Date().toISOString(),
        notes:          `${partLabel} ×${qtyToSell}`,
      });
      if (dealError) throw new Error(dealError.message);
      setResult({ qtyToSell, profit, margin, newQty, partLabel });
      onComplete();
    } catch (e) {
      alert("Error completing sale: " + (e.message || "Unknown error"));
    }
    setSaving(false);
  }

  const partIcon = { RAM:"🧠", SSD:"💾", HDD:"💿", Screen:"🖥️", Battery:"🔋", Charger:"🔌", Keyboard:"⌨️", Trackpad:"🖱️", Other:"🔧" };

  if (result) {
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, overflowY:"auto" }}>
        <div style={{ minHeight:"100%", padding:"20px 12px", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:400, textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#0F172A", marginBottom:6 }}>Part Sold!</div>
            <div style={{ fontSize:14, color:"#64748B", marginBottom:12 }}>
              {result.qtyToSell}× {result.partLabel}
            </div>
            <div style={{ padding:"10px 16px", background:"#ECFDF5", borderRadius:12, marginBottom:12 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#059669" }}>
                Profit: AED {result.profit.toLocaleString()} ({result.margin}%)
              </div>
            </div>
            {result.newQty === 0 && (
              <div style={{ padding:"8px 14px", background:"#FEF2F2", borderRadius:10, marginBottom:12, fontSize:12, color:"#EF4444", fontWeight:700 }}>
                ⚠️ Now out of stock
              </div>
            )}
            <button onClick={onClose} style={{ width:"100%", padding:12, borderRadius:12, border:"none", background:"#6366F1", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer" }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, overflowY:"auto" }}>
      <div style={{ minHeight:"100%", padding:"16px 12px 40px", display:"flex", flexDirection:"column", alignItems:"center" }}>
        <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:440 }}>
          {/* Header */}
          <div style={{ padding:"16px 20px", borderBottom:"1px solid #F1F5F9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>{partIcon[part.category] || "🔧"}</span>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:"#0F172A" }}>Sell Part</div>
                <div style={{ fontSize:12, color:"#94A3B8" }}>{part.category}{part.specs ? ` · ${part.specs}` : ""}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, border:"none", background:"#F1F5F9", cursor:"pointer" }}>✕</button>
          </div>

          <div style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
            {/* Qty */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#94A3B8", letterSpacing:0.5, marginBottom:4 }}>
                QUANTITY TO SELL <span style={{ color:"#6366F1" }}>(max {maxQty})</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button onClick={() => setQtyToSell(q => Math.max(1, q - 1))}
                  style={{ width:36, height:36, borderRadius:10, border:"1.5px solid #E2E8F0", background:"#fff", fontSize:20, cursor:"pointer" }}>−</button>
                <input type="number" value={qtyToSell} onChange={e => setQtyToSell(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
                  min={1} max={maxQty}
                  style={{ flex:1, padding:"8px 12px", borderRadius:10, border:"1.5px solid #E2E8F0", fontSize:18, fontWeight:800, textAlign:"center", outline:"none" }} />
                <button onClick={() => setQtyToSell(q => Math.min(maxQty, q + 1))}
                  style={{ width:36, height:36, borderRadius:10, border:"1.5px solid #E2E8F0", background:"#fff", fontSize:20, cursor:"pointer" }}>+</button>
              </div>
            </div>

            {/* Customer */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#94A3B8", letterSpacing:0.5, marginBottom:4 }}>CUSTOMER NAME (OPTIONAL)</div>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in"
                style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E2E8F0", fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>

            {/* Sell price */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#94A3B8", letterSpacing:0.5, marginBottom:4 }}>SELL PRICE PER UNIT (AED)</div>
              <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E2E8F0", fontSize:15, fontWeight:800, outline:"none", boxSizing:"border-box", color:"#6366F1" }} />
            </div>

            {/* Payment */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#94A3B8", letterSpacing:0.5, marginBottom:6 }}>PAYMENT METHOD</div>
              <div style={{ display:"flex", gap:6 }}>
                {["Cash","Bank Transfer"].map(m => (
                  <button key={m} onClick={() => setPayMethod(m)}
                    style={{ flex:1, padding:"9px 4px", borderRadius:10, border:"none", fontSize:12, fontWeight:700, cursor:"pointer",
                             background:payMethod===m?"#6366F1":"#F1F5F9", color:payMethod===m?"#fff":"#64748B" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Profit preview */}
            {priceN > 0 && (
              <div style={{ padding:"10px 14px", background:"#ECFDF5", borderRadius:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:700, color:"#059669" }}>
                  <span>Total Revenue</span><span>AED {totalRev.toLocaleString()}</span>
                </div>
                {costN > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#10B981", marginTop:3 }}>
                    <span>Profit ({margin}%)</span>
                    <span style={{ fontWeight:700, color:profit>=0?"#10B981":"#EF4444" }}>AED {profit.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            <button onClick={complete} disabled={saving || maxQty === 0}
              style={{ padding:14, borderRadius:12, border:"none", fontSize:14, fontWeight:800,
                       cursor:saving||maxQty===0?"not-allowed":"pointer",
                       background:saving||maxQty===0?"#E2E8F0":"#6366F1",
                       color:saving||maxQty===0?"#94A3B8":"#fff" }}>
              {saving ? "Processing…" : `⚡ Complete Part Sale`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
