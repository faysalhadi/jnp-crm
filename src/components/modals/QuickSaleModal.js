import React, { useState } from "react";
import { supabase } from "../../supabase";
import { parseGB, labelGB } from "../../utils/helpers";

export default function QuickSaleModal({ stock, onClose, onComplete, prefill = null }) {
  const [step,           setStep]           = useState(prefill?.item ? 3 : 1);
  const [search,         setSearch]         = useState("");
  const [selected,       setSelected]       = useState(prefill?.item ? [prefill.item] : []);
  const [name,           setName]           = useState(prefill?.name || "");
  const [number,         setNumber]         = useState(prefill?.number || "");
  const [addToContacts,  setAddToContacts]  = useState(false);
  const [prices,         setPrices]         = useState(prefill?.item ? { [prefill.item.id]: prefill.overridePrice ?? prefill.item.max_price ?? "" } : {});
  const [paymentMethod,  setPaymentMethod]  = useState("Cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [saving,         setSaving]         = useState(false);
  const [result,         setResult]         = useState(null);
  const [inlineUpgrades, setInlineUpgrades] = useState({}); // { [itemId]: { expanded, selRam, ramPrices, selSsd, ssdPrices } }

  const available = stock.filter(s => s.status === "available");
  const filteredStock = search
    ? available.filter(s =>
        [s.brand, s.model, s.processor, s.ram, s.ssd, s.serial_number]
          .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()))
    : available;

  function toggle(item) {
    if (selected.find(s => s.id === item.id)) {
      setSelected(sel => sel.filter(s => s.id !== item.id));
    } else {
      setSelected(sel => [...sel, item]);
      if (prices[item.id] === undefined) setPrices(p => ({ ...p, [item.id]: item.max_price ?? "" }));
    }
  }

  const totalSold   = selected.reduce((s, i) => s + (Number(prices[i.id]) || 0), 0);
  const totalCost   = selected.reduce((s, i) => s + (Number(i.cost_price) || 0), 0);
  const totalProfit = totalSold - totalCost;
  const margin      = totalSold > 0 ? Math.round((totalProfit / totalSold) * 100) : 0;

  async function complete() {
    if (!selected.length) return;
    setSaving(true);
    try {
      const soldAt       = new Date().toISOString();
      const customerName = name.trim() || "Walk-in Customer";

      // Step 1: Complete the sale — stock + deals must succeed regardless of contact creation
      for (const item of selected) {
        const soldPrice = Number(prices[item.id]) || Number(item.max_price) || 0;
        await supabase.from("stock").update({
          status: "sold", sold_price: soldPrice, sold_at: soldAt,
        }).eq("id", item.id);
        const inlineUpg = inlineUpgrades[item.id];
        const inlineNote = inlineUpg ? [
          inlineUpg.selRam ? `RAM → ${labelGB(inlineUpg.selRam)}` : null,
          inlineUpg.selSsd ? `Storage → ${labelGB(inlineUpg.selSsd)}` : null,
        ].filter(Boolean).join(", ") : null;
        const dealNote = [prefill?.upgradeNote, inlineNote].filter(Boolean).join("; ") || null;
        await supabase.from("deals").insert({
          sale_type: "walkin", stage: "closed", closed_at: soldAt,
          value: soldPrice, walk_in_name: customerName,
          walk_in_number: number.trim() || null,
          payment_method: paymentMethod,
          brand: item.brand || null, model: item.model || null,
          ram: item.ram || null, storage: item.ssd || null,
          condition: item.condition || null,
          ...(dealNote ? { notes: dealNote } : {}),
        });
      }

      // Step 2: Optionally create contact — failure here does NOT block the sale
      if (addToContacts) {
        try {
          const { data: cust } = await supabase.from("customers").insert({
            name: customerName, number: number.trim() || null,
            tier: "cold", urgent: false, contact_type: "client",
          }).select().single();
          if (cust?.id) {
            for (const item of selected) {
              await supabase.from("stock").update({ sold_to_customer_id: cust.id }).eq("id", item.id);
            }
          }
        } catch {
          // Contact creation failed — sale is already complete, continue
        }
      }

      const resultItems = selected.map(i => ({ ...i, soldPrice: Number(prices[i.id]) || 0 }));
      setResult({ items: resultItems, totalSold, totalProfit, margin });
      onComplete();
    } catch (e) {
      alert("Error completing sale: " + (e.message || "Unknown error"));
    }
    setSaving(false);
  }

  function buildReceipt() {
    const date     = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const num      = `LFL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const custName = name.trim() || "Walk-in Customer";
    const lines    = result.items.map(i =>
      `${[i.brand, i.model].filter(Boolean).join(" ") || "Device"}: AED ${Number(prices[i.id] || i.max_price || 0).toLocaleString()}`
    ).join("\n");
    const balance  = paymentMethod === "Partial" ? Math.max(0, totalSold - (Number(amountReceived) || 0)) : 0;
    return `━━━━━━━━━━━━━━━━━━━━━━
      LAPTOP FOR LESS
      UAE | laptopforless.ae
━━━━━━━━━━━━━━━━━━━━━━
RECEIPT #: ${num}
Date: ${date}

SOLD TO:
Name: ${custName}${number.trim() ? `\nContact: ${number.trim()}` : ""}

DEVICE(S):
${lines}

PAYMENT:
Total: AED ${totalSold.toLocaleString()}
Method: ${paymentMethod}${paymentMethod === "Partial" ? `\nPaid: AED ${Number(amountReceived || 0).toLocaleString()}\nBalance Due: AED ${balance.toLocaleString()}` : ""}

Thank you for your purchase! 🙏
For any issues contact us on WhatsApp.
━━━━━━━━━━━━━━━━━━━━━━`;
  }

  function resetModal() {
    setResult(null); setStep(1); setSelected([]); setSearch(""); setName("");
    setNumber(""); setAddToContacts(false); setPrices({}); setPaymentMethod("Cash"); setAmountReceived("");
  }

  // ── Success screen ──
  if (result) {
    const receipt = buildReceipt();
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
        <div style={{ minHeight: "100%", padding: "20px 12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 12 }}>Sale Complete!</div>
            {result.items.map(i => {
              const profit = i.soldPrice - (Number(i.cost_price) || 0);
              return (
                <div key={i.id} style={{ marginBottom: 8, padding: "10px 14px", background: "#F8FAFC", borderRadius: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{[i.brand, i.model].filter(Boolean).join(" ") || "Device"}</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                    Sold: <b style={{ color: "#0F172A" }}>AED {i.soldPrice.toLocaleString()}</b>
                    {" · "}Profit: <b style={{ color: profit >= 0 ? "#10B981" : "#EF4444" }}>AED {profit.toLocaleString()}</b>
                  </div>
                </div>
              );
            })}
            {result.items.length > 1 && (
              <div style={{ marginTop: 4, padding: "10px 14px", background: "#ECFDF5", borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>
                  Total: AED {result.totalSold.toLocaleString()} · Profit: AED {result.totalProfit.toLocaleString()} ({result.margin}%)
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
              <button onClick={() => { navigator.clipboard.writeText(receipt); }}
                style={{ padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                🧾 Copy Receipt
              </button>
              <button onClick={resetModal}
                style={{ padding: 12, borderRadius: 12, border: "1.5px solid #6366F1", background: "#EEF2FF", color: "#6366F1", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                ⚡ New Sale
              </button>
              <button onClick={onClose}
                style={{ padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Modal steps ──
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, overflow: "hidden" }}>

          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>⚡ Quick Sale</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                Step {step} of 3 · {["Select Device", "Customer Info", "Payment"][step - 1]}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: "#F1F5F9" }}>
            <div style={{ height: "100%", width: `${(step / 3) * 100}%`, background: "#6366F1", transition: "width 0.3s" }} />
          </div>

          {/* ── STEP 1: Device selection ── */}
          {step === 1 && (
            <div style={{ padding: 16 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search device…"
                style={{ width: "100%", padding: "9px 13px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
              <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredStock.length === 0 && (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#CBD5E1", fontSize: 13 }}>
                    {available.length === 0 ? "No available stock" : "No matches found"}
                  </div>
                )}
                {filteredStock.map(item => {
                  const isSel  = !!selected.find(s => s.id === item.id);
                  const specs  = [item.processor, item.ram, item.ssd, item.condition].filter(Boolean).join(" · ");
                  return (
                    <div key={item.id} onClick={() => toggle(item)}
                      style={{ padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${isSel ? "#6366F1" : "#F1F5F9"}`,
                               background: isSel ? "#EEF2FF" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${isSel ? "#6366F1" : "#CBD5E1"}`,
                                    background: isSel ? "#6366F1" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSel && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>{[item.brand, item.model].filter(Boolean).join(" ") || "Device"}</div>
                        {specs && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{specs}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>AED {Number(item.max_price || 0).toLocaleString()}</div>
                        {item.condition && <div style={{ fontSize: 10, color: "#94A3B8" }}>{item.condition}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selected.length > 0 && (
                <div style={{ marginTop: 10, padding: "10px 14px", background: "#EEF2FF", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#6366F1" }}>{selected.length} item{selected.length !== 1 ? "s" : ""} selected</span>
                  <button onClick={() => setStep(2)}
                    style={{ padding: "7px 18px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Customer Info ── */}
          {step === 2 && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NAME (OPTIONAL)</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Walk-in Customer"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>WHATSAPP NUMBER (OPTIONAL)</div>
                <input value={number} onChange={e => setNumber(e.target.value)} placeholder="+971 50 000 0000"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div onClick={() => setAddToContacts(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
                         border: `1.5px solid ${addToContacts ? "#6366F1" : "#E2E8F0"}`, cursor: "pointer",
                         background: addToContacts ? "#EEF2FF" : "#fff" }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${addToContacts ? "#6366F1" : "#CBD5E1"}`,
                              background: addToContacts ? "#6366F1" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {addToContacts && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: addToContacts ? "#6366F1" : "#0F172A" }}>Add to contacts for follow-up</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>Creates a client record for future outreach</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>← Back</button>
                <button onClick={() => setStep(3)} style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Next →</button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Payment ── */}
          {step === 3 && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {selected.map(item => {
                const soldP  = Number(prices[item.id]) || 0;
                const cost   = Number(item.cost_price) || 0;
                const prof   = soldP - cost;
                const marg   = soldP > 0 ? Math.round((prof / soldP) * 100) : 0;
                return (
                  <div key={item.id} style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
                      {[item.brand, item.model].filter(Boolean).join(" ") || "Device"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, flex: 1 }}>SOLD PRICE (AED)</div>
                      <input type="number" value={prices[item.id] ?? ""} onChange={e => setPrices(p => ({ ...p, [item.id]: e.target.value }))}
                        style={{ width: 120, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 15, fontWeight: 700, outline: "none", textAlign: "right" }} />
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94A3B8", flexWrap: "wrap" }}>
                      <span>Cost: AED {cost.toLocaleString()}</span>
                      <span>Listed: AED {Number(item.max_price || 0).toLocaleString()}</span>
                      <span style={{ color: prof >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                        Profit: AED {prof.toLocaleString()} ({marg}%)
                      </span>
                    </div>

                    {/* Inline upgrade section */}
                    {(() => {
                      const upg = inlineUpgrades[item.id] || {};
                      const curRam = parseGB(item.ram);
                      const curSsd = parseGB(item.ssd);
                      const ramOpts = [8,16,32,64].filter(g => g > curRam);
                      const ssdOpts = [256,512,1024].filter(g => g > curSsd);
                      if (ramOpts.length === 0 && ssdOpts.length === 0) return null;
                      return (
                        <div style={{ marginTop: 8 }}>
                          {!upg.expanded ? (
                            <button onClick={() => setInlineUpgrades(u => ({ ...u, [item.id]: { ...upg, expanded: true } }))}
                              style={{ fontSize: 11, fontWeight: 700, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                              ⬆ Add Upgrades
                            </button>
                          ) : (
                            <div style={{ padding: "10px 12px", background: "#FFFBEB", borderRadius: 10, border: "1px solid #FDE68A" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#D97706" }}>UPGRADES</span>
                                <button onClick={() => setInlineUpgrades(u => ({ ...u, [item.id]: { expanded: false } }))}
                                  style={{ fontSize: 10, color: "#94A3B8", border: "none", background: "none", cursor: "pointer" }}>✕</button>
                              </div>
                              {[
                                { label: "RAM", opts: ramOpts, key: "selRam", priceKey: "ramPrices", cur: curRam },
                                { label: "Storage", opts: ssdOpts, key: "selSsd", priceKey: "ssdPrices", cur: curSsd },
                              ].map(({ label, opts, key, priceKey, cur }) => opts.length > 0 && (
                                <div key={label} style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, marginBottom: 4 }}>{label.toUpperCase()} UPGRADE</div>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    <button onClick={() => {
                                      const newUpg = { ...inlineUpgrades[item.id], [key]: null };
                                      const ramAdd = newUpg.selRam ? (Number((newUpg.ramPrices||{})[newUpg.selRam]) || 0) : 0;
                                      const ssdAdd = newUpg.selSsd ? (Number((newUpg.ssdPrices||{})[newUpg.selSsd]) || 0) : 0;
                                      setPrices(p => ({ ...p, [item.id]: String((Number(item.max_price)||0) + ramAdd + ssdAdd) }));
                                      setInlineUpgrades(u => ({ ...u, [item.id]: newUpg }));
                                    }} style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${upg[key] == null ? "#F59E0B" : "#E2E8F0"}`, background: upg[key] == null ? "#F59E0B" : "#fff", color: upg[key] == null ? "#fff" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                      {labelGB(cur) || "Current"}
                                    </button>
                                    {opts.map(gb => (
                                      <div key={gb} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <button onClick={() => setInlineUpgrades(u => ({ ...u, [item.id]: { ...u[item.id], [key]: gb } }))}
                                          style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${upg[key] === gb ? "#F59E0B" : "#E2E8F0"}`, background: upg[key] === gb ? "#F59E0B" : "#fff", color: upg[key] === gb ? "#fff" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                          {labelGB(gb)}
                                        </button>
                                        {upg[key] === gb && (
                                          <input type="number" placeholder="+AED" value={(upg[priceKey]||{})[gb] ?? ""}
                                            onChange={e => {
                                              const newPrices = { ...(upg[priceKey]||{}), [gb]: e.target.value };
                                              const newUpg = { ...inlineUpgrades[item.id], [priceKey]: newPrices };
                                              const ramAdd = (key === "selRam" ? Number(e.target.value) : Number((newUpg.ramPrices||{})[newUpg.selRam])) || 0;
                                              const ssdAdd = (key === "selSsd" ? Number(e.target.value) : Number((newUpg.ssdPrices||{})[newUpg.selSsd])) || 0;
                                              setPrices(p => ({ ...p, [item.id]: String((Number(item.max_price)||0) + ramAdd + ssdAdd) }));
                                              setInlineUpgrades(u => ({ ...u, [item.id]: newUpg }));
                                            }}
                                            style={{ width: 72, padding: "4px 6px", borderRadius: 6, border: "1px solid #FDE68A", fontSize: 12, fontWeight: 700, textAlign: "right", outline: "none", color: "#D97706" }} />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>PAYMENT METHOD</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["Cash", "Bank Transfer", "Partial"].map(m => (
                    <button key={m} onClick={() => setPaymentMethod(m)}
                      style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                               background: paymentMethod === m ? "#6366F1" : "#F1F5F9", color: paymentMethod === m ? "#fff" : "#64748B" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === "Partial" && (
                <div style={{ padding: "12px 14px", background: "#FFFBEB", borderRadius: 12, border: "1px solid #FEF3C7" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>AMOUNT RECEIVED (AED)</div>
                  <input type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} placeholder="0"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #FDE68A", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
                  {amountReceived && (
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#92400E", fontWeight: 700 }}>
                      <span>Balance due:</span>
                      <span>AED {Math.max(0, totalSold - Number(amountReceived)).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {selected.length > 1 && (
                <div style={{ padding: "12px 14px", background: "#ECFDF5", borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, color: "#059669" }}>
                    <span>Total</span><span>AED {totalSold.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#10B981", fontWeight: 700, marginTop: 4 }}>
                    <span>Total Profit</span><span>AED {totalProfit.toLocaleString()} ({margin}%)</span>
                  </div>
                </div>
              )}

              {prefill?.depositPaid > 0 && (
                <div style={{ padding: "10px 14px", background: "#FFFBEB", borderRadius: 12, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>
                    Deposit already paid: AED {Number(prefill.depositPaid).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>
                    Balance due: AED {Math.max(0, totalSold - Number(prefill.depositPaid)).toLocaleString()}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>← Back</button>
                <button onClick={complete} disabled={saving}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer",
                           background: saving ? "#E2E8F0" : "#6366F1", color: saving ? "#94A3B8" : "#fff" }}>
                  {saving ? "Processing…" : "⚡ Complete Sale"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
