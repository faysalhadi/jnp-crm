import React, { useState } from "react";
import { FACEBOOK_GROUPS } from "../../constants/facebookGroups";

const BATCH_CONFIG = [
  { key: "a",         label: "Batch A",   sub: "Post daily",      color: "#6366F1", bg: "#EEF2FF", time: "9:00 AM" },
  { key: "b",         label: "Batch B",   sub: "Post regularly",  color: "#D97706", bg: "#FFFBEB", time: "11:00 AM" },
  { key: "c",         label: "Batch C",   sub: "Rotate weekly",   color: "#10B981", bg: "#ECFDF5", time: "2:00 PM" },
  { key: "sourcing",  label: "Sourcing",  sub: "Find stock here",  color: "#2563EB", bg: "#EFF6FF", time: null },
  { key: "technical", label: "Technical", sub: "Knowledge groups", color: "#64748B", bg: "#F8FAFC", time: null },
];

export default function GroupsTab() {
  const [activeBatch, setActiveBatch] = useState("a");
  const [searchQ, setSearchQ]         = useState("");

  const current    = FACEBOOK_GROUPS[activeBatch] || [];
  const activeCfg  = BATCH_CONFIG.find(b => b.key === activeBatch);
  const filtered   = searchQ
    ? current.filter(g =>
        g.name.toLowerCase().includes(searchQ.toLowerCase()) ||
        g.country.toLowerCase().includes(searchQ.toLowerCase()))
    : current;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Strategy banner */}
      <div style={{ background: "linear-gradient(135deg, #128C7E, #25D366)", borderRadius: 16, padding: 14, color: "#fff" }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>💬 205 Groups — Posting Strategy</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          {BATCH_CONFIG.filter(b => b.time).map(b => (
            <div key={b.key} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 8px" }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{(FACEBOOK_GROUPS[b.key] || []).length}</div>
              <div style={{ fontSize: 9, opacity: 0.85 }}>{b.label} · {b.time}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, opacity: 0.8, lineHeight: 1.6 }}>
          ⚠️ Never send identical messages to 5+ groups in a row · ⏰ Space batches 90 mins apart
        </div>
      </div>

      {/* Batch pills */}
      <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none" }}>
        {BATCH_CONFIG.map(b => (
          <button key={b.key}
            onClick={() => { setActiveBatch(b.key); setSearchQ(""); }}
            style={{
              padding: "6px 12px", borderRadius: 20, border: "none",
              flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: activeBatch === b.key ? b.color : "#F1F5F9",
              color:      activeBatch === b.key ? "#fff"   : "#64748B",
            }}>
            {b.label} ({(FACEBOOK_GROUPS[b.key] || []).length})
          </button>
        ))}
      </div>

      {/* Batch header */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", border: `1.5px solid ${activeCfg.bg}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: activeCfg.color }}>{activeCfg.label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: activeCfg.color, background: activeCfg.bg, padding: "2px 8px", borderRadius: 20 }}>
            {current.length} groups
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>
          {activeCfg.sub}{activeCfg.time ? ` · Post at ${activeCfg.time}` : ""}
        </div>
      </div>

      {/* Search */}
      <input
        value={searchQ}
        onChange={e => setSearchQ(e.target.value)}
        placeholder={`🔍 Search ${activeCfg.label} groups by name or country...`}
        style={{ padding: "9px 12px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#fff", fontSize: 13, outline: "none" }}
      />

      {/* Group list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 28, color: "#94A3B8", fontSize: 12 }}>
            No groups match your search
          </div>
        )}
        {filtered.map((g, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: 12, padding: "10px 12px",
            border: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.name}
              </div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3, display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span style={{ background: "#F1F5F9", padding: "1px 6px", borderRadius: 6 }}>{g.country}</span>
                <span style={{ background: "#F1F5F9", padding: "1px 6px", borderRadius: 6 }}>{g.niche}</span>
              </div>
            </div>
            <a href={g.url} target="_blank" rel="noreferrer"
              style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, background: "#1877F2", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
              Open →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
