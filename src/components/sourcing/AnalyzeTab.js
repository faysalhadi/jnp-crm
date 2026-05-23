import { useState, useRef } from "react";
import { supabase } from "../../supabase";
import {
  parseFile, detectColumns, filterUnits, groupUnits,
  calcLandedCost, calcGroupProfit, getAdjustedSellPrice, getAdjustmentReason,
  buildAnalyzePrompt, buildExportWorkbook, downloadWorkbook,
  readPreprocessedExcel, normalizeStorage,
  DEFAULT_RAM_ADJUSTMENTS, DEFAULT_SSD_ADJUSTMENTS,
} from "./analyzeHelpers";

const PURPLE = "#534AB7";
const PURPLE_LIGHT = "#EEEDFE";
const GREEN = "#0F6E56";
const GREEN_LIGHT = "#E1F5EE";
const AMBER = "#854F0B";
const AMBER_LIGHT = "#FAEEDA";
const RED = "#A32D2D";
const RED_LIGHT = "#FCEBEB";

function MarginBadge({ margin }) {
  if (!margin) return null;
  const m = parseFloat(margin);
  const bg = m >= 20 ? GREEN_LIGHT : m >= 10 ? AMBER_LIGHT : RED_LIGHT;
  const color = m >= 20 ? GREEN : m >= 10 ? AMBER : RED;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: bg, color, whiteSpace: "nowrap" }}>
      {margin}% margin
    </span>
  );
}

function IssueTag({ issue }) {
  const isPositive = issue.type === "computrace_disabled";
  const isMinor = issue.priceImpact === "minor" || issue.priceImpact === "none";
  const bg = isPositive ? GREEN_LIGHT : isMinor ? AMBER_LIGHT : RED_LIGHT;
  const color = isPositive ? GREEN : isMinor ? AMBER : RED;
  const label = issue.type.replace(/_/g, " ");
  return (
    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: bg, color, fontWeight: 500 }}>
      {issue.units > 1 ? `${issue.units}× ` : ""}{label}
    </span>
  );
}

export default function AnalyzeTab({ anthropicKey }) {
  const [file, setFile] = useState(null);
  const [shipping, setShipping] = useState("1200");
  const [duty, setDuty] = useState("5");
  const [currency, setCurrency] = useState("USD");
  const [processing, setProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const [viable, setViable] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [groups, setGroups] = useState([]);
  const [colMap, setColMap] = useState(null);
  const [preprocessed, setPreprocessed] = useState(false);

  const [claudeResults, setClaudeResults] = useState([]);
  const [analyzed, setAnalyzed] = useState(false);

  const [sellPrices, setSellPrices] = useState({});
  const [profits, setProfits] = useState({});
  const [hasPriceCol, setHasPriceCol] = useState(false);
  const [groupAskPrices, setGroupAskPrices] = useState({});
  const [groupCurrencies, setGroupCurrencies] = useState({});
  const [ramAdjustments, setRamAdjustments] = useState(DEFAULT_RAM_ADJUSTMENTS);
  const [ssdAdjustments, setSsdAdjustments] = useState(DEFAULT_SSD_ADJUSTMENTS);
  const [isReupload, setIsReupload] = useState(false);
  const [reuploadData, setReuploadData] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

  const fileInputRef = useRef();

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);
    setPreprocessed(false);
    setAnalyzed(false);
    setGroups([]);
    setViable([]);
    setFiltered([]);
    setClaudeResults([]);
    setSellPrices({});
    setProfits({});
    setGroupAskPrices({});
    setGroupCurrencies({});
    setHasPriceCol(false);
    setIsReupload(false);
    setReuploadData(null);
    setExpandedGroups({});
    setError(null);
    setProcessing(true);

    try {
      const preProcessed = await readPreprocessedExcel(f);

      if (preProcessed) {
        // ── RE-UPLOAD PATH ──
        setIsReupload(true);
        setReuploadData(preProcessed);

        if (preProcessed.settings?.ramAdjustments) setRamAdjustments(preProcessed.settings.ramAdjustments);
        if (preProcessed.settings?.ssdAdjustments) setSsdAdjustments(preProcessed.settings.ssdAdjustments);

        const viableRows = preProcessed.viableUnits;
        if (!viableRows.length) throw new Error("No viable units found in the file.");

        const mockColMap = {
          brand: "Brand", model: "Model", serial: "Serial",
          processor: "Processor", memory: "RAM", storage: "Storage",
          grade: "Grade", gradingNotes: "Grading Notes",
          price: "Unit Price", currency: "Currency",
        };
        setColMap(mockColMap);

        const mappedRows = viableRows.map(row => ({
          ...row,
          _brand: String(row["Brand"] || ""),
          _proc: { label: String(row["Processor"] || ""), tier: "i5", gen: 8 },
          _ram: parseInt(String(row["RAM"] || "8").match(/\d+/)?.[0] || "8"),
        }));

        const grouped = groupUnits(mappedRows, mockColMap);
        setViable(mappedRows);
        setGroups(grouped);

        const priceMap = {};
        const askMap = {};
        const currMap = {};
        for (const gp of preProcessed.groupPrices) {
          const match = grouped.find(g =>
            g.brand.toLowerCase() === gp.brand.toLowerCase() &&
            g.model.toLowerCase() === gp.model.toLowerCase()
          );
          if (match) {
            if (gp.sellPrice > 0) priceMap[match.key] = gp.sellPrice;
            if (gp.askPrice > 0) askMap[match.key] = gp.askPrice;
            if (gp.currency) currMap[match.key] = gp.currency;
          }
        }
        setSellPrices(priceMap);
        setGroupAskPrices(askMap);
        setGroupCurrencies(currMap);

        setFiltered(preProcessed.filteredUnits.map(r => ({
          ...r,
          _brand: r["Brand"],
          _filterReason: r["Filter Reason"],
          [mockColMap.model]: r["Model"],
        })));

        setPreprocessed(true);
        setHasPriceCol(false);

        const newProfits = {};
        const ramAdj = preProcessed.settings.ramAdjustments;
        const ssdAdj = preProcessed.settings.ssdAdjustments;
        for (const group of grouped) {
          const sellPrice = priceMap[group.key];
          const askPrice = askMap[group.key];
          if (sellPrice && askPrice) {
            const profit = calcGroupProfit(
              group, sellPrice,
              preProcessed.settings?.shipping || parseFloat(shipping),
              preProcessed.settings?.duty || parseFloat(duty),
              mockColMap, askPrice, currMap[group.key] || "USD",
              ramAdj, ssdAdj
            );
            if (profit) newProfits[group.key] = profit;
          }
        }
        setProfits(newProfits);

      } else {
        // ── FIRST UPLOAD PATH (raw supplier file) ──
        const rows = await parseFile(f);
        if (!rows.length) throw new Error("No data found in file");

        const headers = Object.keys(rows[0]);
        const detected = detectColumns(headers);

        if (!detected.brand && !detected.model) {
          throw new Error("Could not detect columns. Check the file has Brand/Model columns.");
        }

        setHasPriceCol(!!detected.price);
        setColMap(detected);
        const { viable: v, filtered: filt } = filterUnits(rows, detected);
        const grouped = groupUnits(v, detected);

        setViable(v);
        setFiltered(filt);
        setGroups(grouped);
        setPreprocessed(true);

        const { data: savedPrices } = await supabase
          .from("pricing_rules")
          .select("model_key, sell_price")
          .in("model_key", grouped.map(g => g.key));

        if (savedPrices?.length) {
          const priceMap = {};
          savedPrices.forEach(p => { priceMap[p.model_key] = p.sell_price; });
          setSellPrices(priceMap);
        }
      }
    } catch (err) {
      setError(err.message);
    }
    setProcessing(false);
  };

  const handleExportPreprocessed = () => {
    if (!groups.length) return;
    const wb = buildExportWorkbook(
      groups, filtered, viable, {}, [], shipping, duty, colMap, false,
      {}, {}, ramAdjustments, ssdAdjustments
    );
    downloadWorkbook(wb, `preprocessed_${file.name.replace(/\.(xlsx|xls|csv)$/i, "")}.xlsx`);
  };

  const handleAnalyze = async () => {
    if (!groups.length || !anthropicKey) return;
    setAnalyzing(true);
    setError(null);
    try {
      const prompt = buildAnalyzePrompt(groups);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "[]";
      const clean = text.replace(/```json|```/g, "").trim();
      const results = JSON.parse(clean);
      setClaudeResults(results);
      setAnalyzed(true);
    } catch (err) {
      setError("Analysis failed: " + err.message);
    }
    setAnalyzing(false);
  };

  const handleExportWithProfit = () => {
    if (!groups.length) return;
    const wb = buildExportWorkbook(
      groups, filtered, viable, sellPrices, claudeResults, shipping, duty, colMap, true,
      groupAskPrices, groupCurrencies, ramAdjustments, ssdAdjustments
    );
    downloadWorkbook(wb, `analysis_${file.name.replace(/\.(xlsx|xls|csv)$/i, "")}.xlsx`);
  };

  const handleSellPrice = async (groupKey, price) => {
    setSellPrices(p => ({ ...p, [groupKey]: price }));
    const group = groups.find(g => g.key === groupKey);
    if (!group) return;

    const profit = calcGroupProfit(
      group, price, parseFloat(shipping), parseFloat(duty), colMap,
      hasPriceCol ? null : groupAskPrices[groupKey],
      hasPriceCol ? null : (groupCurrencies[groupKey] || currency),
      ramAdjustments, ssdAdjustments
    );
    setProfits(p => ({ ...p, [groupKey]: profit }));

    if (price && parseFloat(price) > 0) {
      await supabase.from("pricing_rules").upsert({
        model_key: groupKey,
        brand: group.brand,
        model: group.model,
        processor: group.procLabel,
        sell_price: parseFloat(price),
        updated_at: new Date().toISOString(),
      }, { onConflict: "model_key" });
    }
  };

  const totalProfit = Object.values(profits).reduce((sum, p) => sum + (p?.profit || 0), 0);
  const groupsWithPrice = Object.values(sellPrices).filter(Boolean).length;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Upload card */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>UPLOAD PRICE LIST</div>

        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ border: "1.5px dashed #E2E8F0", borderRadius: 10, padding: 18, textAlign: "center", background: "#F8FAFC", marginBottom: 12, cursor: "pointer" }}>
          <div style={{ fontSize: 22, color: "#94A3B8", marginBottom: 6 }}>📊</div>
          {file ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{file.name}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{viable.length + filtered.length} rows detected</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Tap to upload price list</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Supports .xlsx · .xls · .csv</div>
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />

        {isReupload && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "#E1F5EE", border: "1px solid #5DCAA5", fontSize: 12, color: "#0F6E56", fontWeight: 600, marginBottom: 10 }}>
            ✅ Pre-processed file detected — prices and settings loaded from Excel
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>Shipping (AED)</div>
            <input value={shipping} onChange={e => setShipping(e.target.value)} type="number"
              style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>Duty %</div>
            <input value={duty} onChange={e => setDuty(e.target.value)} type="number"
              style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>Currency</div>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
              <option>USD</option>
              <option>GBP</option>
              <option>AED</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FEE2E2", fontSize: 12, color: "#EF4444", marginBottom: 10 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {preprocessed && (
            <button onClick={handleExportPreprocessed}
              style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              📥 Export pre-processed
            </button>
          )}
          {preprocessed && (
            <button onClick={handleAnalyze} disabled={analyzing || !anthropicKey}
              style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "none", background: analyzing || !anthropicKey ? "#E2E8F0" : PURPLE, color: analyzing || !anthropicKey ? "#94A3B8" : "#fff", fontSize: 12, fontWeight: 700, cursor: analyzing || !anthropicKey ? "not-allowed" : "pointer" }}>
              {analyzing ? "⏳ Analyzing..." : "🤖 Analyze profit"}
            </button>
          )}
        </div>
      </div>

      {/* Processing indicator */}
      {processing && (
        <div style={{ textAlign: "center", padding: 20, color: "#94A3B8", fontSize: 13 }}>
          ⏳ Reading and processing file...
        </div>
      )}

      {/* Summary stats */}
      {preprocessed && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Viable units", val: viable.length, color: "#0F172A" },
            { label: "Filtered out", val: filtered.length, color: AMBER },
            { label: "Model groups", val: groups.length, color: "#0F172A" },
            { label: "Est. total profit", val: totalProfit > 0 ? `AED ${totalProfit.toLocaleString()}` : `${groupsWithPrice}/${groups.length} priced`, color: totalProfit > 0 ? GREEN : "#94A3B8" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>
            GROUPS — ENTER YOUR SELL PRICE
          </div>

          {groups.map(group => {
            const claudeResult = claudeResults.find(r => r.key === group.key);
            const profit = profits[group.key];
            const sellPrice = sellPrices[group.key];
            const margin = profit?.margin;
            const hasMajorIssue = claudeResult?.issues?.some(i => i.priceImpact === "major");

            return (
              <div key={group.key} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${hasMajorIssue ? "#FEE2E2" : "#E2E8F0"}`, overflow: "hidden" }}>
                {/* Group header */}
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{group.brand} {group.model}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                        {group.procLabel} · {group.baseRam}GB · {group.baseStorage}GB · {group.units.length} units
                      </div>
                    </div>
                    {margin ? <MarginBadge margin={margin} /> : (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#94A3B8", fontWeight: 600 }}>
                        Price needed
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#64748B" }}>
                    {group.grades.A.length > 0 && <span>Grade A: {group.grades.A.length}</span>}
                    {group.grades.B.length > 0 && <span>Grade B: {group.grades.B.length}</span>}
                    {group.grades.C.length > 0 && <span>Grade C: {group.grades.C.length}</span>}
                  </div>

                  {group.isNiche && (
                    <div style={{ fontSize: 10, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "2px 8px", borderRadius: 20, marginTop: 4, display: "inline-block" }}>
                      ⚠️ {group.nicheReason}
                    </div>
                  )}

                  {(group.ramUpgrades > 0 || group.storageUpgrades > 0) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: PURPLE, background: PURPLE_LIGHT, padding: "3px 8px", borderRadius: 6, display: "inline-block" }}>
                      {group.ramUpgrades > 0 && `${group.ramUpgrades}× extra RAM`}
                      {group.ramUpgrades > 0 && group.storageUpgrades > 0 && " · "}
                      {group.storageUpgrades > 0 && `${group.storageUpgrades}× extra storage`}
                    </div>
                  )}
                </div>

                {/* Cost + issues */}
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9" }}>
                  {claudeResult?.issues?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                      {claudeResult.issues.map((issue, i) => <IssueTag key={i} issue={issue} />)}
                    </div>
                  )}

                  {!hasPriceCol && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>Ask price per unit (from supplier quote)</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <select
                          value={groupCurrencies[group.key] || "USD"}
                          onChange={e => setGroupCurrencies(g => ({ ...g, [group.key]: e.target.value }))}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none" }}>
                          <option>USD</option>
                          <option>GBP</option>
                          <option>AED</option>
                        </select>
                        <input
                          type="number"
                          placeholder="e.g. 120"
                          value={groupAskPrices[group.key] || ""}
                          onChange={e => setGroupAskPrices(g => ({ ...g, [group.key]: e.target.value }))}
                          style={{ flex: 1, padding: "5px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none" }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B", marginBottom: 3 }}>
                    <span>Landed cost / unit (avg)</span>
                    <span style={{ fontWeight: 600, color: "#0F172A" }}>
                      AED {Math.round(
                        group.units.reduce((sum, u) => {
                          const unitPrice = hasPriceCol
                            ? parseFloat(u.row[colMap.price] || 0)
                            : parseFloat(groupAskPrices[group.key] || 0);
                          const curr = hasPriceCol
                            ? String(u.row[colMap.currency] || currency).trim()
                            : (groupCurrencies[group.key] || currency);
                          return sum + calcLandedCost(unitPrice, curr, 1, parseFloat(shipping) / group.units.length, parseFloat(duty));
                        }, 0) / group.units.length
                      ).toLocaleString()}
                    </span>
                  </div>

                  {claudeResult?.recommendation && (
                    <div style={{ fontSize: 11, color: claudeResult.recommendation === "buy" ? GREEN : claudeResult.recommendation === "skip" ? RED : AMBER, marginTop: 4 }}>
                      {claudeResult.recommendation === "buy" ? "✅" : claudeResult.recommendation === "skip" ? "❌" : "⚠️"} {claudeResult.recommendationReason}
                    </div>
                  )}
                </div>

                {/* Sell price input */}
                <div style={{ padding: "10px 14px", background: sellPrice ? "#F0FDF4" : "#FAFAFA" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 11, color: PURPLE, flex: 1 }}>
                      Your sell price (Grade B base)
                      {sellPrice && <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 4 }}>· A: +10% · C: -15%</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>AED</span>
                      <input
                        type="number"
                        value={sellPrice || ""}
                        onChange={e => handleSellPrice(group.key, e.target.value)}
                        placeholder="e.g. 850"
                        style={{ width: 80, padding: "5px 8px", borderRadius: 8, border: `1px solid ${sellPrice ? "#5DCAA5" : "#C7D2FE"}`, fontSize: 12, fontWeight: 700, color: sellPrice ? GREEN : PURPLE, background: sellPrice ? "#E1F5EE" : PURPLE_LIGHT, outline: "none", textAlign: "right" }}
                      />
                    </div>
                  </div>

                  {profit && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A" }}>
                        Est. gross profit · {group.units.length} units
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: parseFloat(profit.margin) >= 15 ? GREEN : AMBER }}>
                        AED {profit.profit.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Per-unit breakdown */}
                {profit?.unitBreakdown?.length > 0 && (
                  <div style={{ borderTop: "1px solid #F1F5F9" }}>
                    <button
                      onClick={() => setExpandedGroups(p => ({ ...p, [group.key]: !p[group.key] }))}
                      style={{ width: "100%", padding: "7px 14px", background: "none", border: "none", fontSize: 11, color: "#94A3B8", cursor: "pointer", textAlign: "left" }}>
                      {expandedGroups[group.key] ? "▲ Hide" : "▼ Show"} per-unit breakdown
                    </button>
                    {expandedGroups[group.key] && (
                      <div style={{ padding: "0 14px 10px" }}>
                        {Object.entries(
                          profit.unitBreakdown.reduce((acc, u) => {
                            const k = `${u.ram}GB / ${u.storage >= 1000 ? "1 TB" : u.storage ? u.storage + " GB" : "No SSD"} · Grade ${u.grade}`;
                            if (!acc[k]) acc[k] = { ...u, count: 0 };
                            acc[k].count++;
                            return acc;
                          }, {})
                        ).map(([spec, data]) => (
                          <div key={spec} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #F8FAFC", fontSize: 11 }}>
                            <div>
                              <span style={{ color: "#0F172A", fontWeight: 500 }}>{spec}</span>
                              <span style={{ color: "#94A3B8", marginLeft: 6 }}>× {data.count}</span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 600, color: "#0F172A" }}>AED {data.adjustedSell}</div>
                              <div style={{ fontSize: 10, color: "#94A3B8" }}>{data.reason}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {analyzed && (
            <button onClick={handleExportWithProfit}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              📥 Export analysis with profit
            </button>
          )}
        </>
      )}

      {/* Filtered out */}
      {filtered.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>
            FILTERED OUT — {filtered.length} UNITS
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            {filtered.map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: i < filtered.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 12 }}>
                <span style={{ color: "#475569" }}>
                  {row._brand} {String(row[colMap.model] || "").slice(0, 25)}
                </span>
                <span style={{ fontSize: 11, color: AMBER, background: AMBER_LIGHT, padding: "2px 8px", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap", marginLeft: 8 }}>
                  {row._filterReason}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
