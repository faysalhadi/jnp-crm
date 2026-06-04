import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { timeAgo } from "../../utils/helpers";

// Builds a trading profile from trader_inventory for a given trader name
// Used in: trader contact card (compact) + trader detail view (full)

function topItems(listings, key, n = 3) {
  const counts = {};
  listings.forEach(l => {
    const val = (l[key] || "").trim();
    if (!val) return;
    counts[val] = (counts[val] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([val, count]) => ({ val, count }));
}

function priceRange(listings) {
  const prices = listings
    .filter(l => l.price && l.currency === "AED")
    .map(l => Number(l.price));
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function useTraderProfile(traderName) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!traderName) return;
    load();
  }, [traderName]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabase
      .from("trader_inventory")
      .select("type,brand,model,processor,ram,storage,price,currency,created_at")
      .ilike("trader_name", traderName.trim())
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    if (!data?.length) { setProfile(null); setLoading(false); return; }

    const selling = data.filter(l => l.type === "selling");
    const buying  = data.filter(l => l.type === "buying");

    setProfile({
      total: data.length,
      sellingCount: selling.length,
      buyingCount: buying.length,
      lastSeen: data[0]?.created_at,
      // Selling patterns
      topSellBrands:  topItems(selling, "brand"),
      topSellModels:  topItems(selling, "model"),
      sellPriceRange: priceRange(selling),
      // Buying patterns
      topBuyBrands:  topItems(buying, "brand"),
      topBuyModels:  topItems(buying, "model"),
      buyPriceRange: priceRange(buying),
    });
    setLoading(false);
  }

  return { profile, loading };
}

// Compact badge strip — shown on trader card in list
export function TraderProfileBadges({ traderName }) {
  const { profile, loading } = useTraderProfile(traderName);
  if (loading || !profile) return null;

  const sellLabels = profile.topSellBrands.slice(0, 2).map(b => b.val);
  const buyLabels  = profile.topBuyBrands.slice(0, 2).map(b => b.val);

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
      {sellLabels.map(b => (
        <span key={"s_" + b} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: "#ECFDF5", color: "#059669" }}>
          📤 {b}
        </span>
      ))}
      {buyLabels.map(b => (
        <span key={"b_" + b} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: "#EEF2FF", color: "#6366F1" }}>
          📥 {b}
        </span>
      ))}
      {profile.total > 0 && (
        <span style={{ fontSize: 9, color: "#94A3B8", padding: "2px 4px" }}>
          {profile.total} listings · {timeAgo(profile.lastSeen)}
        </span>
      )}
    </div>
  );
}

// Full panel — shown inside trader detail / profile view
export function TraderProfilePanel({ traderName }) {
  const { profile, loading } = useTraderProfile(traderName);

  if (loading) return (
    <div style={{ padding: "14px 16px", background: "#F8FAFC", borderRadius: 12, margin: "0 14px 10px", fontSize: 12, color: "#94A3B8" }}>
      Loading trading profile...
    </div>
  );

  if (!profile) return (
    <div style={{ padding: "14px 16px", background: "#F8FAFC", borderRadius: 12, margin: "0 14px 10px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>📊 Trading Profile</div>
      <div style={{ fontSize: 11, color: "#CBD5E1" }}>No listings found in the last 30 days. Import group chats to build this profile.</div>
    </div>
  );

  return (
    <div style={{ margin: "0 14px 10px", background: "#fff", borderRadius: 16, border: "1px solid #F1F5F9", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #F8FAFC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>📊 Trading Profile</div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>
          {profile.total} listings · last seen {timeAgo(profile.lastSeen)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>

        {/* SELLS */}
        <div style={{ padding: "12px 14px", borderRight: "1px solid #F8FAFC" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#059669", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            📤 SELLS
            <span style={{ fontWeight: 500, color: "#94A3B8" }}>({profile.sellingCount})</span>
          </div>

          {profile.sellingCount === 0 ? (
            <div style={{ fontSize: 11, color: "#CBD5E1" }}>Nothing yet</div>
          ) : (
            <>
              {profile.topSellBrands.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>TOP BRANDS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {profile.topSellBrands.map(({ val, count }) => (
                      <div key={val} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{val}</span>
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile.topSellModels.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>TOP MODELS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {profile.topSellModels.map(({ val, count }) => (
                      <div key={val} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{val}</span>
                        <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0, marginLeft: 4 }}>×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile.sellPriceRange && (
                <div style={{ fontSize: 10, color: "#059669", fontWeight: 600, background: "#ECFDF5", borderRadius: 6, padding: "3px 8px", display: "inline-block" }}>
                  AED {profile.sellPriceRange.min.toLocaleString()} – {profile.sellPriceRange.max.toLocaleString()}
                </div>
              )}
            </>
          )}
        </div>

        {/* BUYS */}
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#6366F1", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            📥 BUYS
            <span style={{ fontWeight: 500, color: "#94A3B8" }}>({profile.buyingCount})</span>
          </div>

          {profile.buyingCount === 0 ? (
            <div style={{ fontSize: 11, color: "#CBD5E1" }}>No buy requests</div>
          ) : (
            <>
              {profile.topBuyBrands.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>TOP BRANDS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {profile.topBuyBrands.map(({ val, count }) => (
                      <div key={val} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{val}</span>
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile.topBuyModels.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>TOP MODELS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {profile.topBuyModels.map(({ val, count }) => (
                      <div key={val} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{val}</span>
                        <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0, marginLeft: 4 }}>×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile.buyPriceRange && (
                <div style={{ fontSize: 10, color: "#6366F1", fontWeight: 600, background: "#EEF2FF", borderRadius: 6, padding: "3px 8px", display: "inline-block" }}>
                  AED {profile.buyPriceRange.min.toLocaleString()} – {profile.buyPriceRange.max.toLocaleString()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
