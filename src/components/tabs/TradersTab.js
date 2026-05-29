import React, { useState, useEffect } from "react";
import Spinner from "../ui/Spinner";
import Badge from "../ui/Badge";
import { timeAgo, daysSince } from "../../utils/helpers";
import { useUI } from "../../context/UIContext";
import { useTraders } from "../../context/TradersContext";

export default function TradersTab({
  anthropicKey,
  stock,
  customers,
  activeDeal,
}) {
  const { isMobile } = useUI();
  const {
    traderListings, traderListingsLoading,
    loadTraderListings,
    traderSection, setTraderSection,
    traderSearch, setTraderSearch,
    traderFilter, setTraderFilter,
    showImportTrader, setShowImportTrader,
    traderGroup, setTraderGroup,
    traderChatText, setTraderChatText,
    traderImportLoading, setTraderImportLoading,
    traderImportPreview, setTraderImportPreview,
    savingTraderListings, setSavingTraderListings,
    traderImportResult, setTraderImportResult,
    showTraderMatches, setShowTraderMatches,
    extractTraderListings,
    saveTraderListings,
    extractBatchFiles,
  } = useTraders();

  const [batchFiles, setBatchFiles] = useState([]);

  function detectGroupName(filename) {
    const cleaned = filename
      .replace(/\.zip$|\.txt$/i, '')
      .replace(/^WhatsApp.?Chat.?with.?/i, '')
      .replace(/^WhatsApp.?Chat.?-?/i, '')
      .replace(/_chat$/i, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || filename;
  }

  async function extractBatchListings() {
    if (batchFiles.length === 0) return;
    setTraderImportLoading(true);
    setTraderImportResult(null);
    setTraderImportPreview(null);

    const allFiles = [];

    for (const file of batchFiles) {
      const groupName = detectGroupName(file.name);
      let text = "";

      if (file.name.endsWith('.zip')) {
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(file);
          const txtFile = Object.values(zip.files).find(f => f.name.endsWith('.txt'));
          if (txtFile) {
            text = await txtFile.async('string');
          }
        } catch {
          setTraderImportResult({ success: false, message: `⚠️ Could not read ${file.name} — try exporting as .txt instead of .zip` });
          continue;
        }
      } else {
        text = await file.text();
      }

      if (text) {
        allFiles.push({ groupName, text });
      }
    }

    if (allFiles.length === 0) {
      setTraderImportResult({ success: false, message: "No readable files found." });
      setTraderImportLoading(false);
      return;
    }

    setTraderImportResult({ success: false, message: `Processing ${allFiles.length} group${allFiles.length > 1 ? 's' : ''}...` });
    await extractBatchFiles(allFiles);
    setTraderImportLoading(false);
  }

  useEffect(() => { loadTraderListings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Section toggle */}
        <div style={{ display: "flex", padding: "10px 12px 0", gap: 8, background: "#fff", borderBottom: "1px solid #F1F5F9" }}>
          {[{ key: "inventory", label: "📋 Inventory" }, { key: "traders", label: "👤 Traders" }].map(s => (
            <button key={s.key} onClick={() => setTraderSection(s.key)}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: traderSection === s.key ? "#6366F1" : "#F1F5F9", color: traderSection === s.key ? "#fff" : "#64748B", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {s.label}
            </button>
          ))}
        </div>

        {traderSection === "inventory" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Search + filter + import */}
            <div style={{ padding: "10px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={traderSearch} onChange={e => setTraderSearch(e.target.value)} placeholder="🔍 Search brand, model, specs..."
                  style={{ flex: 1, padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none" }} />
                <button onClick={() => setShowImportTrader(true)}
                  style={{ padding: "0 14px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                  Import
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
                {[{ key: "all", label: "All" }, { key: "selling", label: "🟢 Selling" }, { key: "buying", label: "🔵 Buying" }, { key: "parts", label: "🔧 Parts" }].map(f => (
                  <button key={f.key} onClick={() => setTraderFilter(f.key)}
                    style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, background: traderFilter === f.key ? "#6366F1" : "#F1F5F9", color: traderFilter === f.key ? "#fff" : "#64748B" }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Find Match button */}
            <div style={{ padding: "0 12px 8px" }}>
              <button onClick={() => setShowTraderMatches(true)}
                style={{ width: "100%", padding: 11, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                🔍 Find Match — My Stock vs Buying Requests
              </button>
            </div>

            {/* Listings */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 100px" }}>
              {traderListingsLoading && <Spinner />}
              {!traderListingsLoading && (() => {
                const q = traderSearch.toLowerCase();
                const shown = traderListings.filter(t => {
                  if (traderFilter === "selling" && t.type !== "selling") return false;
                  if (traderFilter === "buying" && t.type !== "buying") return false;
                  if (traderFilter === "parts" && t.category !== "part") return false;
                  if (!q) return true;
                  return [t.brand, t.model, t.processor, t.ram, t.storage, t.part_category, t.part_compatible, t.trader_name].some(v => (v || "").toLowerCase().includes(q));
                });
                if (!shown.length) return <div style={{ textAlign: "center", padding: "60px 20px" }}><div style={{ fontSize: 40, marginBottom: 10 }}>🏪</div><div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>{traderListings.length ? "No listings match" : "No listings yet"}</div><div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Tap Import to add group chat listings</div></div>;
                return shown.map(item => {
                  const isSelling = item.type === "selling";
                  const isPart = item.category === "part";
                  const ageDays = daysSince(item.created_at);
                  const ageBadge = ageDays <= 3
                    ? { icon: "🟢", label: "Fresh", color: "#10B981", bg: "#ECFDF5" }
                    : ageDays <= 7
                    ? { icon: "🟡", label: "Recent", color: "#F59E0B", bg: "#FFFBEB" }
                    : ageDays <= 14
                    ? { icon: "🟠", label: "Getting old", color: "#F97316", bg: "#FFF7ED" }
                    : { icon: "🔴", label: "May be sold", color: "#EF4444", bg: "#FEF2F2" };
                  const device = isPart
                    ? [item.part_category, item.part_compatible, item.part_specs].filter(Boolean).join(" · ")
                    : [item.brand, item.model, item.processor, item.ram, item.storage, item.screen, item.condition].filter(Boolean).join(" · ");
                  return (
                    <div key={item.id} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, border: `1.5px solid ${ageDays > 14 ? "#FEE2E2" : "#F1F5F9"}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Badge color={isSelling ? "#10B981" : "#6366F1"} bg={isSelling ? "#ECFDF5" : "#EEF2FF"} small>{isSelling ? "🟢 SELLING" : "🔵 BUYING"}</Badge>
                          <Badge color="#64748B" bg="#F1F5F9" small>{isPart ? "🔧 PART" : "💻 LAPTOP"}</Badge>
                          <Badge color={ageBadge.color} bg={ageBadge.bg} small>{ageBadge.icon} {ageDays}d · {ageBadge.label}</Badge>
                        </div>
                        {item.price && <span style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>AED {Number(item.price).toLocaleString()}</span>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{device || "No specs"}</div>
                      {item.notes && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{item.notes}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>👤 {item.trader_name || "Unknown"}{item.source_group ? ` · ${item.source_group}` : ""}</span>
                        {item.trader_number && (
                          <a href={`https://wa.me/${item.trader_number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                            style={{ padding: "4px 10px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                            WhatsApp
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>{timeAgo(item.created_at)}</div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {traderSection === "traders" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 100px" }}>
            {(() => {
              const grouped = {};
              traderListings.forEach(t => {
                const key = t.trader_name || "Unknown";
                if (!grouped[key]) grouped[key] = { name: key, number: t.trader_number, group: t.source_group, selling: 0, buying: 0, lastDate: t.created_at };
                if (t.type === "selling") grouped[key].selling++;
                else grouped[key].buying++;
                if (new Date(t.created_at) > new Date(grouped[key].lastDate)) grouped[key].lastDate = t.created_at;
              });
              const traders = Object.values(grouped).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
              if (!traders.length) return <div style={{ textAlign: "center", padding: "60px 20px" }}><div style={{ fontSize: 40, marginBottom: 10 }}>👤</div><div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No traders yet</div><div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Import a group chat to see traders</div></div>;
              return traders.map((tr, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 8, border: "1.5px solid #F1F5F9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{tr.name}</div>
                      {tr.group && <div style={{ fontSize: 11, color: "#94A3B8" }}>{tr.group}</div>}
                    </div>
                    {tr.number && <a href={`https://wa.me/${tr.number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{ padding: "5px 12px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>WhatsApp</a>}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700 }}>🟢 {tr.selling} selling</span>
                    <span style={{ fontSize: 12, color: "#6366F1", fontWeight: 700 }}>🔵 {tr.buying} buying</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>Last active: {timeAgo(tr.lastDate)}</div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Import modal */}
      {showImportTrader && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>Import Group Chats</span>
                <button onClick={() => { setShowImportTrader(false); setTraderImportPreview(null); setTraderImportResult(null); setTraderChatText(""); setBatchFiles([]); }}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>

              {/* Multi-file upload zone */}
              <div
                onClick={() => document.getElementById('batch-file-input').click()}
                style={{ border: "2px dashed #E2E8F0", borderRadius: 12, padding: 20, textAlign: "center", background: "#F8FAFC", cursor: "pointer", marginBottom: 12 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>
                  {batchFiles.length > 0 ? `${batchFiles.length} file${batchFiles.length > 1 ? 's' : ''} selected` : 'Tap to select group chat files'}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>Select multiple .txt or .zip files at once</div>
                <input
                  id="batch-file-input"
                  type="file"
                  multiple
                  accept=".txt,.zip"
                  style={{ display: "none" }}
                  onChange={e => setBatchFiles(Array.from(e.target.files))}
                />
              </div>

              {/* File list with auto-detected names */}
              {batchFiles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {batchFiles.map((f, i) => {
                    const groupName = detectGroupName(f.name);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#F1F5F9" }}>
                        <span style={{ fontSize: 14 }}>📋</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{groupName}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8" }}>{f.name}</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setBatchFiles(prev => prev.filter((_, j) => j !== i)); }}
                          style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "#E2E8F0", cursor: "pointer", fontSize: 11 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Extract button */}
              {batchFiles.length > 0 && !traderImportPreview && (
                <button
                  onClick={extractBatchListings}
                  disabled={traderImportLoading}
                  style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: traderImportLoading ? "#E2E8F0" : "#6366F1", color: traderImportLoading ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 14, cursor: traderImportLoading ? "not-allowed" : "pointer", marginBottom: 12 }}>
                  {traderImportLoading ? "⏳ Processing..." : `Extract from ${batchFiles.length} group${batchFiles.length > 1 ? 's' : ''}`}
                </button>
              )}

              {/* Status message */}
              {traderImportResult && !traderImportResult.success && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", fontSize: 12, color: "#475569", marginBottom: 12, whiteSpace: "pre-line" }}>
                  {traderImportResult.message}
                </div>
              )}

              {/* Preview */}
              {traderImportPreview && traderImportPreview.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 10 }}>
                    ✅ Found {traderImportPreview.length} listings across {batchFiles.length} groups
                  </div>
                  <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {traderImportPreview.slice(0, 20).map((l, i) => (
                      <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: l.type === "buying" ? "#EEF2FF" : "#F0FDF4", border: `1px solid ${l.type === "buying" ? "#C7D2FE" : "#BBF7D0"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: l.type === "buying" ? "#6366F1" : "#10B981" }}>
                            {l.type === "buying" ? "🔵 WTB" : "🟢 WTS"}
                          </span>
                          <span style={{ fontSize: 10, color: "#94A3B8" }}>{l.source_group}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", marginTop: 2 }}>
                          {[l.brand, l.model, l.processor, l.ram, l.storage].filter(Boolean).join(" · ")}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>👤 {l.trader_name}</div>
                      </div>
                    ))}
                    {traderImportPreview.length > 20 && (
                      <div style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", padding: 8 }}>
                        +{traderImportPreview.length - 20} more listings
                      </div>
                    )}
                  </div>
                  <button onClick={saveTraderListings} disabled={savingTraderListings}
                    style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: savingTraderListings ? "#E2E8F0" : "#10B981", color: savingTraderListings ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 14, cursor: savingTraderListings ? "not-allowed" : "pointer" }}>
                    {savingTraderListings ? "Saving..." : `Save ${traderImportPreview.length} listings`}
                  </button>
                </div>
              )}

              {traderImportResult?.success && (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981" }}>Saved {traderImportResult.count} listings</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Find Match modal */}
      {showTraderMatches && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>🔍 Stock vs Buyer Matches</span>
                <button onClick={() => setShowTraderMatches(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              {(() => {
                const buyingRequests = traderListings.filter(t => t.type === "buying");
                const matches = [];
                stock.filter(s => s.status === "available").forEach(s => {
                  buyingRequests.forEach(b => {
                    const brandMatch = !s.brand || !b.brand || s.brand.toLowerCase() === b.brand.toLowerCase();
                    const priceOk = !b.price || !s.cost_price || Number(b.price) >= Number(s.cost_price);
                    if (brandMatch && priceOk) {
                      const profit = b.price && s.cost_price ? Number(b.price) - Number(s.cost_price) : null;
                      matches.push({ stock: s, buyer: b, profit });
                    }
                  });
                });
                if (!matches.length) return <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No matches found between your stock and trader buying requests.</div>;
                return matches.map((m, i) => (
                  <div key={i} style={{ background: "#F8FAFC", borderRadius: 14, padding: 14, marginBottom: 10, border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
                      {m.buyer.trader_name} wants to buy {[m.stock.brand, m.stock.model].filter(Boolean).join(" ")}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>
                      Paying: AED {m.buyer.price?.toLocaleString() || "?"} · Your cost: AED {m.stock.cost_price?.toLocaleString() || "?"}
                      {m.profit != null && <span style={{ color: "#10B981", fontWeight: 700 }}> · Profit: AED {m.profit.toLocaleString()}</span>}
                    </div>
                    {m.buyer.trader_number && <a href={`https://wa.me/${m.buyer.trader_number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "5px 14px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>📱 WhatsApp {m.buyer.trader_name}</a>}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
