import React from "react";
import { useUI } from "../../context/UIContext";
import { useBroadcast } from "../../hooks/useBroadcast";
import { daysSince } from "../../utils/helpers";

export default function BroadcastModal() {
  const { isMobile } = useUI();
  const {
    showBroadcast, setShowBroadcast,
    broadcastItem,
    broadcastClients,
    broadcastSelected, setBroadcastSelected,
    broadcastMessages,
    broadcastLoading,
    broadcastStep, setBroadcastStep,
    broadcastSent, setBroadcastSent,
    generateBroadcastMessages,
  } = useBroadcast();
  if (!showBroadcast) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontWeight: 800, fontSize: 17, color: "#0F172A" }}>📢 Broadcast</span>
            <button onClick={() => setShowBroadcast(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          {/* Device summary — only if broadcast from a specific stock item */}
          {broadcastItem && (
            <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#4338CA" }}>{[broadcastItem.brand, broadcastItem.model].filter(Boolean).join(" ")}</div>
              <div style={{ fontSize: 12, color: "#818CF8" }}>{[broadcastItem.ram, broadcastItem.ssd, broadcastItem.condition].filter(Boolean).join(" · ")} · AED {broadcastItem.max_price?.toLocaleString()}</div>
            </div>
          )}
          {!broadcastItem && (
            <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#64748B" }}>
              Broadcasting to all clients with open deals
            </div>
          )}

          {broadcastStep === "clients" && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10 }}>
                Found {broadcastClients.length} potential buyer{broadcastClients.length !== 1 ? "s" : ""}
              </div>
              {broadcastClients.length === 0
                ? <div style={{ textAlign: "center", padding: 30, color: "#94A3B8" }}>No matching clients found.<br/>No open deals match this device's brand/price.</div>
                : (
                  <>
                    {broadcastClients.map(c => {
                      const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
                      const isSelected = broadcastSelected.has(c.id);
                      const brandMatch = !broadcastItem.brand || !deal?.brand || deal.brand.toLowerCase() === broadcastItem.brand.toLowerCase();
                      const budgetMatch = !broadcastItem.min_price || !deal?.budget || Number(deal.budget) >= Number(broadcastItem.min_price);
                      const strength = brandMatch && budgetMatch ? "✅ Strong" : "⚠️ Partial";
                      return (
                        <div key={c.id} onClick={() => setBroadcastSelected(prev => { const n = new Set(prev); isSelected ? n.delete(c.id) : n.add(c.id); return n; })}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", marginBottom: 6, borderRadius: 12, border: `1.5px solid ${isSelected ? "#6366F1" : "#F1F5F9"}`, background: isSelected ? "#EEF2FF" : "#fff", cursor: "pointer" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: "#94A3B8" }}>{[deal?.brand, deal?.model].filter(Boolean).join(" ") || "No spec"}{deal?.budget ? ` · AED ${deal.budget}` : ""} · {daysSince(c.last_active)}d ago</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: brandMatch && budgetMatch ? "#10B981" : "#F59E0B" }}>{strength}</span>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isSelected ? "#6366F1" : "#E2E8F0"}`, background: isSelected ? "#6366F1" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {isSelected && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={generateBroadcastMessages} disabled={broadcastLoading || broadcastSelected.size === 0}
                      style={{ width: "100%", marginTop: 8, padding: 13, borderRadius: 12, border: "none", background: broadcastSelected.size === 0 || broadcastLoading ? "#E2E8F0" : "#6366F1", color: broadcastSelected.size === 0 || broadcastLoading ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      {broadcastLoading ? "⏳ Generating messages..." : `Generate Messages for ${broadcastSelected.size} Client${broadcastSelected.size !== 1 ? "s" : ""} →`}
                    </button>
                  </>
                )
              }
            </>
          )}

          {broadcastStep === "messages" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8" }}>{broadcastMessages.length} messages ready</div>
                <button onClick={() => setBroadcastStep("clients")} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, cursor: "pointer" }}>← Back</button>
              </div>
              {broadcastMessages.map((item, i) => (
                <div key={i} style={{ background: broadcastSent.has(i) ? "#F0FDF4" : "#F8FAFC", borderRadius: 14, padding: "12px 14px", marginBottom: 8, border: `1px solid ${broadcastSent.has(i) ? "#BBF7D0" : "#E2E8F0"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{item.client.name}</span>
                    {broadcastSent.has(i) && <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>✓ Sent</span>}
                  </div>
                  <textarea defaultValue={item.message} onChange={e => { broadcastMessages[i].message = e.target.value; }} rows={3}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.5, background: "#fff" }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <a href={`https://wa.me/${(item.client.number || "").replace(/\D/g,"")}?text=${encodeURIComponent(item.message)}`} target="_blank" rel="noreferrer"
                      onClick={() => setBroadcastSent(prev => new Set([...prev, i]))}
                      style={{ flex: 1, padding: "7px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                      📱 Open WhatsApp
                    </a>
                    <button onClick={() => setBroadcastSent(prev => new Set([...prev, i]))}
                      style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #BBF7D0", background: broadcastSent.has(i) ? "#ECFDF5" : "#fff", color: "#10B981", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                      ✓ Sent
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
