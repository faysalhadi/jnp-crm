// Bulk foundation: quantity, model pools, computed hold expiry.
//
// Pure helpers only — no React, no supabase. Every function must survive a null
// row and a row whose new columns do not exist yet.

// Punctuation that carries no meaning in a model name. Replaced with a space
// rather than deleted, so "840-G8" and "840 G8" normalise to the same key
// instead of drifting apart into "840g8" and "840 g8".
const PUNCT = /[/\-,"']+/g;

export function modelKey(brand, model) {
  const clean = (v) => String(v ?? "")
    .toLowerCase()
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
  const b = clean(brand);
  const m = clean(model);
  if (!b || !m) return null;   // unlabelled rows can never be pooled
  return `${b}|${m}`;
}

// The only correct way to read a deal's money. `value` is legacy: it holds a
// single-unit total and says nothing about how many units were involved.
// Number(null) is 0 and Number("") is 0, so "missing" has to be tested before
// coercion — otherwise a NULL unit_price reads as a real price of zero and the
// fallback below never fires.
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function dealQty(deal) {
  const q = numOrNull(deal?.quantity);
  return q !== null && q > 0 ? q : 1;
}

export function dealUnitPrice(deal) {
  const unit = numOrNull(deal?.unit_price);
  if (unit !== null) return unit;
  // Legacy row, or the step-1 backfill has not run: `value` held a single-unit
  // total, so it is the unit price. Without this every total reads 0 pre-SQL.
  const v = numOrNull(deal?.value);
  return v !== null ? v : 0;
}

export function dealTotal(deal) {
  if (!deal) return 0;
  return dealUnitPrice(deal) * dealQty(deal);
}

// "× 50 @ 850" — the quantity and unit price that a bare total must never hide.
export function dealUnitLine(deal) {
  const unit = dealUnitPrice(deal);
  const qty  = dealQty(deal);
  if (!unit) return qty > 1 ? `× ${qty}` : "";
  return `× ${qty} @ ${unit.toLocaleString()}`;
}

// "AED 42,500 total"
export function dealTotalLine(deal) {
  const t = dealTotal(deal);
  return t ? `AED ${t.toLocaleString()} total` : "";
}

// Quantity on a row, defaulting to 1 — older per-unit rows have no column yet.
function rowQty(row) {
  const q = Number(row?.quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

export function isHoldActive(hold) {
  if (!hold) return false;
  if (hold.released_at) return false;
  if (!hold.expires_at) return false;
  const t = new Date(hold.expires_at).getTime();
  return Number.isFinite(t) && t > Date.now();
}

export function holdRemaining(hold) {
  if (!isHoldActive(hold)) return "";
  const ms = new Date(hold.expires_at).getTime() - Date.now();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h left`;
}

/**
 * Group stock rows into per-model pools. Some rows are quantity 1 (older
 * per-unit entries) and some are quantity 50 — summing handles both, and
 * nothing is consolidated or rewritten on disk.
 */
export function buildStockPools(stockRows, holds) {
  const heldByKey = new Map();
  (holds || []).filter(isHoldActive).forEach(h => {
    const q = Number(h.quantity);
    if (!h.model_key || !Number.isFinite(q) || q <= 0) return;
    heldByKey.set(h.model_key, (heldByKey.get(h.model_key) || 0) + q);
  });

  const pools = new Map();

  (stockRows || []).forEach(row => {
    const key = modelKey(row?.brand, row?.model);
    if (!key) return;

    if (!pools.has(key)) {
      pools.set(key, {
        key,
        brand: row.brand, model: row.model,
        label: [row.brand, row.model].filter(Boolean).join(" ").trim(),
        total: 0, held: 0, sold: 0, free: 0,
        minPrice: null, maxPrice: null,
        rows: [],
      });
    }
    const p = pools.get(key);
    const q = rowQty(row);

    p.total += q;
    if (row.status === "sold") p.sold += q;
    p.rows.push(row);

    const floor = Number(row.min_price ?? row.max_price);
    const ceil  = Number(row.max_price ?? row.min_price);
    if (Number.isFinite(floor)) p.minPrice = p.minPrice === null ? floor : Math.min(p.minPrice, floor);
    if (Number.isFinite(ceil))  p.maxPrice = p.maxPrice === null ? ceil  : Math.max(p.maxPrice, ceil);
  });

  return [...pools.values()].map(p => {
    p.held = heldByKey.get(p.key) || 0;
    // A sold unit is not free either, so it comes off alongside held stock.
    // Clamped at zero: an over-hold must never render as negative supply.
    p.free = Math.max(0, p.total - p.sold - p.held);
    return p;
  }).sort((a, b) => b.free - a.free || a.label.localeCompare(b.label));
}

/**
 * Faisal loses the customer after about two days of sourcing. These thresholds
 * encode that, so the queue can shout before the deal goes cold.
 */
export function sourcingAge(deal) {
  const ts = deal?.sourcing_started_at;
  if (!ts) return { hours: null, level: "ok" };
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return { hours: null, level: "ok" };
  const hours = Math.max(0, Math.floor((Date.now() - t) / 3600000));
  const level = hours >= 48 ? "late" : hours >= 24 ? "warn" : "ok";
  return { hours, level };
}

// Chip text for the queue's SOURCING section.
export function sourcingLabel(deal) {
  const { hours, level } = sourcingAge(deal);
  if (hours === null) return { text: "sourcing", level };
  if (level === "late") return { text: "day 2 — closing out", level };
  if (level === "warn") return { text: "day 1", level };
  return { text: "today", level };
}
