import * as XLSX from "xlsx";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

export const SKIP_BRANDS = [
  "toshiba", "asustek", "asus", "acer", "gateway", "getac",
  "microsoft", "hewlett-packard", "hp inc", "samsung", "sony",
];

export const ALLOWED_BRANDS = ["dell", "hp", "lenovo", "apple"];

export const USD_TO_AED = 3.67;
export const GBP_TO_AED = 4.65;

// ── PROCESSOR NORMALIZATION ───────────────────────────────────────────────────

export function normalizeProcessor(procStr) {
  if (!procStr) return null;
  const s = procStr.toLowerCase();

  const match = s.match(/i(\d)[- ](\d{4,5})/);
  if (match) {
    const tier = match[1];
    const modelNum = match[2];
    const gen = modelNum.length === 4 ? parseInt(modelNum[0]) : parseInt(modelNum.slice(0, 2));
    return { tier: `i${tier}`, gen, label: `i${tier} ${gen}th Gen`, raw: procStr };
  }

  if (s.includes("ryzen 9")) return { tier: "ryzen9", gen: 0, label: "Ryzen 9", raw: procStr };
  if (s.includes("ryzen 7")) return { tier: "ryzen7", gen: 0, label: "Ryzen 7", raw: procStr };
  if (s.includes("ryzen 5")) return { tier: "ryzen5", gen: 0, label: "Ryzen 5", raw: procStr };
  if (s.includes("ryzen 3")) return { tier: "ryzen3", gen: 0, label: "Ryzen 3", raw: procStr };

  if (s.includes("celeron")) return { tier: "celeron", gen: 0, label: "Celeron", raw: procStr };
  if (s.includes("pentium")) return { tier: "pentium", gen: 0, label: "Pentium", raw: procStr };
  if (s.includes("core 2") || s.includes("dual core")) return { tier: "core2", gen: 0, label: "Core 2", raw: procStr };
  if (s.includes("atom")) return { tier: "atom", gen: 0, label: "Atom", raw: procStr };

  return { tier: "unknown", gen: 0, label: procStr.slice(0, 30), raw: procStr };
}

// ── NORMALIZE RAM ─────────────────────────────────────────────────────────────

export function normalizeRAM(memStr) {
  if (!memStr) return 8;
  const match = String(memStr).match(/(\d+)/);
  return match ? parseInt(match[1]) : 8;
}

// ── NORMALIZE STORAGE ─────────────────────────────────────────────────────────

export function normalizeStorage(storageStr) {
  if (!storageStr) return { gb: 0, label: "No SSD" };
  const s = String(storageStr).toLowerCase();
  if (s.includes("1.0") || s.includes("1 tb") || s.includes("1tb") || s.includes("1.02")) return { gb: 1000, label: "1 TB" };
  if (s.includes("512")) return { gb: 512, label: "512 GB" };
  if (s.includes("480")) return { gb: 480, label: "480 GB" };
  if (s.includes("256")) return { gb: 256, label: "256 GB" };
  if (s.includes("240")) return { gb: 240, label: "240 GB" };
  if (s.includes("180")) return { gb: 180, label: "180 GB" };
  if (s.includes("128")) return { gb: 128, label: "128 GB" };
  if (s.includes("500")) return { gb: 500, label: "500 GB" };
  if (s.includes("320")) return { gb: 320, label: "320 GB" };
  if (s.includes("250")) return { gb: 250, label: "250 GB" };
  if (s.includes("160")) return { gb: 160, label: "160 GB" };
  if (s.includes("80")) return { gb: 80, label: "80 GB" };
  return { gb: 0, label: "No SSD" };
}

// ── NORMALIZE BRAND ───────────────────────────────────────────────────────────

export function normalizeBrand(brandStr) {
  if (!brandStr) return "Unknown";
  const s = String(brandStr).toLowerCase().trim();
  if (s.includes("dell")) return "Dell";
  if (s.includes("hp") || s.includes("hewlett")) return "HP";
  if (s.includes("lenovo")) return "Lenovo";
  if (s.includes("apple")) return "Apple";
  if (s.includes("toshiba")) return "Toshiba";
  if (s.includes("asus")) return "Asus";
  if (s.includes("acer")) return "Acer";
  if (s.includes("getac")) return "Getac";
  if (s.includes("microsoft")) return "Microsoft";
  if (s.includes("gateway")) return "Gateway";
  return brandStr;
}

// ── DETECT COLUMNS ────────────────────────────────────────────────────────────

export function detectColumns(headers) {
  const h = headers.map(h => String(h || "").toLowerCase().trim());
  const find = (...keys) => {
    for (const key of keys) {
      const idx = h.findIndex(c => c.includes(key));
      if (idx >= 0) return headers[idx];
    }
    return null;
  };
  return {
    brand:        find("manufacturer", "brand", "make", "vendor"),
    model:        find("model", "description", "name", "product"),
    serial:       find("serial", "sn", "s/n"),
    processor:    find("processor", "cpu", "proc", "spec"),
    grade:        find("grade", "grading"),
    gradingNotes: find("grading notes", "notes", "comments"),
    memory:       find("memory", "ram", "mem"),
    storage:      find("disk", "storage", "ssd", "hdd", "drive"),
    screen:       find("screen", "display", "size"),
    touch:        find("touch"),
    price:        find("price", "cost", "ask", "unit price", "value"),
    currency:     find("currency", "curr"),
    qty:          find("qty", "quantity", "count"),
    condition:    find("condition", "status"),
  };
}

// ── PARSE EXCEL FILE ──────────────────────────────────────────────────────────

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// ── FILTER UNITS ──────────────────────────────────────────────────────────────

export function filterUnits(rows, colMap) {
  const viable = [];
  const filtered = [];

  for (const row of rows) {
    const brand = normalizeBrand(String(row[colMap.brand] || ""));
    const brandLow = brand.toLowerCase();
    const proc = normalizeProcessor(String(row[colMap.processor] || ""));
    const ram = normalizeRAM(row[colMap.memory]);

    if (SKIP_BRANDS.some(b => brandLow.includes(b))) {
      filtered.push({ ...row, _filterReason: "Brand not sold in UAE market", _brand: brand });
      continue;
    }

    if (!ALLOWED_BRANDS.some(b => brandLow.includes(b))) {
      filtered.push({ ...row, _filterReason: "Unknown brand", _brand: brand });
      continue;
    }

    if (proc) {
      if (["celeron", "pentium", "core2", "atom"].includes(proc.tier)) {
        filtered.push({ ...row, _filterReason: `Low-value processor (${proc.label})`, _brand: brand });
        continue;
      }
      if (proc.tier.startsWith("i") && proc.gen > 0 && proc.gen < 6) {
        filtered.push({ ...row, _filterReason: `Too old (${proc.label})`, _brand: brand });
        continue;
      }
    }

    if (ram < 8) {
      filtered.push({ ...row, _filterReason: `Low RAM (${ram}GB)`, _brand: brand });
      continue;
    }

    viable.push({ ...row, _brand: brand, _proc: proc, _ram: ram });
  }

  return { viable, filtered };
}

// ── GROUP VIABLE UNITS ────────────────────────────────────────────────────────

export function groupUnits(viable, colMap) {
  const groups = {};

  for (const row of viable) {
    const brand = row._brand;
    const model = String(row[colMap.model] || "").trim().toUpperCase();
    const proc = row._proc;
    const ram = row._ram;
    const storage = normalizeStorage(String(row[colMap.storage] || ""));
    const grade = String(row[colMap.grade] || "").trim().toUpperCase() || "C";
    const notes = String(row[colMap.gradingNotes] || "").trim();

    const baseRam = 8;
    const ramUpgrade = ram > baseRam ? ram - baseRam : 0;

    const baseStorage = 256;
    const storageUpgrade = storage.gb > baseStorage ? storage.gb - baseStorage : 0;

    const procLabel = proc ? proc.label : "Unknown";
    const key = `${brand}__${model}__${procLabel}__${baseRam}GB__${baseStorage}GB`;

    if (!groups[key]) {
      groups[key] = {
        key,
        brand,
        model,
        procLabel,
        procTier: proc?.tier || "unknown",
        procGen: proc?.gen || 0,
        baseRam,
        baseStorage,
        units: [],
        grades: { A: [], B: [], C: [] },
        ramUpgrades: 0,
        storageUpgrades: 0,
        allNotes: [],
      };
    }

    const unit = { row, grade, notes, ram, storage: storage.gb, ramUpgrade, storageUpgrade };
    groups[key].units.push(unit);

    if (grade === "A") groups[key].grades.A.push(unit);
    else if (grade === "B") groups[key].grades.B.push(unit);
    else groups[key].grades.C.push(unit);

    if (ramUpgrade > 0) groups[key].ramUpgrades++;
    if (storageUpgrade > 0) groups[key].storageUpgrades++;
    if (notes && notes.length > 2) groups[key].allNotes.push(notes);
  }

  return Object.values(groups);
}

// ── CALCULATE LANDED COST ─────────────────────────────────────────────────────

export function calcLandedCost(unitPrice, currency, qty, shippingAED, dutyPct) {
  if (!unitPrice || !qty) return 0;
  const rate = currency === "GBP" ? GBP_TO_AED : currency === "USD" ? USD_TO_AED : 1;
  const totalAskAED = parseFloat(unitPrice) * parseFloat(qty) * rate;
  const dutyAED = totalAskAED * (parseFloat(dutyPct) / 100);
  const totalLanded = totalAskAED + dutyAED + parseFloat(shippingAED || 0);
  return totalLanded / parseFloat(qty);
}

// ── BUILD PROMPT FOR CLAUDE ───────────────────────────────────────────────────

export function buildAnalyzePrompt(groups) {
  const groupSummary = groups.map(g => ({
    key: g.key,
    group: `${g.brand} ${g.model} · ${g.procLabel}`,
    units: g.units.length,
    grades: { A: g.grades.A.length, B: g.grades.B.length, C: g.grades.C.length },
    upgrades: {
      ram: g.ramUpgrades > 0 ? `${g.ramUpgrades} units have extra RAM` : null,
      storage: g.storageUpgrades > 0 ? `${g.storageUpgrades} units have extra storage` : null,
    },
    uniqueNotes: [...new Set(g.allNotes)].slice(0, 10),
  }));

  return `You are analyzing a laptop lot for a UAE laptop reseller.
Below are grouped units from a supplier price list, already filtered and grouped by model.

For each group, analyze the grading notes and return a JSON array.
Each item must have:
- "key": exact group key provided
- "issues": array of objects { "type": string, "units": number, "priceImpact": "none"|"minor"|"major", "note": string }
- "upgradeNote": string describing RAM/storage upgrades if any, else null
- "recommendation": "buy"|"negotiate"|"skip"
- "recommendationReason": one sentence

Issue types to detect: screen_damage, hinge_broken, keyboard_issue, battery_issue, trackpad_worn, cosmetic_scratches, missing_parts, panel_cracked, computrace_disabled (this is POSITIVE — not a problem), yellowed_screen, display_spots.

Computrace permanently disabled = positive, mark as priceImpact "none".
Worn trackpad/palmrest = cosmetic only, priceImpact "minor".
Screen damage, panel broken = priceImpact "major".
Missing parts that were added by supplier = not an issue.

GROUPS:
${JSON.stringify(groupSummary, null, 2)}

Return ONLY a valid JSON array. No markdown, no explanation.`;
}

// ── GRADE PRICE ADJUSTMENTS ───────────────────────────────────────────────────

export function gradeAdjustedPrice(basePrice, grade) {
  if (!basePrice) return 0;
  const p = parseFloat(basePrice);
  if (grade === "A") return Math.round(p * 1.1);
  if (grade === "B") return Math.round(p);
  if (grade === "C") return Math.round(p * 0.85);
  return Math.round(p);
}

// ── CALCULATE GROUP PROFIT ────────────────────────────────────────────────────

export function calcGroupProfit(group, sellPrice, shippingAED, dutyPct, colMap) {
  if (!sellPrice) return null;
  let totalRevenue = 0;
  let totalLanded = 0;

  for (const unit of group.units) {
    const unitPrice = parseFloat(unit.row[colMap.price] || 0);
    const currency = String(unit.row[colMap.currency] || "USD").trim();
    const landed = calcLandedCost(unitPrice, currency, 1, shippingAED / group.units.length, dutyPct);
    const sell = gradeAdjustedPrice(sellPrice, unit.grade);
    totalRevenue += sell;
    totalLanded += landed;
  }

  const profit = totalRevenue - totalLanded;
  const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0;
  return { profit: Math.round(profit), revenue: Math.round(totalRevenue), landed: Math.round(totalLanded), margin };
}

// ── BUILD EXPORT WORKBOOK ─────────────────────────────────────────────────────

export function buildExportWorkbook(groups, filtered, viable, sellPrices, claudeResults, shippingAED, dutyPct, colMap, includeProfit) {
  const wb = XLSX.utils.book_new();

  const viableRows = viable.map(row => ({
    Brand: row._brand,
    Model: String(row[colMap.model] || ""),
    Serial: String(row[colMap.serial] || ""),
    Processor: row._proc?.label || String(row[colMap.processor] || ""),
    RAM: `${row._ram} GB`,
    Storage: normalizeStorage(String(row[colMap.storage] || "")).label,
    Grade: String(row[colMap.grade] || ""),
    "Grading Notes": String(row[colMap.gradingNotes] || ""),
    "Unit Price": row[colMap.price] || "",
    Currency: row[colMap.currency] || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(viableRows), "Viable Units");

  const groupRows = groups.map(g => {
    const profit = includeProfit && sellPrices[g.key]
      ? calcGroupProfit(g, sellPrices[g.key], shippingAED, dutyPct, colMap)
      : null;
    const claudeResult = claudeResults?.find(r => r.key === g.key);
    return {
      Brand: g.brand,
      Model: g.model,
      Processor: g.procLabel,
      "Base Spec": `${g.baseRam}GB / ${g.baseStorage}GB`,
      "Total Units": g.units.length,
      "Grade A": g.grades.A.length,
      "Grade B": g.grades.B.length,
      "Grade C": g.grades.C.length,
      "RAM Upgrades": g.ramUpgrades,
      "Storage Upgrades": g.storageUpgrades,
      "Issues": claudeResult ? claudeResult.issues.map(i => i.type).join(", ") : "",
      "Recommendation": claudeResult?.recommendation || "",
      ...(includeProfit ? {
        "Sell Price (AED)": sellPrices[g.key] || "",
        "Total Revenue (AED)": profit?.revenue || "",
        "Total Landed (AED)": profit?.landed || "",
        "Gross Profit (AED)": profit?.profit || "",
        "Margin %": profit ? `${profit.margin}%` : "",
      } : {}),
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupRows), "Grouped Summary");

  const filteredRows = filtered.map(row => ({
    Brand: row._brand || String(row[colMap.brand] || ""),
    Model: String(row[colMap.model] || ""),
    Processor: String(row[colMap.processor] || ""),
    "Filter Reason": row._filterReason || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredRows), "Filtered Out");

  return wb;
}

export function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename);
}
