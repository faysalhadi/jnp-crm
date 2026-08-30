import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { useAuth } from "../../context/AuthContext";
import { useStock } from "../../context/StockContext";
import { useProfile } from "../../context/ProfileContext";
import * as XLSX from "xlsx";

// ── helpers ──────────────────────────────────────────────────────────────────
function allocateLotCost(rows, lotCost) {
  // Market-weighted allocation
  const totalMarket = rows.reduce((s, r) => s + r.qty * r.marketValue, 0);
  if (totalMarket === 0) return rows.map(r => ({ ...r, allocatedCostPerUnit: 0 }));
  return rows.map(r => {
    const share     = (r.qty * r.marketValue) / totalMarket;
    const lotShare  = lotCost * share;
    const perUnit   = lotShare / r.qty;
    return { ...r, allocatedCostPerUnit: Math.round(perUnit), totalCostPerUnit: Math.round(perUnit + r.refurbCost) };
  });
}

function fmtAED(n) {
  if (!n && n !== 0) return "—";
  return "AED " + Number(n).toLocaleString();
}

// ── main component ────────────────────────────────────────────────────────────
export default function LotsView() {
  const { anthropicKey } = useAuth();
  const { stock, loadStock } = useStock();
  const { showCostFields } = useProfile();

  const [lots, setLots]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [view, setView]           = useState("list");  // list | create | detail | chunk
  const [activeLot, setActiveLot] = useState(null);

  // Create lot state
  const [lotForm, setLotForm]     = useState({ name: "", supplier: "", purchase_date: "", total_cost: "" });
  const [parsedRows, setParsedRows]  = useState([]);   // from sheet
  const [allocatedRows, setAllocated] = useState([]);  // after cost allocation
  const [saving, setSaving]          = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Chunk sell state
  const [chunkDevices, setChunkDevices]   = useState([]);
  const [chunkOffer, setChunkOffer]       = useState("");
  const [chunkTrader, setChunkTrader]     = useState("");
  const [chunkResult, setChunkResult]     = useState(null);

  useEffect(() => { loadLots(); }, []); // eslint-disable-line

  const loadLots = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lots")
      .select("*")
      .order("created_at", { ascending: false });
    setLots(data || []);
    setLoading(false);
  }, []);

  // ── Parse uploaded Excel sheet ──────────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb  = XLSX.read(ev.target.result, { type: "binary" });
        const ws  = wb.Sheets[wb.SheetNames[0]];

        // Read all rows as array (preserves row positions for lot header fields)
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // Rows 0-2 are lot info fields (col 0 = label, col 1 = value)
        // Format: "LOT NAME...", value | "SUPPLIER...", value | "LOT PURCHASE PRICE...", value
        const getRowVal = (rowIdx) => {
          const row = allRows[rowIdx] || [];
          // Value is in column B (index 1) — could be any non-empty col after label
          for (let ci = 1; ci < row.length; ci++) {
            if (row[ci] !== "" && row[ci] !== null && row[ci] !== undefined) return String(row[ci]).trim();
          }
          return "";
        };

        const lotName     = getRowVal(0);
        const lotSupplier = getRowVal(1);
        const lotPrice    = getRowVal(2);

        if (lotName)     setLotForm(f => ({ ...f, name: lotName }));
        if (lotSupplier) setLotForm(f => ({ ...f, supplier: lotSupplier }));
        if (lotPrice)    setLotForm(f => ({ ...f, total_cost: String(parseFloat(lotPrice.replace(/,/g, "")) || "") }));

        // Find header row — first row containing "Brand" or "brand"
        let headerRowIdx = -1;
        for (let i = 0; i < allRows.length; i++) {
          const row = allRows[i];
          if (row.some(cell => String(cell).toLowerCase().trim() === "brand")) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          setUploadError("Could not find header row. Make sure your sheet has a row with 'Brand', 'Model', 'Qty' etc.");
          return;
        }

        // Build column index map
        const headers = allRows[headerRowIdx].map(h => String(h).trim().toLowerCase());
        const colIdx = (names) => {
          for (const n of names) {
            const idx = headers.findIndex(h => h === n.toLowerCase() || h.includes(n.toLowerCase()));
            if (idx >= 0) return idx;
          }
          return -1;
        };

        const brandCol     = colIdx(["brand"]);
        const modelCol     = colIdx(["model"]);
        const processorCol = colIdx(["processor"]);
        const ramCol       = colIdx(["ram"]);
        const ssdCol       = colIdx(["ssd"]);
        const condCol      = colIdx(["condition"]);
        const qtyCol       = colIdx(["qty", "quantity"]);
        const mvCol        = colIdx(["market value", "marketvalue"]);
        const sellCol      = colIdx(["sell price", "max price", "my sell price"]);
        const notesCol     = colIdx(["notes"]);

        if (brandCol === -1 || modelCol === -1) {
          setUploadError("Could not find Brand or Model columns.");
          return;
        }

        const getCell = (row, idx) => idx >= 0 ? String(row[idx] || "").trim() : "";
        const getNum  = (row, idx) => idx >= 0 ? parseFloat(String(row[idx] || "").replace(/,/g, "")) || 0 : 0;

        const rows = allRows.slice(headerRowIdx + 1).filter(row => {
          const brand = getCell(row, brandCol);
          return brand && brand.length > 0;
        }).map(row => ({
          brand:       getCell(row, brandCol),
          model:       getCell(row, modelCol),
          processor:   getCell(row, processorCol),
          ram:         getCell(row, ramCol),
          ssd:         getCell(row, ssdCol),
          condition:   getCell(row, condCol),
          qty:         Math.max(1, parseInt(getCell(row, qtyCol)) || 1),
          marketValue: getNum(row, mvCol),
          sellPrice:   getNum(row, sellCol),
          notes:       getCell(row, notesCol),
          refurbCost:  0,
        }));

        if (rows.length === 0) {
          setUploadError("No device rows found after the header row.");
          return;
        }
        setParsedRows(rows);
        setUploadError(null);
      } catch (err) {
        setUploadError("Could not read file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  }

  // Recalculate allocation when lotCost or rows change
  useEffect(() => {
    if (!parsedRows.length || !lotForm.total_cost) { setAllocated([]); return; }
    const cost = parseFloat(lotForm.total_cost);
    if (!cost) { setAllocated([]); return; }
    setAllocated(allocateLotCost(parsedRows, cost));
  }, [parsedRows, lotForm.total_cost]);

  // ── Save lot to Supabase ────────────────────────────────────────────────
  async function saveLot() {
    if (!lotForm.name || !lotForm.total_cost || !allocatedRows.length) return;
    setSaving(true);

    // 1. Create lot record
    const { data: lot, error: lotErr } = await supabase.from("lots").insert({
      name:          lotForm.name,
      supplier:      lotForm.supplier || null,
      purchase_date: lotForm.purchase_date || null,
      total_cost:    parseFloat(lotForm.total_cost),
      total_devices: allocatedRows.reduce((s, r) => s + r.qty, 0),
      status:        "active",
    }).select().single();

    if (lotErr || !lot) {
      alert("Failed to create lot: " + (lotErr?.message || "unknown error"));
      setSaving(false);
      return;
    }

    // 2. Create stock items for each row × qty
    const stockItems = [];
    for (const row of allocatedRows) {
      for (let i = 0; i < row.qty; i++) {
        stockItems.push({
          brand:          row.brand || null,
          model:          row.model || null,
          processor:      row.processor || null,
          condition:      row.condition || null,
          cost_price:     row.totalCostPerUnit,
          min_price:      row.sellPrice ? Math.round(row.sellPrice * 0.92) : null,
          max_price:      row.sellPrice || null,
          status:         "available",
          lot_id:         lot.id,
          allocated_lot_cost: row.allocatedCostPerUnit,
          refurb_cost:    row.refurbCost || 0,
          notes:          row.notes || null,
        });
      }
    }

    // Insert in batches of 20
    for (let i = 0; i < stockItems.length; i += 20) {
      await supabase.from("stock").insert(stockItems.slice(i, i + 20));
    }

    await loadStock();
    await loadLots();
    setSaving(false);
    setView("list");
    setLotForm({ name: "", supplier: "", purchase_date: "", total_cost: "" });
    setParsedRows([]);
    setAllocated([]);
  }

  // ── Chunk sell calculation ──────────────────────────────────────────────
  function calcChunk() {
    const offer = parseFloat(chunkOffer);
    if (!offer || !chunkDevices.length) { setChunkResult(null); return; }

    // Mixed models: allocate by market value ratio
    const totalMv = chunkDevices.reduce((s, d) => s + (d.max_price || 0), 0);
    const devices = chunkDevices.map(d => {
      const allocated = totalMv > 0 ? offer * ((d.max_price || 0) / totalMv) : offer / chunkDevices.length;
      const cost = d.cost_price || 0;
      return { ...d, allocatedPrice: Math.round(allocated), profit: Math.round(allocated - cost), margin: cost > 0 ? ((allocated - cost) / allocated) * 100 : 0 };
    });
    const totalCost   = devices.reduce((s, d) => s + (d.cost_price || 0), 0);
    const totalProfit = offer - totalCost;
    const totalMargin = offer > 0 ? (totalProfit / offer) * 100 : 0;
    const counter     = Math.round(totalCost / (1 - 0.22)); // 22% target margin

    setChunkResult({ devices, totalCost, totalProfit, totalMargin, counter, offer });
  }

  async function confirmChunkSale() {
    if (!chunkResult || !chunkTrader) return;
    for (const d of chunkResult.devices) {
      await supabase.from("stock").update({
        status:     "sold",
        sold_price: d.allocatedPrice,
        sold_at:    new Date().toISOString(),
      }).eq("id", d.id);
    }
    await loadStock();
    await loadLots();
    setView("detail");
    setChunkDevices([]);
    setChunkOffer("");
    setChunkTrader("");
    setChunkResult(null);
    alert(`✅ Chunk sale recorded — ${chunkResult.devices.length} devices sold to ${chunkTrader} for AED ${chunkResult.offer.toLocaleString()}`);
  }

  // ── Lot detail stats ────────────────────────────────────────────────────
  function lotStats(lot) {
    const lotStock = stock.filter(s => s.lot_id === lot.id);
    const sold     = lotStock.filter(s => s.status === "sold");
    const available = lotStock.filter(s => s.status === "available");
    const totalIn  = lot.total_cost + (lotStock.reduce((s, d) => s + (d.refurb_cost || 0), 0));
    const recovered = sold.reduce((s, d) => s + (d.sold_price || 0), 0);
    const costOfSold = sold.reduce((s, d) => s + (d.cost_price || 0), 0);
    const profitSoFar = recovered - costOfSold;
    const potentialRev = available.reduce((s, d) => s + (d.max_price || 0), 0);
    const remainingCost = available.reduce((s, d) => s + (d.cost_price || 0), 0);
    return { lotStock, sold, available, totalIn, recovered, costOfSold, profitSoFar, potentialRev, remainingCost };
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  if (view === "chunk" && activeLot) {
    const s = lotStats(activeLot);
    return (
      <div style={{ padding: "14px 14px 100px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("detail")} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 18 }}>←</button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>Sell a Chunk</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{activeLot.name}</div>
          </div>
        </div>

        {/* Select devices */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>Select Devices to Sell</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {s.available.map(d => {
              const selected = chunkDevices.some(x => x.id === d.id);
              return (
                <div key={d.id} onClick={() => {
                  setChunkDevices(prev => selected ? prev.filter(x => x.id !== d.id) : [...prev, d]);
                  setChunkResult(null);
                }} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                  border: `1.5px solid ${selected ? "#6366F1" : "#E2E8F0"}`,
                  background: selected ? "#EEF2FF" : "#F8FAFC",
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${selected ? "#6366F1" : "#CBD5E1"}`, background: selected ? "#6366F1" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {selected && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{d.brand} {d.model}</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{[d.processor, d.ram, d.ssd, d.condition].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>AED {(d.max_price || 0).toLocaleString()}</div>
                    {showCostFields&& <div style={{ fontSize: 10, color: "#94A3B8" }}>cost {(d.cost_price || 0).toLocaleString()}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {chunkDevices.length > 0 && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#EEF2FF", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#6366F1" }}>
              {chunkDevices.length} device{chunkDevices.length !== 1 ? "s" : ""} selected · Total ask: AED {chunkDevices.reduce((s, d) => s + (d.max_price || 0), 0).toLocaleString()}
            </div>
          )}
        </div>

        {/* Trader + offer */}
        {chunkDevices.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>Deal Details</div>
            <input value={chunkTrader} onChange={e => setChunkTrader(e.target.value)}
              placeholder="Trader / buyer name"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" value={chunkOffer} onChange={e => { setChunkOffer(e.target.value); setChunkResult(null); }}
                placeholder="Trader offers AED..."
                style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none" }} />
              <button onClick={calcChunk} disabled={!chunkOffer}
                style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                Calculate
              </button>
            </div>
          </div>
        )}

        {/* Chunk result */}
        {chunkResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Per device breakdown */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Per Device Breakdown</div>
              {chunkResult.devices.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < chunkResult.devices.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{d.brand} {d.model}</div>
                    {showCostFields&& <div style={{ fontSize: 10, color: "#94A3B8" }}>Cost AED {(d.cost_price || 0).toLocaleString()}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6366F1" }}>AED {d.allocatedPrice.toLocaleString()}</div>
                    {showCostFields&& (
                      <div style={{ fontSize: 10, color: d.profit > 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                        +{d.profit.toLocaleString()} ({d.margin.toFixed(1)}%)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            {showCostFields&& (
              <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
                {[
                  { label: "Your total cost", val: `AED ${chunkResult.totalCost.toLocaleString()}`, color: "#64748B" },
                  { label: "Trader offers", val: `AED ${chunkResult.offer.toLocaleString()}`, color: "#0F172A" },
                  { label: "Your profit", val: `AED ${chunkResult.totalProfit.toLocaleString()} (${chunkResult.totalMargin.toFixed(1)}%)`, color: chunkResult.totalProfit > 0 ? "#10B981" : "#EF4444" },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 2 ? "1px solid #F8FAFC" : "none" }}>
                    <span style={{ fontSize: 12, color: "#64748B" }}>{row.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: row.color }}>{row.val}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Verdict */}
            <div style={{
              padding: "10px 14px", borderRadius: 12, textAlign: "center", fontWeight: 800, fontSize: 13,
              background: chunkResult.totalMargin < 10 ? "#FEF2F2" : chunkResult.totalMargin < 18 ? "#FFFBEB" : "#ECFDF5",
              color:      chunkResult.totalMargin < 10 ? "#EF4444" : chunkResult.totalMargin < 18 ? "#D97706" : "#10B981",
            }}>
              {chunkResult.totalMargin < 0   ? "❌ Reject — you'd lose money"
               : chunkResult.totalMargin < 10 ? "⚠️ Too low — counter or decline"
               : chunkResult.totalMargin < 18 ? "🟡 Acceptable — below target margin"
               : "✅ Good deal — accept"}
            </div>

            {/* Counter suggestion */}
            {chunkResult.offer < chunkDevices.reduce((s, d) => s + (d.max_price || 0), 0) && (
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "#EEF2FF", fontSize: 12, color: "#534AB7", fontWeight: 600 }}>
                💡 Counter at AED {chunkResult.counter.toLocaleString()} for 22% margin
              </div>
            )}

            {/* Confirm */}
            {chunkTrader && (
              <button onClick={confirmChunkSale}
                style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#10B981", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                ✅ Confirm Sale to {chunkTrader}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (view === "detail" && activeLot) {
    const s = lotStats(activeLot);
    const recoveryPct = s.totalIn > 0 ? (s.recovered / s.totalIn) * 100 : 0;
    const marginPct   = s.recovered > 0 ? (s.profitSoFar / s.recovered) * 100 : 0;
    return (
      <div style={{ padding: "14px 14px 100px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("list")} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 18 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{activeLot.name}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{activeLot.supplier || "No supplier"} · {activeLot.total_devices} devices · {new Date(activeLot.created_at).toLocaleDateString("en-GB")}</div>
          </div>
          <button onClick={() => { setChunkDevices([]); setChunkOffer(""); setChunkResult(null); setView("chunk"); }}
            style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
            💰 Sell Chunk
          </button>
        </div>

        {/* Investment summary */}
        {showCostFields&& (
          <div style={{ background: "linear-gradient(135deg, #534AB7, #7C3AED)", borderRadius: 16, padding: 16, color: "#fff" }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8, marginBottom: 12 }}>LOT INVESTMENT</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Lot Cost",      val: fmtAED(activeLot.total_cost) },
                { label: "Total Refurb",  val: fmtAED(s.lotStock.reduce((x, d) => x + (d.refurb_cost || 0), 0)) },
                { label: "Total In",      val: fmtAED(s.totalIn), big: true },
                { label: "Devices",       val: s.lotStock.length, big: true },
              ].map((item, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: item.big ? 16 : 14, fontWeight: 800 }}>{item.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recovery progress */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>Recovery Progress</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: recoveryPct >= 100 ? "#10B981" : "#6366F1" }}>{recoveryPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", width: `${Math.min(recoveryPct, 100)}%`, background: recoveryPct >= 100 ? "#10B981" : "#6366F1", borderRadius: 4, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Sold", val: s.sold.length, color: "#10B981", bg: "#ECFDF5" },
              { label: "Available", val: s.available.length, color: "#6366F1", bg: "#EEF2FF" },
              { label: "Reserved", val: s.lotStock.filter(d => d.status === "reserved").length, color: "#D97706", bg: "#FFFBEB" },
            ].map((item, i) => (
              <div key={i} style={{ background: item.bg, borderRadius: 10, padding: "8px 0", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.val}</div>
                <div style={{ fontSize: 9, color: item.color, fontWeight: 700, opacity: 0.8 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Profit so far */}
        {showCostFields&& (
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>P&L So Far</div>
            {[
              { label: "Revenue recovered", val: fmtAED(s.recovered), color: "#0F172A" },
              { label: "Cost of sold devices", val: fmtAED(s.costOfSold), color: "#64748B" },
              { label: "Profit so far", val: `${fmtAED(s.profitSoFar)} (${marginPct.toFixed(1)}%)`, color: s.profitSoFar >= 0 ? "#10B981" : "#EF4444", big: true },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 2 ? "1px solid #F8FAFC" : "none" }}>
                <span style={{ fontSize: 12, color: "#64748B" }}>{row.label}</span>
                <span style={{ fontSize: row.big ? 14 : 12, fontWeight: row.big ? 800 : 600, color: row.color }}>{row.val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Remaining potential */}
        {showCostFields&& (
          <div style={{ background: "#ECFDF5", borderRadius: 14, padding: 14, border: "1px solid #BBF7D0" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#059669", marginBottom: 8 }}>Remaining Potential</div>
            {[
              { label: "Available devices", val: s.available.length },
              { label: "Stock value at sell price", val: fmtAED(s.potentialRev) },
              { label: "Remaining cost basis", val: fmtAED(s.remainingCost) },
              { label: "Potential additional profit", val: fmtAED(s.potentialRev - s.remainingCost) },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 3 ? "1px solid #BBF7D0" : "none" }}>
                <span style={{ fontSize: 11, color: "#059669" }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>{row.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "create") {
    const totalDevices  = parsedRows.reduce((s, r) => s + r.qty, 0);
    const totalMarketV  = parsedRows.reduce((s, r) => s + r.qty * r.marketValue, 0);
    const totalRefurb   = parsedRows.reduce((s, r) => s + r.qty * r.refurbCost, 0);
    const totalPotRev   = parsedRows.reduce((s, r) => s + r.qty * r.sellPrice, 0);
    const lotCost       = parseFloat(lotForm.total_cost) || 0;
    const totalInvest   = lotCost + totalRefurb;
    const potProfit     = totalPotRev - totalInvest;
    const potMargin     = totalPotRev > 0 ? (potProfit / totalPotRev) * 100 : 0;

    return (
      <div style={{ padding: "14px 14px 100px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("list")} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 18 }}>←</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>Create New Lot</div>
        </div>

        {/* Upload */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>1. Upload Pricing Sheet</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 10 }}>Use the JNP Lot Template. The app reads lot name, supplier, and lot price from the sheet automatically.</div>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px dashed #E2E8F0", fontSize: 12, boxSizing: "border-box", background: "#F8FAFC" }} />
          {uploadError && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 6, fontWeight: 600 }}>{uploadError}</div>}
        </div>

        {/* Lot details */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>2. Confirm Lot Details</div>
          {[
            { label: "Lot Name *", key: "name", placeholder: "e.g. HP/Dell Mixed — May 2025" },
            { label: "Supplier", key: "supplier", placeholder: "e.g. Adrian UK" },
            { label: "Purchase Date", key: "purchase_date", placeholder: "DD/MM/YYYY", type: "date" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 3, letterSpacing: 0.5 }}>{f.label}</div>
              <input type={f.type || "text"} value={lotForm[f.key]} onChange={e => setLotForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
          {showCostFields&& (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#D97706", marginBottom: 3, letterSpacing: 0.5 }}>LOT PURCHASE PRICE (AED) — excl. refurb *</div>
              <input type="number" value={lotForm.total_cost} onChange={e => setLotForm(p => ({ ...p, total_cost: e.target.value }))}
                placeholder="e.g. 18000"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #FDE68A", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box", background: "#FFFBEB" }} />
            </div>
          )}
        </div>

        {/* Allocation preview */}
        {showCostFields&& allocatedRows.length > 0 && (
          <>
            {/* Summary */}
            <div style={{ background: "linear-gradient(135deg, #534AB7, #7C3AED)", borderRadius: 14, padding: 14, color: "#fff" }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8, marginBottom: 8 }}>LOT PREVIEW</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { l: "Total Devices", v: totalDevices },
                  { l: "Total Market Value", v: fmtAED(totalMarketV) },
                  { l: "Lot + Refurb Cost", v: fmtAED(totalInvest) },
                  { l: "Potential Revenue", v: fmtAED(totalPotRev) },
                  { l: "Potential Profit", v: fmtAED(potProfit) },
                  { l: "Profit Margin", v: `${potMargin.toFixed(1)}%` },
                ].map((item, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, opacity: 0.7 }}>{item.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{item.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per model breakdown */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Cost Allocation Per Model</div>
              {allocatedRows.map((row, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < allocatedRows.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{row.brand} {row.model} · {row.condition}</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>×{row.qty} · Market AED {(row.marketValue || 0).toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#EF4444" }}>Cost AED {(row.totalCostPerUnit || 0).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>
                        Profit AED {((row.sellPrice || 0) - (row.totalCostPerUnit || 0)).toLocaleString()} ({row.sellPrice > 0 ? (((row.sellPrice - row.totalCostPerUnit) / row.sellPrice) * 100).toFixed(1) : 0}%)
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={saveLot} disabled={saving || !lotForm.name || !lotForm.total_cost}
              style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 14, cursor: saving ? "not-allowed" : "pointer",
                background: !lotForm.name || !lotForm.total_cost ? "#E2E8F0" : "#10B981",
                color: !lotForm.name || !lotForm.total_cost ? "#94A3B8" : "#fff" }}>
              {saving ? `⏳ Creating lot (${totalDevices} devices)...` : `✅ Create Lot & Add ${totalDevices} Devices to Stock`}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Lots list ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "14px 14px 100px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>📦 Lots</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>Track bulk purchases and profit per lot</div>
        </div>
        <button onClick={() => { setParsedRows([]); setAllocated([]); setLotForm({ name: "", supplier: "", purchase_date: "", total_cost: "" }); setView("create"); }}
          style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
          + New Lot
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "#94A3B8", padding: 40 }}>Loading...</div>}

      {!loading && lots.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No lots yet</div>
          <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Tap + New Lot to create your first</div>
        </div>
      )}

      {lots.map(lot => {
        const s = lotStats(lot);
        const recoveryPct = s.totalIn > 0 ? (s.recovered / s.totalIn) * 100 : 0;
        return (
          <div key={lot.id} onClick={() => { setActiveLot(lot); setView("detail"); }}
            style={{ background: "#fff", borderRadius: 16, padding: 14, border: "1px solid #F1F5F9", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{lot.name}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                  {lot.supplier || "No supplier"} · {lot.total_devices} devices · {new Date(lot.created_at).toLocaleDateString("en-GB")}
                </div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                background: lot.status === "complete" ? "#ECFDF5" : "#EEF2FF",
                color:      lot.status === "complete" ? "#059669" : "#6366F1" }}>
                {lot.status === "complete" ? "✅ Complete" : "🔄 Active"}
              </span>
            </div>

            {/* Mini stats */}
            <div style={{ display: "grid", gridTemplateColumns: showCostFields? "1fr 1fr 1fr 1fr" : "1fr 1fr", gap: 6, marginBottom: 10 }}>
              {[
                showCostFields&& { label: "Cost",    val: `AED ${(lot.total_cost || 0).toLocaleString()}`, color: "#EF4444" },
                { label: "Sold",    val: s.sold.length,      color: "#10B981" },
                { label: "Left",    val: s.available.length, color: "#6366F1" },
                showCostFields&& { label: "Profit",  val: s.profitSoFar > 0 ? `+${s.profitSoFar.toLocaleString()}` : s.profitSoFar.toLocaleString(), color: s.profitSoFar >= 0 ? "#10B981" : "#EF4444" },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ textAlign: "center", padding: "6px 4px", background: "#F8FAFC", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: item.color }}>{item.val}</div>
                  <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Recovery bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "#94A3B8" }}>Recovery</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: recoveryPct >= 100 ? "#10B981" : "#6366F1" }}>{recoveryPct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(recoveryPct, 100)}%`, background: recoveryPct >= 100 ? "#10B981" : "#6366F1", borderRadius: 3 }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
