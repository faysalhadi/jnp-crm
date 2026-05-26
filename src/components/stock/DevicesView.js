import React from "react";
import WaitingClientsPanel from "./WaitingClientsPanel";
import { supabase } from "../../supabase";
import { useStock } from "../../context/StockContext";
import { useReservations } from "../../context/ReservationsContext";
import { useSales } from "../../context/SalesContext";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useParts } from "../../context/PartsContext";
import Badge from "../ui/Badge";
import Spinner from "../ui/Spinner";
import SpecUpgradeModal from "../modals/SpecUpgradeModal";
import QuickSaleModal from "../modals/QuickSaleModal";
import ReservedView from "./ReservedView";
import { BRANDS, EMPTY_STOCK, PART_ICONS, PART_CATEGORIES, EMPTY_PART } from "../../constants";
import { daysSince, timeAgo, parseGB, labelGB } from "../../utils/helpers";
import { getMatchingClients } from "../../services/broadcastService";

export default function DevicesView({
  filteredStock,
  openBroadcast,
  handleUpgradeApply,
  loadTodaySales,
  setSaleReceiptData,
  setReceiptEditName,
  setShowSaleReceipt,
  customers,
}) {
  const {
    stock, stockLoading, loadStock, refreshCachedStock,
    stockFilter, setStockFilter,
    stockSearch, setStockSearch,
    expandedStockId, setExpandedStockId,
    editingStock, setEditingStock,
    stockForm, setStockForm,
    stockPhotoUploading,
    showAddStock, setShowAddStock,
    showImportStock, setShowImportStock,
    importPreview, setImportPreview,
    importingStock,
    importStockResult, setImportStockResult,
    soldDealMap, setSoldDealMap,
    stockFileInputRef, importStockFileRef,
    saveStock, deleteStockItem, toggleStockStatus,
    uploadStockPhoto, downloadStockTemplate,
    handleStockFileSelect, importStockItems,
    showUpgrade, setShowUpgrade,
    upgradeTarget, setUpgradeTarget,
    showQuickSale, setShowQuickSale,
    quickSalePrefill, setQuickSalePrefill,
  } = useStock();
  const {
    activeCustomerId, setActiveCustomerId,
    activeDealId, setActiveDealId,
    view, setView,
    pendingSuggestion, setPendingSuggestion,
    loadCustomers,
  } = useCustomers();
  const { showToast } = useUI();
  const { partsSold, partsSoldLoading } = useParts();
  const {
    showEditReservation, setShowEditReservation,
    editReservationItem, setEditReservationItem,
    editReservationForm, setEditReservationForm,
  } = useReservations();

  return (
    <>

      {/* Stats */}
      {stock.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Available", value: stock.filter(s => s.status === "available").length, color: "#10B981", bg: "#ECFDF5" },
            { label: "Sold", value: stock.filter(s => s.status === "sold").length, color: "#6366F1", bg: "#EEF2FF" },
            { label: "Total Items", value: stock.length, color: "#F59E0B", bg: "#FFFBEB" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.8 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + Add + Import */}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="🔍  Search brand, model, serial..."
          style={{ flex: 1, padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none" }} />
        <button onClick={() => { setShowImportStock(true); setImportPreview(null); setImportStockResult(null); }}
          style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
          📥
        </button>
        <button onClick={() => { setEditingStock(null); setStockForm(EMPTY_STOCK); setShowAddStock(true); }}
          style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
          + Add
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { key: "available",   label: "✅ Available" },
          { key: "reserved",    label: "🔒 Reserved", color: "#F59E0B", activeBg: "#F59E0B" },
          { key: "sold",        label: "🏷️ Sold" },
          { key: "parts_sold",  label: "🔧 Parts Sold", color: "#8B5CF6", activeBg: "#8B5CF6" },
          { key: "all",         label: "All" },
        ].map(f => (
          <button key={f.key} onClick={() => setStockFilter(f.key)}
            style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                     background: stockFilter === f.key ? (f.activeBg || "#6366F1") : "#F1F5F9",
                     color:      stockFilter === f.key ? "#fff" : (f.color || "#64748B") }}>
            {f.label}
            {f.key === "reserved" && stock.filter(s => s.status === "reserved").length > 0 && (
              <span style={{ marginLeft: 4, background: stockFilter === "reserved" ? "rgba(255,255,255,0.3)" : "#F59E0B", color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 10 }}>
                {stock.filter(s => s.status === "reserved").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {stockLoading && stockFilter !== "parts_sold" && <Spinner />}

      {/* Parts sold view */}
      {stockFilter === "parts_sold" && (() => {
        if (partsSoldLoading) return <Spinner />;
        if (partsSold.length === 0) return (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#CBD5E1" }}>
            <div style={{ fontSize:36, marginBottom:8 }}>🔧</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#94A3B8" }}>No parts sold yet</div>
          </div>
        );
        const totalRev  = partsSold.reduce((s, d) => s + (Number(d.value) || 0), 0);
        return (
          <>
            <div style={{ padding:"10px 16px", background:"#F5F3FF", borderRadius:12, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontWeight:800, color:"#8B5CF6" }}>{partsSold.length} part sale{partsSold.length !== 1 ? "s" : ""}</span>
              {totalRev > 0 && <span style={{ fontSize:12, color:"#7C3AED", fontWeight:600 }}>· Revenue AED {totalRev.toLocaleString()}</span>}
            </div>
            {partsSold.map((d, i) => (
              <div key={d.id || i} style={{ background:"#fff", borderRadius:14, padding:"12px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#0F172A" }}>
                      🔧 {d.category ? `${d.category}${d.specs ? ` — ${d.specs}` : ""}` : d.notes || "Part sale"}
                    </div>
                    <div style={{ fontSize:11, color:"#94A3B8", marginTop:2 }}>
                      Sold to: {d.customer_name || "Walk-in"} · Qty: ×{d.quantity_sold || 1}
                      {d.compatible_with ? ` · ${d.compatible_with}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    {d.value && <div style={{ fontSize:14, fontWeight:800, color:"#8B5CF6" }}>AED {Number(d.value).toLocaleString()}</div>}
                    <div style={{ fontSize:10, color:"#94A3B8" }}>{d.payment_method || "—"}</div>
                  </div>
                </div>
                {(d.sold_at || d.closed_at) && (
                  <div style={{ fontSize:11, color:"#CBD5E1" }}>
                    {new Date(d.sold_at || d.closed_at).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}
                  </div>
                )}
              </div>
            ))}
          </>
        );
      })()}

      {/* Sold summary bar */}
      {!stockLoading && stockFilter === "sold" && filteredStock.length > 0 && (() => {
        const totalRev    = filteredStock.reduce((s, i) => s + (Number(i.sold_price || i.max_price) || 0), 0);
        const totalProfit = filteredStock.reduce((s, i) => s + ((Number(i.sold_price || i.max_price) || 0) - (Number(i.cost_price) || 0)), 0);
        const avgProfit   = Math.round(totalProfit / filteredStock.length);
        return (
          <div style={{ padding: "10px 16px", background: "#EEF2FF", borderRadius: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>
              {filteredStock.length} device{filteredStock.length !== 1 ? "s" : ""} sold
            </span>
            {totalRev > 0 && (
              <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>
                · Revenue AED {totalRev.toLocaleString()}
              </span>
            )}
            {avgProfit !== 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: avgProfit >= 0 ? "#10B981" : "#EF4444" }}>
                · Avg profit AED {avgProfit.toLocaleString()}
              </span>
            )}
          </div>
        );
      })()}

      {/* Empty state */}
      {!stockLoading && stockFilter !== "parts_sold" && filteredStock.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>
            {stockSearch || stockFilter !== "available" ? "No items match" : "No available stock"}
          </div>
          <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>
            {!stockSearch && stockFilter === "available" && "Tap + Add to list your first item"}
          </div>
        </div>
      )}

      {/* Reserved deals — deal-centric view */}
      {stockFilter === "reserved" && (
        <ReservedView />
      )}

      {/* Stock cards — hidden when parts_sold filter is active */}
      {stockFilter !== "parts_sold" && stockFilter !== "reserved" && filteredStock.map(item => {
        const isExpanded = expandedStockId === item.id;
        const matches    = getMatchingClients(item, customers);
        const isAvail    = item.status === "available";
        const isReserved = item.status === "reserved";
        const reservedFor = isReserved && item.reserved_for_customer_id
          ? customers.find(c => c.id === item.reserved_for_customer_id)
          : null;
        const pickupLabel = item.pickup_date
          ? new Date(item.pickup_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : null;
        const today = new Date(); today.setHours(0,0,0,0);
        const isOverdue = isReserved && item.pickup_date && new Date(item.pickup_date) < today;
        return (
          <div key={item.id} style={{ background: "#fff", borderRadius: 18,
            border: `1.5px solid ${isReserved ? (isOverdue ? "#FCA5A5" : "#FDE68A") : isAvail ? "#E2E8F0" : "#F1F5F9"}`,
            boxShadow: isReserved ? "0 1px 6px rgba(245,158,11,0.15)" : "0 1px 6px rgba(0,0,0,0.05)",
            overflow: "hidden", opacity: isAvail || isReserved || stockFilter === "sold" ? 1 : 0.7 }}>
          {/* Reserved banner */}
          {isReserved && (
            <div style={{ padding: "8px 14px", background: isOverdue ? "#FEF2F2" : "#FFFBEB", borderBottom: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: isOverdue ? "#EF4444" : "#D97706" }}>
                  🔒 Reserved{reservedFor ? ` for ${reservedFor.name}` : ""}
                </div>
                {pickupLabel && (
                  <div style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#B45309" }}>
                    {isOverdue ? `⚠️ Pickup was ${pickupLabel} — no show` : `Pickup: ${pickupLabel}`}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={e => { e.stopPropagation(); setQuickSalePrefill({ item, name: reservedFor?.name || "", number: reservedFor?.number || "", depositPaid: 0 }); setShowQuickSale(true); }}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  ✅ Complete Sale
                </button>
                <button onClick={e => {
                  e.stopPropagation();
                  setEditReservationItem(item);
                  setEditReservationForm({
                    agreedPrice: String(item.sold_price || item.max_price || ""),
                    pickupDate: item.pickup_date ? item.pickup_date.split("T")[0] : "",
                    depositAmount: "",
                    balanceDue: "",
                    notes: item.reservation_notes || "",
                  });
                  setShowEditReservation(true);
                }}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  ✏️ Edit
                </button>
                <button onClick={async e => { e.stopPropagation(); if (!window.confirm("Release reservation and set item back to available?")) return; await supabase.from("stock").update({ status: "available", reserved_for_customer_id: null, reserved_at: null, pickup_date: null }).eq("id", item.id); loadStock(); }}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #FDE68A", background: "#fff", color: "#D97706", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  🔓 Release
                </button>
              </div>
            </div>
          )}
            {item.photo_url && (
              <img src={item.photo_url} alt={item.model || "stock"} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
            )}
            {/* Card summary row — tap to expand */}
            <div onClick={() => setExpandedStockId(isExpanded ? null : item.id)} style={{ padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>
                    {[item.brand, item.model].filter(Boolean).join(" ") || "Unnamed item"}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    {[item.processor, item.ram, item.ssd, item.screen].filter(Boolean).join(" · ") || "No specs entered"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-start", flexShrink: 0 }}>
                  <button onClick={e => { e.stopPropagation(); if (!isReserved) toggleStockStatus(item); }}
                    style={{ padding: "3px 10px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 700, cursor: isReserved ? "default" : "pointer",
                             background: isReserved ? "#FFFBEB" : isAvail ? "#ECFDF5" : "#F1F5F9",
                             color: isReserved ? "#D97706" : isAvail ? "#10B981" : "#94A3B8" }}>
                    {isReserved ? "🔒 Reserved" : isAvail ? "✅ Available" : "🏷️ Sold"}
                  </button>
                  {isAvail && (
                    <button onClick={e => { e.stopPropagation(); openBroadcast(item); }}
                      style={{ padding: "3px 8px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                      📢
                    </button>
                  )}
                  {isAvail && (
                    <button onClick={e => { e.stopPropagation(); setUpgradeTarget(item); setShowUpgrade(true); }}
                      style={{ padding: "3px 8px", borderRadius: 8, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#D97706", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                      ⬆
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete ${[item.brand, item.model].filter(Boolean).join(" ") || "this item"}?`)) deleteStockItem(item.id); }}
                    style={{ padding: "3px 8px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                    🗑
                  </button>
                </div>
              </div>

              {/* Prices */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                {item.max_price && <span style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>AED {Number(item.max_price).toLocaleString()}</span>}
                {item.min_price && <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, alignSelf: "center" }}>min AED {Number(item.min_price).toLocaleString()}</span>}
                {item.cost_price && <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, alignSelf: "center" }}>cost AED {Number(item.cost_price).toLocaleString()}</span>}
              </div>

              {/* Badges */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {item.condition && <Badge color="#6366F1" bg="#EEF2FF" small>{item.condition}</Badge>}
                {item.charger === "yes" && <Badge color="#10B981" bg="#ECFDF5" small>🔌 Charger</Badge>}
                {item.box === "yes" && <Badge color="#F59E0B" bg="#FFFBEB" small>📦 Box</Badge>}
                {item.brand === "MacBook" && item.activation_lock === "no" && <Badge color="#10B981" bg="#ECFDF5" small>🔓 Unlocked</Badge>}
                {item.brand === "MacBook" && item.activation_lock === "yes" && <Badge color="#EF4444" bg="#FEF2F2" small>🔒 Locked</Badge>}
                {matches.length > 0 && <Badge color="#F59E0B" bg="#FFFBEB" small>👥 {matches.length} match{matches.length !== 1 ? "es" : ""}</Badge>}
              </div>
            </div>

            {/* Sold details panel — shown for sold items */}
            {item.status === "sold" && (() => {
              const linkedDeal  = soldDealMap[item.id];
              const soldPrice   = Number(item.sold_price || linkedDeal?.value || item.max_price) || 0;
              const costPrice   = Number(item.cost_price) || 0;
              const profit      = soldPrice - costPrice;
              const marginPct   = soldPrice > 0 ? Math.round((profit / soldPrice) * 100) : 0;
              const custName    = item.sold_to_customer_id
                ? (customers.find(c => c.id === item.sold_to_customer_id)?.name || "Customer")
                : null;
              const soldToName  = custName || linkedDeal?.walk_in_name || "Walk-in Customer";
              const payMethod   = linkedDeal?.payment_method || null;
              const soldDateStr = item.sold_at
                ? new Date(item.sold_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                : null;
              const rows = [
                { label: "SOLD TO",    value: soldToName,                                         bold: false },
                soldDateStr && { label: "SOLD DATE",  value: soldDateStr,                         bold: false },
                soldPrice   && { label: "SOLD PRICE", value: `AED ${soldPrice.toLocaleString()}`, bold: true,  color: "#6366F1" },
                costPrice   && { label: "COST",       value: `AED ${costPrice.toLocaleString()}`, bold: false },
                (soldPrice && costPrice) && { label: "PROFIT", value: `AED ${profit.toLocaleString()} (${marginPct}%)`, bold: true, color: profit >= 0 ? "#10B981" : "#EF4444" },
              ].filter(Boolean);
              return (
                <div style={{ borderTop: "1px solid #F1F5F9", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, background: "#FAFBFF" }}>
                  {rows.map(r => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>{r.label}</span>
                      <span style={{ fontSize: r.bold ? 13 : 12, fontWeight: r.bold ? 800 : 600, color: r.color || "#475569" }}>{r.value}</span>
                    </div>
                  ))}
                  {payMethod && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>PAYMENT</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                                     background: payMethod === "Cash" ? "#ECFDF5" : "#EFF6FF",
                                     color: payMethod === "Cash" ? "#059669" : "#2563EB" }}>
                        {payMethod}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {item.status === "available" && <WaitingClientsPanel stockItem={item} />}

            {/* Expanded details */}
            {isExpanded && (
              <div style={{ borderTop: "1px solid #F8FAFC", padding: "12px 14px" }}>
                {/* Spec table */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: 10 }}>
                  {[
                    { label: "Processor", value: item.processor },
                    { label: "RAM", value: item.ram },
                    { label: "SSD", value: item.ssd },
                    { label: "Screen", value: item.screen },
                    { label: "Condition", value: item.condition },
                    { label: "Charger", value: item.charger },
                    { label: "Box", value: item.box },
                    { label: "Activation Lock", value: item.brand === "MacBook" ? item.activation_lock : null },
                    { label: "Serial No.", value: item.serial_number },
                  ].filter(f => f.value && f.value !== "unknown").map(f => (
                    <div key={f.label} style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 700, letterSpacing: 0.3 }}>{f.label.toUpperCase()}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{f.value}</span>
                    </div>
                  ))}
                </div>

                {item.notes && (
                  <div style={{ padding: "8px 10px", background: "#F8FAFC", borderRadius: 8, fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 10 }}>
                    {item.notes}
                  </div>
                )}

                {/* Matching clients */}
                {matches.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>👥 POTENTIAL BUYERS</div>
                    {matches.map(c => {
                      const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
                      return (
                        <div key={c.id}
                          onClick={() => { setActiveCustomerId(c.id); setActiveDealId(deal?.id); setView("detail"); setPendingSuggestion(null); }}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", marginBottom: 4, background: "#F8FAFC", borderRadius: 10, cursor: "pointer", border: "1px solid #F1F5F9" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: "#94A3B8" }}>
                              {deal?.brand ? `${deal.brand} ${deal.model || ""}`.trim() : "Open deal"}
                              {deal?.budget ? ` · AED ${Number(deal.budget).toLocaleString()}` : ""}
                            </div>
                          </div>
                          <span style={{ fontSize: 13, color: "#6366F1", fontWeight: 700 }}>→</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => {
                    setEditingStock(item);
                    setStockForm({ ...EMPTY_STOCK, ...item, cost_price: item.cost_price ?? "", min_price: item.min_price ?? "", max_price: item.max_price ?? "" });
                    setShowAddStock(true);
                  }}
                    style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#6366F1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    ✏️ Edit
                  </button>
                  {isAvail && (
                    <button onClick={() => { setUpgradeTarget(item); setShowUpgrade(true); }}
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#D97706", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      ⬆ Upgrade
                    </button>
                  )}
                  {isAvail && (
                    <button onClick={() => { setQuickSalePrefill({ item }); setShowQuickSale(true); }}
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      ⚡ Sell
                    </button>
                  )}
                  <button onClick={() => { if (window.confirm(`Delete ${[item.brand, item.model].filter(Boolean).join(" ") || "this item"}?`)) deleteStockItem(item.id); }}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
                    🗑
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── ADD / EDIT MODAL ── */}
      {showAddStock && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>{editingStock ? "Edit Stock Item" : "Add Stock Item"}</span>
                <button onClick={() => { setShowAddStock(false); setEditingStock(null); setStockForm(EMPTY_STOCK); }}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Brand + Model */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>BRAND</div>
                    <select value={stockForm.brand} onChange={e => setStockForm(f => ({ ...f, brand: e.target.value }))}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                      <option value="">Select</option>
                      {BRANDS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>MODEL</div>
                    <input value={stockForm.model} onChange={e => setStockForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Air M2, ThinkPad X1"
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>

                {/* Processor */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>PROCESSOR</div>
                  <input value={stockForm.processor} onChange={e => setStockForm(f => ({ ...f, processor: e.target.value }))} placeholder="e.g. Apple M2, Core i7-1355U"
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>

                {/* RAM + SSD */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>RAM</div>
                    <input value={stockForm.ram} onChange={e => setStockForm(f => ({ ...f, ram: e.target.value }))} placeholder="e.g. 16GB"
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>SSD</div>
                    <input value={stockForm.ssd} onChange={e => setStockForm(f => ({ ...f, ssd: e.target.value }))} placeholder="e.g. 512GB"
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>

                {/* Screen + Condition */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>SCREEN SIZE</div>
                    <input value={stockForm.screen} onChange={e => setStockForm(f => ({ ...f, screen: e.target.value }))} placeholder='e.g. 13.3"'
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>CONDITION</div>
                    <select value={stockForm.condition} onChange={e => setStockForm(f => ({ ...f, condition: e.target.value }))}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                      <option value="">Select</option>
                      <option>New</option><option>Like New</option><option>Used</option><option>Refurbished</option>
                    </select>
                  </div>
                </div>

                {/* Charger + Box */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>CHARGER</div>
                    <select value={stockForm.charger} onChange={e => setStockForm(f => ({ ...f, charger: e.target.value }))}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>BOX</div>
                    <select value={stockForm.box} onChange={e => setStockForm(f => ({ ...f, box: e.target.value }))}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </div>
                </div>

                {/* Activation lock — MacBook only */}
                {stockForm.brand === "MacBook" && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>ACTIVATION LOCK</div>
                    <select value={stockForm.activation_lock} onChange={e => setStockForm(f => ({ ...f, activation_lock: e.target.value }))}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                      <option value="unknown">Unknown</option>
                      <option value="no">No — Unlocked ✅</option>
                      <option value="yes">Yes — Locked ⚠️</option>
                    </select>
                  </div>
                )}

                {/* Pricing */}
                <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 8, letterSpacing: 0.5 }}>PRICING (AED)</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { key: "cost_price", label: "Cost" },
                      { key: "min_price", label: "Min" },
                      { key: "max_price", label: "Max / Ask" },
                    ].map(p => (
                      <div key={p.key} style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3, fontWeight: 600 }}>{p.label}</div>
                        <input type="number" value={stockForm[p.key]} onChange={e => setStockForm(f => ({ ...f, [p.key]: e.target.value }))} placeholder="0"
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Serial number */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>SERIAL / IMEI</div>
                  <input value={stockForm.serial_number} onChange={e => setStockForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="Optional"
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>

                {/* Notes */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>NOTES</div>
                  <textarea value={stockForm.notes} onChange={e => setStockForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any details about this item..." rows={3}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>

                {/* Photo */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>PHOTO (optional)</div>
                  {stockForm.photo_url && (
                    <div style={{ position: "relative", marginBottom: 8 }}>
                      <img src={stockForm.photo_url} alt="preview" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10 }} />
                      <button onClick={() => setStockForm(f => ({ ...f, photo_url: "" }))}
                        style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  )}
                  <input type="file" accept="image/*" ref={stockFileInputRef} style={{ display: "none" }}
                    onChange={e => e.target.files?.[0] && uploadStockPhoto(e.target.files[0])} />
                  <button onClick={() => stockFileInputRef.current?.click()} disabled={stockPhotoUploading}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1.5px dashed #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                    {stockPhotoUploading ? "⏳ Uploading..." : stockForm.photo_url ? "📷 Change Photo" : "📷 Add Photo"}
                  </button>
                </div>

                {/* Save */}
                <button onClick={saveStock} disabled={!stockForm.brand && !stockForm.model}
                  style={{ padding: 14, borderRadius: 12, border: "none", background: stockForm.brand || stockForm.model ? "#6366F1" : "#E2E8F0", color: stockForm.brand || stockForm.model ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 15, cursor: stockForm.brand || stockForm.model ? "pointer" : "not-allowed" }}>
                  {editingStock ? "Save Changes" : "Add to Stock →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT MODAL ── */}
      {showImportStock && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>Import from Excel / CSV</span>
                <button onClick={() => { setShowImportStock(false); setImportPreview(null); setImportStockResult(null); }}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>

              {/* Download template */}
              <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#4338CA" }}>📋 Download Template</div>
                  <div style={{ fontSize: 11, color: "#818CF8", marginTop: 2 }}>Pre-filled columns ready for Excel</div>
                </div>
                <button onClick={downloadStockTemplate}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  Download
                </button>
              </div>

              {/* File picker */}
              <input type="file" accept=".xlsx,.xls,.csv" ref={importStockFileRef} style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleStockFileSelect(e.target.files[0]); e.target.value = ""; }} />
              <button onClick={() => importStockFileRef.current?.click()}
                style={{ width: "100%", padding: 14, borderRadius: 12, border: "2px dashed #C7D2FE", background: "#F8FAFC", color: importPreview ? "#6366F1" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
                {importPreview ? `✅ ${importPreview.length} row${importPreview.length !== 1 ? "s" : ""} loaded — tap to change file` : "📂 Select .xlsx / .csv file"}
              </button>

              {/* Preview table */}
              {importPreview && importPreview.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>
                    PREVIEW — FIRST {Math.min(5, importPreview.length)} OF {importPreview.length} ROWS
                  </div>
                  <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #F1F5F9" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          {["Brand","Model","RAM","SSD","Condition","Max Price"].map(h => (
                            <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#94A3B8", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #F1F5F9" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 5).map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #F8FAFC" }}>
                            {[row.brand, row.model, row.ram, row.ssd, row.condition, row.max_price ? `AED ${row.max_price}` : "—"].map((v, j) => (
                              <td key={j} style={{ padding: "6px 10px", color: "#475569", whiteSpace: "nowrap" }}>{v || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.length > 5 && (
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, textAlign: "center" }}>
                      + {importPreview.length - 5} more rows not shown
                    </div>
                  )}
                </div>
              )}

              {/* Result */}
              {importStockResult && (
                <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: importStockResult.success ? "#ECFDF5" : "#FEF2F2", color: importStockResult.success ? "#10B981" : "#EF4444", fontSize: 13, fontWeight: 700 }}>
                  {importStockResult.success ? `✅ Imported ${importStockResult.count} item${importStockResult.count !== 1 ? "s" : ""} successfully!` : `❌ ${importStockResult.message}`}
                </div>
              )}

              {/* Import button */}
              <button onClick={importStockItems} disabled={!importPreview?.length || importingStock}
                style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: importPreview?.length && !importingStock ? "#6366F1" : "#E2E8F0", color: importPreview?.length && !importingStock ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 15, cursor: importPreview?.length && !importingStock ? "pointer" : "not-allowed" }}>
                {importingStock ? "⏳ Importing..." : importPreview?.length ? `Import ${importPreview.length} item${importPreview.length !== 1 ? "s" : ""} →` : "Select a file first"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
