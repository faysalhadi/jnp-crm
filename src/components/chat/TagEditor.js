import React, { useState, useMemo } from "react";
import { DEFAULT_TAGS, TAG_GROUPS, getTag } from "../../constants";

// TagPill — used everywhere to display a single tag
export function TagPill({ tagId, onRemove, small }) {
  const tag = getTag(tagId);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: small ? 9 : 10, fontWeight: 700,
      padding: small ? "1px 6px" : "3px 8px",
      borderRadius: 20,
      background: tag.bg, color: tag.color,
      flexShrink: 0,
    }}>
      {tag.label}
      {onRemove && (
        <span onClick={e => { e.stopPropagation(); onRemove(tagId); }}
          style={{ cursor: "pointer", fontSize: 10, lineHeight: 1, opacity: 0.6, marginLeft: 1 }}>✕</span>
      )}
    </span>
  );
}

// TagStrip — shows up to N tags on a card
export function TagStrip({ tags, max = 3 }) {
  if (!tags?.length) return null;
  const visible = tags.slice(0, max);
  const extra   = tags.length - max;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
      {visible.map(t => <TagPill key={t} tagId={t} small />)}
      {extra > 0 && <span style={{ fontSize: 9, color: "#94A3B8", alignSelf: "center" }}>+{extra}</span>}
    </div>
  );
}

// TagEditor — full bottom sheet for editing tags on a client
export default function TagEditor({ tags = [], onChange, onClose, clientName }) {
  const [search, setSearch]   = useState("");
  const [current, setCurrent] = useState(tags);

  function toggle(tagId) {
    const next = current.includes(tagId)
      ? current.filter(t => t !== tagId)
      : [...current, tagId];
    setCurrent(next);
  }

  function createCustom() {
    const id = search.trim().toLowerCase().replace(/\s+/g, "_");
    if (!id || current.includes(id)) return;
    setCurrent(prev => [...prev, id]);
    setSearch("");
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return DEFAULT_TAGS;
    const q = search.toLowerCase();
    return DEFAULT_TAGS.filter(t => t.label.toLowerCase().includes(q) || t.id.includes(q));
  }, [search]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(t => {
      if (!g[t.group]) g[t.group] = [];
      g[t.group].push(t);
    });
    return g;
  }, [filtered]);

  const hasCustom = search.trim() && !DEFAULT_TAGS.some(t => t.label.toLowerCase() === search.trim().toLowerCase());

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 600, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 500, margin: "0 auto", borderRadius: "20px 20px 0 0", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        {/* Handle */}
        <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
          <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 14px" }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
            🏷️ Tags — {clientName}
          </div>

          {/* Current tags */}
          {current.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10, padding: "8px 10px", background: "#F8FAFC", borderRadius: 10 }}>
              {current.map(t => <TagPill key={t} tagId={t} onRemove={toggle} />)}
            </div>
          )}

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search or create tag..."
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 4 }} />
          {hasCustom && (
            <button onClick={createCustom}
              style={{ width: "100%", padding: "7px", borderRadius: 8, border: "1.5px dashed #6366F1", background: "#F5F3FF", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 4 }}>
              ＋ Create "{search.trim()}"
            </button>
          )}
        </div>

        {/* Tag groups */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 20px" }}>
          {TAG_GROUPS.map(group => {
            const groupTags = grouped[group.id];
            if (!groupTags?.length) return null;
            return (
              <div key={group.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>
                  {group.label.toUpperCase()}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {groupTags.map(tag => {
                    const selected = current.includes(tag.id);
                    return (
                      <button key={tag.id} onClick={() => toggle(tag.id)}
                        style={{
                          padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 700,
                          border: selected ? `2px solid ${tag.color}` : "1.5px solid #E2E8F0",
                          background: selected ? tag.bg : "#fff",
                          color: selected ? tag.color : "#64748B",
                        }}>
                        {selected ? "✓ " : ""}{tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save / Cancel */}
        <div style={{ padding: "12px 20px 32px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => { onChange(current); onClose(); }}
            style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            Save Tags
          </button>
        </div>
      </div>
    </div>
  );
}
