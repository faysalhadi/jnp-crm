import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { getMatchCategory, MATCH_CATEGORIES } from "../../constants";

function fmtAED(price, currency) {
  if (!price) return "—";
  if (!currency || currency === "AED") return "AED " + Number(price).toLocaleString();
  if (currency === "USD") return "AED " + Math.round(Number(price) * 3.67).toLocaleString() + ` ($${price})`;
  if (currency === "GBP") return "AED " + Math.round(Number(price) * 4.65).toLocaleString() + ` (£${price})`;
  return `${currency} ${price}`;
}

export default function TraderMatchesPanel() {
  const [waitingDeals, setWaitingDeals] = useState([]);
  const [traderListings, setTraderListings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);

    // Load waiting client deals — must have brand or model set to match
    const { data: allDeals } = await supabase
      .from("deals")
      .select("*, customers(id, name, number)")
      .eq("stage", "waiting")
      .neq("match_category", "none");

    // Filter out deals with no brand AND no model — they would match everything
    const deals = (allDeals || []).filter(d => d.brand || d.model);

    // Load trader selling listings
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: listings } = await supabase
      .from("trader_inventory")
      .select("*")
      .eq("type", "selling")
      .eq("status", "active")
      .gte("created_at", thirtyDaysAgo);

    if (!deals || !listings) { setLoading(false); return; }

    setWaitingDeals(deals);
    setTraderListings(listings);

    // Match each trader listing against waiting client deals
    const results = [];
    for (const listing of listings) {
      const listingCat = getMatchCategory(listing.brand, listing.model, listing.processor);
      if (listingCat === "none") continue;

      const matchingDeals = deals.filter(deal => {
        if (!deal.match_category || deal.match_category === "none") return false;

        // Brand must match if client specified one
        if (deal.brand) {
          const db = deal.brand.toLowerCase();
          const lb = (listing.brand || "").toLowerCase();
          if (lb && db && !lb.includes(db) && !db.includes(lb)) return false;
        }

        // Model must match if client specified one (loose — keywords)
        if (deal.model) {
          const dm = deal.model.toLowerCase();
          const lm = (listing.model || "").toLowerCase();
          if (lm && dm) {
            // Split model into words and check at least half match
            const dmWords = dm.split(/\s+/).filter(w => w.length > 2);
            if (dmWords.length > 0) {
              const matched = dmWords.filter(w => lm.includes(w));
              if (matched.length < Math.ceil(dmWords.length * 0.5)) return false;
            }
          }
        }

        // Budget check with 15% tolerance
        if (deal.budget && listing.price) {
          const priceAED = listing.currency === "USD"
            ? listing.price * 3.67
            : listing.currency === "GBP"
            ? listing.price * 4.65
            : listing.price;
          if (Number(deal.budget) * 1.15 < priceAED) return false;
        }
        return true;
      });

      if (matchingDeals.length > 0) {
        results.push({ listing, deals: matchingDeals, listingCat });
      }
    }

    // Sort by most matches first
    results.sort((a, b) => b.deals.length - a.deals.length);
    setMatches(results);
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
        Loading matches...
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No matches found</div>
        <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4, lineHeight: 1.6 }}>
          Matches appear when trader selling listings align with your waiting clients' requirements
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 12px 100px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ padding: "10px 14px", borderRadius: 14, background: "linear-gradient(135deg, #6366F1, #7C3AED)", color: "#fff" }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>
          🎯 {matches.length} trader listing{matches.length !== 1 ? "s" : ""} match waiting clients
        </div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>
          {waitingDeals.length} waiting clients · {traderListings.length} active trader listings
        </div>
      </div>

      {/* Match cards */}
      {matches.map((match, i) => {
        const { listing, deals, listingCat } = match;
        const catDef = MATCH_CATEGORIES.find(c => c.id === listingCat);
        const isExpanded = expanded[i];

        return (
          <div key={i} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #F1F5F9", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

            {/* Trader listing */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6366F1" }}>
                      {catDef?.icon} {catDef?.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                    {[listing.brand, listing.model].filter(Boolean).join(" ") || "Unknown Device"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                    {[listing.processor, listing.ram, listing.storage, listing.condition].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    📦 {listing.trader_name || "Unknown Trader"}
                    {listing.quantity > 1 && ` · ×${listing.quantity} units`}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>
                    {fmtAED(listing.price, listing.currency)}
                  </div>
                  {listing.quantity > 1 && (
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>×{listing.quantity} available</div>
                  )}
                </div>
              </div>

              {/* Contact trader */}
              {listing.trader_number && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={`tel:${listing.trader_number}`}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                    📞 Call Trader
                  </a>
                  <a href={`https://wa.me/${listing.trader_number.replace(/\D/g, "")}`}
                    target="_blank" rel="noreferrer"
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                    💬 WhatsApp
                  </a>
                </div>
              )}
            </div>

            {/* Matching clients */}
            <button onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
              style={{ width: "100%", padding: "10px 14px", border: "none", background: "#F8FAFC", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>
                ✅ {deals.length} client{deals.length !== 1 ? "s" : ""} waiting for this
              </span>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>{isExpanded ? "▲" : "▼"}</span>
            </button>

            {isExpanded && (
              <div style={{ borderTop: "1px solid #F1F5F9" }}>
                {deals.map((deal, di) => {
                  const customer = deal.customers;
                  return (
                    <div key={di} style={{
                      padding: "10px 14px", borderBottom: di < deals.length - 1 ? "1px solid #F8FAFC" : "none",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#EEF2FF", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 800, color: "#6366F1" }}>
                        {(customer?.name || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{customer?.name}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                          {deal.budget ? `Budget AED ${Number(deal.budget).toLocaleString()}` : "No budget set"}
                          {deal.brand || deal.model ? ` · Looking for ${[deal.brand, deal.model].filter(Boolean).join(" ")}` : ""}
                        </div>
                      </div>
                      {customer?.number && (
                        <a href={`https://wa.me/${customer.number.replace(/\D/g, "")}`}
                          target="_blank" rel="noreferrer"
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
  );
}
