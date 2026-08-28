import ownerOnly from "../layout/ownerOnly";
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase";

const BRAND_COLORS = {
  Dell: "#007DB8", HP: "#0096D6", Lenovo: "#E2231A",
  Apple: "#555555", Microsoft: "#00A4EF",
};

const PART_TYPES = [
  { id: "screen",   icon: "🖥️",  label: "Screen" },
  { id: "battery",  icon: "🔋",  label: "Battery" },
  { id: "keyboard", icon: "⌨️",  label: "Keyboard" },
  { id: "charger",  icon: "🔌",  label: "Charger" },
  { id: "ram",      icon: "💾",  label: "RAM" },
  { id: "ssd",      icon: "💿",  label: "SSD" },
];

const BRANDS = ["All", "Dell", "HP", "Lenovo", "Apple", "Microsoft"];

function PartsCompatibilityTab() {
  const [models, setModels]               = useState([]);
  const [partsMap, setPartsMap]           = useState({});
  const [selectedModel, setSelectedModel] = useState(null);
  const [partFilter, setPartFilter]       = useState("all");
  const [brandFilter, setBrandFilter]     = useState("All");
  const [search, setSearch]               = useState("");
  const [partSearch, setPartSearch]       = useState("");
  const [partSearchMode, setPartSearchMode] = useState(false);
  const [partSearchResults, setPartSearchResults] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [editPart, setEditPart]           = useState(null);
  const [editForm, setEditForm]           = useState({});
  const [saving, setSaving]               = useState(false);
  const [showAddModel, setShowAddModel]   = useState(false);
  const [newModel, setNewModel]           = useState({ brand: "Dell", series: "", model_name: "", year_range: "", screen_size: "" });
  const [addingModel, setAddingModel]     = useState(false);
  const isMobile                          = window.innerWidth <= 768;

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: mdls }, { data: pts }] = await Promise.all([
      supabase.from("laptop_models").select("*").order("brand").order("series").order("model_name"),
      supabase.from("parts_compatibility").select("*").order("part_type"),
    ]);
    setModels(mdls || []);
    const map = {};
    (pts || []).forEach(p => {
      if (!map[p.model_id]) map[p.model_id] = [];
      map[p.model_id].push(p);
    });
    setPartsMap(map);
    if (mdls?.length && !selectedModel) setSelectedModel(mdls[0]);
    setLoading(false);
  }

  // Part number search across ALL models
  function searchByPartNumber(query) {
    if (!query.trim()) { setPartSearchResults([]); return; }
    const q = query.toLowerCase().trim();
    const results = [];
    Object.entries(partsMap).forEach(([modelId, parts]) => {
      const model = models.find(m => m.id === modelId);
      if (!model) return;
      parts.forEach(part => {
        const pn = (part.part_number || "").toLowerCase();
        const spec = (part.spec || "").toLowerCase();
        const notes = (part.notes || "").toLowerCase();
        if (pn.includes(q) || spec.includes(q) || notes.includes(q)) {
          results.push({ part, model });
        }
      });
    });
    // Group by part_number — show cross-compatibility
    const grouped = {};
    results.forEach(r => {
      const key = r.part.part_number || r.part.spec?.slice(0, 30) || r.part.id;
      if (!grouped[key]) grouped[key] = { part: r.part, models: [] };
      grouped[key].models.push(r.model);
    });
    setPartSearchResults(Object.values(grouped));
  }

  const filteredModels = useMemo(() => {
    return models.filter(m => {
      if (brandFilter !== "All" && m.brand !== brandFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.model_name.toLowerCase().includes(q) || m.series.toLowerCase().includes(q);
      }
      return true;
    });
  }, [models, brandFilter, search]);

  const grouped = useMemo(() => {
    const g = {};
    filteredModels.forEach(m => {
      if (!g[m.brand]) g[m.brand] = [];
      g[m.brand].push(m);
    });
    return g;
  }, [filteredModels]);

  const selectedParts = selectedModel ? (partsMap[selectedModel.id] || []) : [];
  const visibleParts  = partFilter === "all" ? selectedParts : selectedParts.filter(p => p.part_type === partFilter);
  const verifiedCount = selectedParts.filter(p => p.verified).length;
  const missingTypes  = PART_TYPES.filter(pt => !selectedParts.some(p => p.part_type === pt.id));

  function unverifiedCount(model) {
    return (partsMap[model.id] || []).filter(p => !p.verified).length;
  }

  async function handleVerify(part) {
    await supabase.from("parts_compatibility").update({
      verified: true, verified_at: new Date().toISOString(), verified_by: "Faisal",
    }).eq("id", part.id);
    setPartsMap(prev => {
      const u = { ...prev };
      u[part.model_id] = (u[part.model_id] || []).map(p =>
        p.id === part.id ? { ...p, verified: true, verified_at: new Date().toISOString(), verified_by: "Faisal" } : p
      );
      return u;
    });
  }

  function openEdit(part) {
    setEditPart(part);
    setEditForm({ spec: part.spec, part_number: part.part_number || "", connector: part.connector || "", wattage: part.wattage || "", notes: part.notes || "" });
  }

  async function saveEdit() {
    if (!editPart) return;
    setSaving(true);
    await supabase.from("parts_compatibility").update({
      spec: editForm.spec, part_number: editForm.part_number,
      connector: editForm.connector, wattage: editForm.wattage, notes: editForm.notes,
    }).eq("id", editPart.id);
    setPartsMap(prev => {
      const u = { ...prev };
      u[editPart.model_id] = (u[editPart.model_id] || []).map(p =>
        p.id === editPart.id ? { ...p, ...editForm } : p
      );
      return u;
    });
    setSaving(false);
    setEditPart(null);
  }

  async function openAddPart(partType) {
    if (!selectedModel) return;
    setEditPart({ id: null, model_id: selectedModel.id, part_type: partType.id, spec: "", part_number: "", connector: "", wattage: "", notes: "", _isNew: true, _label: partType.label });
    setEditForm({ spec: "", part_number: "", connector: "", wattage: "", notes: "" });
  }

  async function saveNewPart() {
    if (!editPart?._isNew) return;
    setSaving(true);
    const { data } = await supabase.from("parts_compatibility").insert({
      model_id: editPart.model_id, part_type: editPart.part_type,
      spec: editForm.spec || "TBC", part_number: editForm.part_number,
      connector: editForm.connector, wattage: editForm.wattage, notes: editForm.notes,
    }).select().single();
    if (data) {
      setPartsMap(prev => {
        const u = { ...prev };
        if (!u[editPart.model_id]) u[editPart.model_id] = [];
        u[editPart.model_id] = [...u[editPart.model_id], data];
        return u;
      });
    }
    setSaving(false);
    setEditPart(null);
  }

  async function saveModel() {
    if (!newModel.model_name || !newModel.brand) return;
    setAddingModel(true);
    const { data: m } = await supabase.from("laptop_models").insert(newModel).select().single();
    if (m) {
      const emptyParts = PART_TYPES.map(pt => ({ model_id: m.id, part_type: pt.id, spec: "TBC" }));
      const { data: pts } = await supabase.from("parts_compatibility").insert(emptyParts).select();
      setModels(prev => [...prev, m].sort((a, b) => a.brand.localeCompare(b.brand)));
      setPartsMap(prev => ({ ...prev, [m.id]: pts || [] }));
      setSelectedModel(m);
    }
    setAddingModel(false);
    setShowAddModel(false);
    setNewModel({ brand: "Dell", series: "", model_name: "", year_range: "", screen_size: "" });
  }

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>
      Loading parts database...
    </div>
  );

  const brandColor = selectedModel ? (BRAND_COLORS[selectedModel.brand] || "#6366F1") : "#6366F1";

  return (
    <div style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ width: isMobile ? "100%" : 280, flexShrink: 0, borderRight: isMobile ? "none" : "1px solid #F1F5F9", display: "flex", flexDirection: "column", height: isMobile ? "auto" : "100%", maxHeight: isMobile ? 240 : "100%" }}>
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid #F1F5F9" }}>
          {/* Toggle: model search vs part number search */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => { setPartSearchMode(false); setPartSearch(""); setPartSearchResults([]); }}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                background: !partSearchMode ? "#0F172A" : "#F1F5F9", color: !partSearchMode ? "#fff" : "#64748B" }}>
              📋 By Model
            </button>
            <button onClick={() => setPartSearchMode(true)}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                background: partSearchMode ? "#0F172A" : "#F1F5F9", color: partSearchMode ? "#fff" : "#64748B" }}>
              🔍 By Part No.
            </button>
          </div>

          {partSearchMode ? (
            <input value={partSearch}
              onChange={e => { setPartSearch(e.target.value); searchByPartNumber(e.target.value); }}
              placeholder="Type part number e.g. WY9DX, A2389..."
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          ) : (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search models..."
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {BRANDS.map(b => (
                  <button key={b} onClick={() => setBrandFilter(b)}
                    style={{ padding: "3px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700,
                      background: brandFilter === b ? (BRAND_COLORS[b] || "#6366F1") : "#F1F5F9",
                      color: brandFilter === b ? "#fff" : "#64748B" }}>
                    {b}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Part number search results */}
        {partSearchMode ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {partSearch && partSearchResults.length === 0 && (
              <div style={{ padding: "20px 12px", fontSize: 12, color: "#94A3B8", textAlign: "center" }}>No parts found for "{partSearch}"</div>
            )}
            {partSearchResults.map((result, i) => {
              const pt = PART_TYPES.find(t => t.id === result.part.part_type);
              return (
                <div key={i} style={{ padding: "10px 12px", borderBottom: "1px solid #F8FAFC" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>{pt?.icon}</span>
                    {result.part.part_number && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", background: "#F1F5F9", padding: "2px 8px", borderRadius: 6 }}>
                        {result.part.part_number}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{pt?.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#374151", marginBottom: 6, lineHeight: 1.4 }}>{result.part.spec}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", marginBottom: 2 }}>✅ Fits {result.models.length} model{result.models.length !== 1 ? "s" : ""}:</div>
                  {result.models.map((m, mi) => (
                    <button key={mi} onClick={() => { setSelectedModel(m); setPartSearchMode(false); setPartSearch(""); setPartSearchResults([]); }}
                      style={{ display: "block", fontSize: 11, color: "#6366F1", background: "#EEF2FF", border: "none", borderRadius: 6, padding: "3px 8px", marginBottom: 3, cursor: "pointer", textAlign: "left", width: "100%" }}>
                      {m.brand} {m.model_name}
                    </button>
                  ))}
                </div>
              );
            })}
            {!partSearch && (
              <div style={{ padding: "20px 12px", fontSize: 12, color: "#94A3B8", textAlign: "center", lineHeight: 1.6 }}>
                Type a part number like<br />
                <strong>WY9DX</strong> (Dell battery)<br />
                <strong>A2389</strong> (MacBook battery)<br />
                <strong>SS03XL</strong> (HP battery)<br />
                to see which laptops it fits
              </div>
            )}
          </div>
        ) : (
          /* Model list */
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {Object.entries(grouped).map(([brand, ms]) => (
              <div key={brand}>
                <div style={{ padding: "6px 12px 3px", fontSize: 10, fontWeight: 800, color: BRAND_COLORS[brand] || "#94A3B8", letterSpacing: 0.5 }}>{brand.toUpperCase()}</div>
                {ms.map(m => {
                  const unv = unverifiedCount(m);
                  const isSelected = selectedModel?.id === m.id;
                  return (
                    <button key={m.id} onClick={() => { setSelectedModel(m); setPartFilter("all"); }}
                      style={{ width: "100%", padding: "9px 12px", border: "none", cursor: "pointer", textAlign: "left",
                        background: isSelected ? "#F8F7FF" : "transparent",
                        borderLeft: isSelected ? `3px solid ${BRAND_COLORS[m.brand] || "#6366F1"}` : "3px solid transparent" }}>
                      <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? "#0F172A" : "#374151" }}>{m.model_name}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                        {m.year_range && <span style={{ fontSize: 9, color: "#94A3B8" }}>{m.year_range}</span>}
                        {m.screen_size && <span style={{ fontSize: 9, color: "#94A3B8" }}>{m.screen_size}</span>}
                        {unv > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "#D97706", background: "#FFFBEB", padding: "1px 5px", borderRadius: 6 }}>{unv} unverified</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: 10, borderTop: "1px solid #F1F5F9" }}>
          <button onClick={() => setShowAddModel(true)}
            style={{ width: "100%", padding: "9px", borderRadius: 10, border: "1.5px dashed #E2E8F0", background: "transparent", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>
            ＋ Add Model
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedModel ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>
            Select a model to view parts
          </div>
        ) : (
          <>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: BRAND_COLORS[selectedModel.brand] + "22", color: BRAND_COLORS[selectedModel.brand] }}>
                  {selectedModel.brand}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{selectedModel.model_name}</span>
                {selectedModel.year_range && <span style={{ fontSize: 11, color: "#94A3B8" }}>{selectedModel.year_range}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#10B981", borderRadius: 3, width: `${selectedParts.length ? (verifiedCount / selectedParts.length) * 100 : 0}%`, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: 10, color: "#94A3B8", whiteSpace: "nowrap" }}>{verifiedCount}/{selectedParts.length} verified</span>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <button onClick={() => setPartFilter("all")}
                  style={{ padding: "4px 10px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: partFilter === "all" ? "#0F172A" : "#F1F5F9", color: partFilter === "all" ? "#fff" : "#64748B" }}>
                  All
                </button>
                {PART_TYPES.map(pt => (
                  <button key={pt.id} onClick={() => setPartFilter(pt.id)}
                    style={{ padding: "4px 10px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: partFilter === pt.id ? "#0F172A" : "#F1F5F9", color: partFilter === pt.id ? "#fff" : "#64748B" }}>
                    {pt.icon} {pt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 100px" }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                {visibleParts.map(part => {
                  const pt = PART_TYPES.find(t => t.id === part.part_type);
                  const warn = part.notes?.startsWith("⚠️");
                  return (
                    <div key={part.id} style={{ background: "#fff", borderRadius: 14, padding: "14px 14px 12px", border: "1.5px solid #F1F5F9", position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                      {warn && <div style={{ position: "absolute", top: 10, right: 10, fontSize: 14 }}>⚠️</div>}
                      {part.verified && <div style={{ position: "absolute", top: 10, right: warn ? 30 : 10, background: "#ECFDF5", borderRadius: 6, padding: "2px 6px", fontSize: 9, fontWeight: 800, color: "#059669" }}>✅ Verified</div>}
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 }}>{pt?.icon} {pt?.label || part.part_type}</div>
                      {/* Part number — prominent */}
                      {part.part_number && (
                        <div style={{ fontSize: 13, fontWeight: 800, color: brandColor, background: brandColor + "11", borderRadius: 6, padding: "3px 8px", display: "inline-block", marginBottom: 6, letterSpacing: 0.5 }}>
                          {part.part_number}
                        </div>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 6, lineHeight: 1.4 }}>{part.spec}</div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                        {part.connector && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "#EEF2FF", color: "#6366F1" }}>{part.connector}</span>}
                        {part.wattage && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "#FEF9C3", color: "#CA8A04" }}>{part.wattage}</span>}
                      </div>
                      {part.notes && <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginBottom: 10 }}>{part.notes}</div>}
                      {part.verified && <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 8 }}>Verified by {part.verified_by} · {new Date(part.verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>}
                      <div style={{ display: "flex", gap: 6 }}>
                        {!part.verified && (
                          <button onClick={() => handleVerify(part)}
                            style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #10B981", background: "transparent", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            ✅ Verify
                          </button>
                        )}
                        <button onClick={() => openEdit(part)}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "transparent", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          ✏️ Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(partFilter === "all" ? missingTypes : missingTypes.filter(t => t.id === partFilter)).map(pt => (
                  <button key={pt.id} onClick={() => openAddPart(pt)}
                    style={{ background: "#F8FAFC", borderRadius: 14, padding: "14px", border: "1.5px dashed #E2E8F0", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>{pt.icon} {pt.label}</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>＋ Add {pt.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── EDIT / ADD PART BOTTOM SHEET ── */}
      {editPart && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 500, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "20px 20px 40px" }}>
            <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 16 }}>
              {editPart._isNew ? `Add ${editPart._label}` : `Edit ${editPart.part_type}`} — {selectedModel?.model_name}
            </div>
            {[
              { key: "part_number", label: "Part Number", placeholder: "e.g. WY9DX, A2389, SS03XL, L84353" },
              { key: "spec", label: "Spec / Description", placeholder: "e.g. 42Wh Li-ion 3-cell" },
              { key: "connector", label: "Connector", placeholder: "e.g. 30-pin eDP, USB-C, SO-DIMM" },
              { key: "wattage", label: "Wattage", placeholder: "e.g. 65W (chargers only)" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>{f.label}</div>
                <input value={editForm[f.key]} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>Notes</div>
              <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional notes (start with ⚠️ for warnings)"
                rows={3}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditPart(null)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={editPart._isNew ? saveNewPart : saveEdit} disabled={saving}
                style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD MODEL BOTTOM SHEET ── */}
      {showAddModel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 500, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "20px 20px 40px" }}>
            <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 16 }}>Add New Model</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>Brand</div>
              <select value={newModel.brand} onChange={e => setNewModel(p => ({ ...p, brand: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                {["Dell", "HP", "Lenovo", "Apple", "Microsoft"].map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            {[
              { key: "series", label: "Series", placeholder: "e.g. ThinkPad, EliteBook, Latitude" },
              { key: "model_name", label: "Model Name *", placeholder: "e.g. ThinkPad T14 Gen 4" },
              { key: "year_range", label: "Year Range", placeholder: "e.g. 2023-2024" },
              { key: "screen_size", label: "Screen Size", placeholder: "e.g. 14\"" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>{f.label}</div>
                <input value={newModel[f.key]} onChange={e => setNewModel(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowAddModel(false)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={saveModel} disabled={addingModel || !newModel.model_name}
                style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: (addingModel || !newModel.model_name) ? 0.6 : 1 }}>
                {addingModel ? "Adding..." : "Add Model + 6 Parts"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ownerOnly(PartsCompatibilityTab);
