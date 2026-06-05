import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { scoreMatch } from "../../constants";

const WHATSAPP = "+971509423162";

function fmtAED(price, currency) {
  if (!price) return "—";
  if (!currency || currency === "AED") return "AED " + Number(price).toLocaleString();
  if (currency === "USD") return "AED " + Math.round(Number(price) * 3.67).toLocaleString() + ` ($${price})`;
  if (currency === "GBP") return "AED " + Math.round(Number(price) * 4.65).toLocaleString() + ` (£${price})`;
  return `${currency} ${price}`;
}

function toAED(price, currency) {
  if (!price) return null;
  if (!currency || currency === "AED") return Number(price);
  if (currency === "USD") return Math.round(Number(price) * 3.67);
  if (currency === "GBP") return Math.round(Number(price) * 4.65);
  return Number(price);
}

function budgetOk(budget, price, currency, tolerance = 1.15) {
  if (!budget || !price) return true;
  const priceAED = toAED(price, currency);
  return Number(budget) * tolerance >= priceAED;
}

export default function TraderMatchesPanel() {
  const [loading, setLoading]       = useState(true);
  const [sellMatches, setSellMatches] = useState([]); // your stock → trader buying
  const [sourceMatches, setSourceMatches] = useState([]); // trader selling → client waiting
  const [activeTab, setActiveTab]   = useState("source"); // source | sell
  const [expanded, setExpanded]     = useState({});
  const [copied, setCopied]         = useState({});
  const [stats, setStats]           = useState({ waitingDeals: 0, sellingListings: 0, buyingListings: 0, yourStock: 0 });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [
      { data: allDeals },
      { data: sellingListings },
      { data: buyingListings },
      { data: yourStock },
    ] = await Promise.all([
      supabase.from("deals").select("*, customers(id, name, number)").eq("stage", "new_inquiry"),
      supabase.from("trader_inventory").select("*").eq("type", "selling").gte("created_at", thirtyDaysAgo),
      supabase.from("trader_inventory").select("*").eq("type", "buying").gte("created_at", thirtyDaysAgo),
      supabase.from("stock").select("*").eq("status", "available"),
    ]);

    const waitingDeals = (allDeals || []).filter(d => d.brand || d.model);
    const selling      = sellingListings || [];
    const buying       = buyingListings  || [];
    const stock        = yourStock       || [];

    setStats({ waitingDeals: waitingDeals.length, sellingListings: selling.length, buyingListings: buying.length, yourStock: stock.length });

    // ── Section 1: You can SOURCE (trader selling → client waiting) ──
    // Auto-link trader numbers from contacts
    const { data: traderContacts } = await supabase
      .from("customers")
      .select("id, name, number")
      .eq("contact_type", "trader");

    const traderNumberMap = {};
    (traderContacts || []).forEach(t => {
      if (t.name && t.number) traderNumberMap[t.name.toLowerCase().trim()] = t.number;
    });
    const srcResults = [];
    for (const listing of selling) {
      const matchingDeals = waitingDeals
        .map(deal => ({
          ...deal,
          matchScore: scoreMatch(listing.brand, listing.model, deal.brand, deal.model),
        }))
        .filter(deal => deal.matchScore.score >= 2 && budgetOk(deal.budget, listing.price, listing.currency))
        .sort((a, b) => b.matchScore.score - a.matchScore.score);

      if (matchingDeals.length > 0) {
        const bestBudget = Math.max(...matchingDeals.map(d => Number(d.budget) || 0));
        const traderPriceAED = toAED(listing.price, listing.currency) || 0;
        const estMargin = bestBudget && traderPriceAED ? bestBudget - traderPriceAED : null;
        const topScore = matchingDeals[0].matchScore;
        // Auto-link number from contacts if listing has none
        const resolvedNumber = listing.trader_number ||
          traderNumberMap[(listing.trader_name || "").toLowerCase().trim()] || null;
        srcResults.push({ listing: { ...listing, trader_number: resolvedNumber }, deals: matchingDeals, estMargin, topScore });
      }
    }
    srcResults.sort((a, b) => (b.topScore.score - a.topScore.score) || ((b.estMargin || 0) - (a.estMargin || 0)));
    setSourceMatches(srcResults);

    // ── Section 2: You can SELL (your stock → trader buying) ──
    const sellResults = [];
    for (const item of stock) {
      const matchingBuyers = buying
        .map(b => ({
          ...b,
          matchScore: scoreMatch(item.brand, item.model, b.brand, b.model),
        }))
        .filter(b => {
          if (b.matchScore.score < 2) return false;
          if (b.price && item.cost_price) {
            const buyPriceAED = toAED(b.price, b.currency) || 0;
            if (buyPriceAED < Number(item.cost_price)) return false;
          }
          return true;
        })
        .sort((a, b) => b.matchScore.score - a.matchScore.score);

      if (matchingBuyers.length > 0) {
        const bestOffer = Math.max(...matchingBuyers.map(b => toAED(b.price, b.currency) || 0));
        const profit    = bestOffer && item.cost_price ? bestOffer - Number(item.cost_price) : null;
        const topScore  = matchingBuyers[0].matchScore;
        // Auto-link numbers from contacts
        const resolvedBuyers = matchingBuyers.map(b => ({
          ...b,
          trader_number: b.trader_number ||
            traderNumberMap[(b.trader_name || "").toLowerCase().trim()] || null,
        }));
        sellResults.push({ stock: item, buyers: resolvedBuyers, bestOffer, profit, topScore });
      }
    }
    sellResults.sort((a, b) => (b.topScore.score - a.topScore.score) || ((b.profit || 0) - (a.profit || 0)));
    setSellMatches(sellResults);

    // Default to whichever tab has matches
    if (srcResults.length > 0) setActiveTab("source");
    else if (sellResults.length > 0) setActiveTab("sell");

    setLoading(false);
  }

  function copyWA(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
  }

  function buildSourceMsg(listing, deals) {
    const device = [listing.brand, listing.model].filter(Boolean).join(" ") || "device";
    const specs  = [listing.processor, listing.ram, listing.storage].filter(Boolean).join(", ");
    const client = deals[0]?.customers?.name || "mera client";
    return `Bhai, ${device}${specs ? ` (${specs})` : ""} available hai aapke paas? ${client} ko chahiye. Price aur condition batao? 🙏`;
  }

  function buildSellMsg(item, buyer) {
    const device = [item.brand, item.model].filter(Boolean).join(" ") || "laptop";
    const specs  = [item.processor, item.ram, item.ssd, `Grade ${item.condition}`].filter(Boolean).join(", ");
    const price  = item.min_price ? `AED ${Number(item.min_price).toLocaleString()}` : "good price";
    return `Bhai, ${device}${specs ? ` (${specs})` : ""} available hai mere paas — ${price}. Interested ho? 🙏`;
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>Loading matches...</div>;
  }

  const totalMatches = sourceMatches.length + sellMatches.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{ padding: "12px 12px 0" }}>
        <div style={{ background: "linear-gradient(135deg, #6366F1, #7C3AED)", borderRadius: 14, padding: "12px 14px", color: "#fff", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
            🎯 {totalMatches} match{totalMatches !== 1 ? "es" : ""} found
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            {[
              { label: "Waiting clients", val: stats.waitingDeals },
              { label: "Trader selling", val: stats.sellingListings },
              { label: "Trader buying",  val: stats.buyingListings },
              { label: "Your stock",     val: stats.yourStock },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{s.val}</div>
                <div style={{ fontSize: 8, opacity: 0.85, lineHeight: 1.3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
          <button onClick={() => setActiveTab("source")}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
              background: activeTab === "source" ? "#6366F1" : "#F1F5F9",
              color:      activeTab === "source" ? "#fff"    : "#64748B" }}>
            🔵 Source ({sourceMatches.length})
            <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>Trader selling → client waiting</div>
          </button>
          <button onClick={() => setActiveTab("sell")}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
              background: activeTab === "sell" ? "#10B981" : "#F1F5F9",
              color:      activeTab === "sell" ? "#fff"    : "#64748B" }}>
            🟢 Sell ({sellMatches.length})
            <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>Your stock → trader buying</div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 100px" }}>

        {/* ── SOURCE TAB ── */}
        {activeTab === "source" && (
          sourceMatches.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔵</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No source matches</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4, lineHeight: 1.6 }}>
                Matches appear when traders are selling what your clients are waiting for
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sourceMatches.map((match, i) => {
                const { listing, deals, estMargin } = match;
                const isExp = expanded[`src_${i}`];
                const msgKey = `src_msg_${i}`;
                const msg = buildSourceMsg(listing, deals);
                const waUrl = listing.trader_number
                  ? `https://wa.me/${listing.trader_number.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`
                  : null;

                return (
                  <div key={i} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1.5px solid #E0E7FF", boxShadow: "0 1px 4px rgba(99,102,241,0.07)" }}>

                    {/* Trader listing */}
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                            🔵 TRADER SELLING
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                              background: match.topScore.bg, color: match.topScore.color }}>
                              {match.topScore.emoji} {match.topScore.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                            {[listing.brand, listing.model].filter(Boolean).join(" ") || "Unknown Device"}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                            {[listing.processor, listing.ram, listing.storage, listing.condition].filter(Boolean).join(" · ")}
                          </div>
                          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
                            👤 {listing.trader_name || "Unknown"}{listing.quantity > 1 ? ` · ×${listing.quantity}` : ""}
                            {listing.source_group ? ` · ${listing.source_group}` : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#6366F1" }}>
                            {fmtAED(listing.price, listing.currency)}
                          </div>
                          {estMargin > 0 && (
                            <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700, marginTop: 2 }}>
                              ~AED {estMargin.toLocaleString()} margin
                            </div>
                          )}
                        </div>
                      </div>

                      {/* WhatsApp actions */}
                      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                        <button onClick={() => copyWA(msg, msgKey)}
                          style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                            background: copied[msgKey] ? "#ECFDF5" : "#F1F5F9",
                            color: copied[msgKey] ? "#059669" : "#64748B" }}>
                          {copied[msgKey] ? "✓ Copied!" : "📋 Copy message"}
                        </button>
                        {waUrl ? (
                          <a href={waUrl} target="_blank" rel="noreferrer"
                            style={{ flex: 1, padding: "7px 0", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                            💬 WhatsApp trader
                          </a>
                        ) : (
                          <div style={{ flex: 1, padding: "7px 0", borderRadius: 8, background: "#F1F5F9", color: "#CBD5E1", fontSize: 11, fontWeight: 700, textAlign: "center" }}>
                            No number
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Waiting clients */}
                    <button onClick={() => setExpanded(e => ({ ...e, [`src_${i}`]: !e[`src_${i}`] }))}
                      style={{ width: "100%", padding: "9px 14px", border: "none", background: "#F8FAFC", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>
                        ✅ {deals.length} client{deals.length !== 1 ? "s" : ""} waiting for this
                      </span>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>{isExp ? "▲" : "▼"}</span>
                    </button>

                    {isExp && (
                      <div style={{ borderTop: "1px solid #F1F5F9" }}>
                        {deals.map((deal, di) => {
                          const customer = deal.customers;
                          const clientWaUrl = customer?.number
                            ? `https://wa.me/${customer.number.replace(/\D/g, "")}?text=${encodeURIComponent(`${customer.name} bhai, ${[listing.brand, listing.model].filter(Boolean).join(" ")} mil sakta hai — price confirm karta hoon. Interest hai?`)}`
                            : null;
                          return (
                            <div key={di} style={{ padding: "10px 14px", borderBottom: di < deals.length - 1 ? "1px solid #F8FAFC" : "none",
                              display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EEF2FF", flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#6366F1" }}>
                                {(customer?.name || "?")[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{customer?.name}</div>
                                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                                  Budget {deal.budget ? `AED ${Number(deal.budget).toLocaleString()}` : "not set"}
                                  {deal.model ? ` · wants ${[deal.brand, deal.model].filter(Boolean).join(" ")}` : ""}
                                </div>
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, flexShrink: 0,
                                background: deal.matchScore.bg, color: deal.matchScore.color }}>
                                {deal.matchScore.emoji} {deal.matchScore.label}
                              </span>
                              {clientWaUrl && (
                                <a href={clientWaUrl} target="_blank" rel="noreferrer"
                                  style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
                                  WA
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── SELL TAB ── */}
        {activeTab === "sell" && (
          sellMatches.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🟢</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No sell matches</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4, lineHeight: 1.6 }}>
                Matches appear when traders want to buy what you have in stock
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sellMatches.map((match, i) => {
                const { stock: item, buyers, bestOffer, profit } = match;
                const isExp = expanded[`sell_${i}`];

                return (
                  <div key={i} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1.5px solid #D1FAE5", boxShadow: "0 1px 4px rgba(16,185,129,0.07)" }}>

                    {/* Your stock item */}
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                            🟢 YOUR STOCK
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                              background: match.topScore.bg, color: match.topScore.color }}>
                              {match.topScore.emoji} {match.topScore.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                            {[item.brand, item.model].filter(Boolean).join(" ") || "Unknown"}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                            {[item.processor, item.ram, item.ssd, `Grade ${item.condition}`].filter(Boolean).join(" · ")}
                          </div>
                          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                            Cost: AED {Number(item.cost_price || 0).toLocaleString()}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {bestOffer > 0 && (
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#10B981" }}>
                              AED {bestOffer.toLocaleString()}
                            </div>
                          )}
                          {profit > 0 && (
                            <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700, marginTop: 2 }}>
                              ~AED {profit.toLocaleString()} profit
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Buyers toggle */}
                    <button onClick={() => setExpanded(e => ({ ...e, [`sell_${i}`]: !e[`sell_${i}`] }))}
                      style={{ width: "100%", padding: "9px 14px", border: "none", background: "#F8FAFC", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6366F1" }}>
                        🔵 {buyers.length} trader{buyers.length !== 1 ? "s" : ""} want{buyers.length === 1 ? "s" : ""} to buy this
                      </span>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>{isExp ? "▲" : "▼"}</span>
                    </button>

                    {isExp && (
                      <div style={{ borderTop: "1px solid #F1F5F9" }}>
                        {buyers.map((buyer, bi) => {
                          const msg    = buildSellMsg(item, buyer);
                          const msgKey = `sell_msg_${i}_${bi}`;
                          const waUrl  = buyer.trader_number
                            ? `https://wa.me/${buyer.trader_number.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`
                            : null;
                          const buyerPriceAED = toAED(buyer.price, buyer.currency);
                          return (
                            <div key={bi} style={{ padding: "10px 14px", borderBottom: bi < buyers.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{buyer.trader_name || "Unknown"}</div>
                                  <div style={{ fontSize: 11, color: "#94A3B8" }}>
                                    {buyer.source_group || ""}
                                    {[buyer.brand, buyer.model].filter(Boolean).length > 0 ? ` · wants ${[buyer.brand, buyer.model].filter(Boolean).join(" ")}` : ""}
                                  </div>
                                </div>
                                {buyerPriceAED > 0 && (
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>
                                      AED {buyerPriceAED.toLocaleString()}
                                    </div>
                                    {item.cost_price && (
                                      <div style={{ fontSize: 10, color: buyerPriceAED > item.cost_price ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                                        {buyerPriceAED > item.cost_price
                                          ? `+AED ${(buyerPriceAED - item.cost_price).toLocaleString()}`
                                          : `-AED ${(item.cost_price - buyerPriceAED).toLocaleString()}`}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => copyWA(msg, msgKey)}
                                  style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                                    background: copied[msgKey] ? "#ECFDF5" : "#F1F5F9",
                                    color: copied[msgKey] ? "#059669" : "#64748B" }}>
                                  {copied[msgKey] ? "✓ Copied" : "📋 Copy msg"}
                                </button>
                                {waUrl ? (
                                  <a href={waUrl} target="_blank" rel="noreferrer"
                                    style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                                    💬 WhatsApp
                                  </a>
                                ) : (
                                  <div style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: "#F1F5F9", color: "#CBD5E1", fontSize: 11, textAlign: "center" }}>
                                    No number
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
