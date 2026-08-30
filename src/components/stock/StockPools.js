import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useStock } from "../../context/StockContext";
import { useCustomers } from "../../context/CustomerContext";
import { useProfile } from "../../context/ProfileContext";
import { useAuth } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import { modelKey, buildStockPools, holdRemaining, isHoldActive } from "../../utils/bulk";
import { getHolds, placeHold, releaseHold, getHolderName } from "../../services/holdService";

const AMBER = "#D97706";

// ── the three-segment supply bar ────────────────────────────────────────────
function PoolBar({ free, held, sold, total }) {
  const denom = total > 0 ? total : 1;
  const seg = (n, color) => n <= 0 ? null : (
    <div style={{ width: `${(n / denom) * 100}%`, background: color, height: "100%" }} />
  );
  return (
    <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 4, overflow: "hidden", background: "#F1F5F9" }}>
      {seg(free, "#10B981")}
      {seg(held, AMBER)}
      {seg(sold, "#CBD5E1")}
    </div>
  );
}

// ── manual hold sheet — nothing in this app opens it on its own ─────────────
function HoldSheet({ pool, onClose, onPlaced }) {
  const [qty, setQty]       = useState("");
  const [hours, setHours]   = useState(48);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const qtyNum = Number(qty);
  const valid  = Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum <= pool.free;

  async function confirm() {
    setError("");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) { setError("How many units?"); return; }
    if (qtyNum > pool.free) { setError(`Only ${pool.free} free right now.`); return; }
    setSaving(true);
    const res = await placeHold({ brand: pool.brand, model: pool.model, quantity: qtyNum, hours });
    setSaving(false);
    if (!res.ok) {
      setError(res.insufficient ? `Only ${res.free} free right now.` : (res.error || "Could not place the hold."));
      return;
    }
    onPlaced && onPlaced();
    onClose && onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: 40 }}>
        <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>⏳ Hold units</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>
          {pool.label} · {pool.free} free of {pool.total}
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.6, marginBottom: 5 }}>QUANTITY</div>
        <input autoFocus type="number" inputMode="numeric" min={1} max={pool.free} value={qty}
          onChange={e => { setQty(e.target.value); setError(""); }}
          placeholder={`up to ${pool.free}`}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box", marginBottom: 14 }} />

        <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.6, marginBottom: 5 }}>DURATION</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[24, 48, 72].map(h => (
            <button key={h} onClick={() => setHours(h)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${hours === h ? "#6366F1" : "#E2E8F0"}`,
                background: hours === h ? "#EEF2FF" : "#fff",
                color: hours === h ? "#6366F1" : "#64748B",
                fontSize: 13, fontWeight: 700,
              }}>
              {h}h
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#EF4444", fontWeight: 600, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button onClick={confirm} disabled={!valid || saving}
          style={{
            width: "100%", padding: 13, borderRadius: 12, border: "none",
            background: valid && !saving ? "#6366F1" : "#E2E8F0",
            color: valid && !saving ? "#fff" : "#94A3B8",
            fontWeight: 800, fontSize: 14, cursor: valid && !saving ? "pointer" : "default",
          }}>
          {saving ? "Holding…" : `Hold ${qtyNum > 0 ? qtyNum : ""} for ${hours}h`}
        </button>
        <button onClick={onClose}
          style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 12, border: "none", background: "none", color: "#CBD5E1", fontSize: 12, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── one model pool ──────────────────────────────────────────────────────────
function PoolCard({ pool, holds, holderNames, openQuotes, canRelease, onHold, onRelease }) {
  const quotedUnits = openQuotes.reduce((a, d) => a + (Number(d.quantity) > 0 ? Number(d.quantity) : 1), 0);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {pool.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {pool.total} unit{pool.total !== 1 ? "s" : ""}
        </span>
      </div>

      <PoolBar free={pool.free} held={pool.held} sold={pool.sold} total={pool.total} />

      <div style={{ fontSize: 11, color: "#64748B", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: "#10B981", fontWeight: 700 }}>{pool.free} free</span>
        {" · "}
        <span style={{ color: pool.held > 0 ? AMBER : "#94A3B8", fontWeight: pool.held > 0 ? 700 : 400 }}>{pool.held} held</span>
        {" · "}
        <span style={{ color: "#94A3B8" }}>{pool.sold} sold</span>
      </div>

      {/* Informational only — an open quote reserves nothing. */}
      {openQuotes.length > 0 && (
        <div style={{ fontSize: 11, color: AMBER, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "6px 9px" }}>
          ⚠ {openQuotes.length} open quote{openQuotes.length !== 1 ? "s" : ""} · {quotedUnits} units — no hold placed
        </div>
      )}

      {/* Active holds */}
      {holds.map(h => (
        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "6px 9px" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "#B45309" }}>
            <span style={{ fontWeight: 800, color: AMBER }}>{h.quantity} held</span>
            {" by "}{holderNames[h.held_by] || "someone"}
            {" · "}{holdRemaining(h)}
          </div>
          {canRelease(h) && (
            <button onClick={() => onRelease(h)}
              style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid #FDE68A", background: "#fff", color: AMBER, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              Release
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 11, color: "#94A3B8", fontVariantNumeric: "tabular-nums" }}>
          {pool.minPrice ? `Floor ${Number(pool.minPrice).toLocaleString()}/unit` : "No floor price set"}
        </span>
        <button onClick={() => onHold(pool)} disabled={pool.free <= 0}
          style={{
            padding: "7px 14px", borderRadius: 10, border: "none", flexShrink: 0,
            background: pool.free > 0 ? "#6366F1" : "#E2E8F0",
            color: pool.free > 0 ? "#fff" : "#94A3B8",
            fontSize: 12, fontWeight: 700, cursor: pool.free > 0 ? "pointer" : "default",
          }}>
          Hold units
        </button>
      </div>
    </div>
  );
}

// ── board ───────────────────────────────────────────────────────────────────
export default function StockPools() {
  const { stock } = useStock();
  const { customers } = useCustomers();
  const { isOwner } = useProfile();
  const { user } = useAuth();
  const { showToast } = useUI();

  const [holds, setHolds]             = useState([]);
  const [holderNames, setHolderNames] = useState({});
  const [holdTarget, setHoldTarget]   = useState(null);

  const keys = useMemo(
    () => [...new Set((stock || []).map(s => modelKey(s.brand, s.model)).filter(Boolean))],
    [stock]
  );

  const loadHolds = useCallback(async () => {
    if (!keys.length) { setHolds([]); return; }
    const res = await getHolds(keys);
    setHolds(res.holds || []);
  }, [keys]);

  useEffect(() => { loadHolds(); }, [loadHolds]);

  useEffect(() => {
    const ids = [...new Set(holds.map(h => h.held_by).filter(Boolean))]
      .filter(id => !(id in holderNames));
    if (!ids.length) return;
    let cancelled = false;
    Promise.all(ids.map(id => getHolderName(id).then(n => [id, n]))).then(pairs => {
      if (!cancelled) setHolderNames(p => ({ ...p, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [holds]); // eslint-disable-line

  const pools = useMemo(() => buildStockPools(stock, holds), [stock, holds]);

  // Open quotes = quoted deals with no hold behind them. Informational only.
  const quotesByKey = useMemo(() => {
    const map = new Map();
    const heldDealIds = new Set(holds.filter(isHoldActive).map(h => h.deal_id).filter(Boolean));
    (customers || []).forEach(c => (c.deals || []).forEach(d => {
      if (d.stage !== "device_found" && d.stage !== "negotiation") return;
      if (heldDealIds.has(d.id)) return;
      const k = modelKey(d.brand, d.model);
      if (!k) return;
      map.set(k, [...(map.get(k) || []), d]);
    }));
    return map;
  }, [customers, holds]);

  const holdsByKey = useMemo(() => {
    const map = new Map();
    holds.forEach(h => map.set(h.model_key, [...(map.get(h.model_key) || []), h]));
    return map;
  }, [holds]);

  const canRelease = (h) => isOwner || (user?.id && h.held_by === user.id);

  async function doRelease(h) {
    if (!window.confirm(`Release ${h.quantity} held unit${h.quantity !== 1 ? "s" : ""}?`)) return;
    const res = await releaseHold(h.id);
    if (!res.ok) { showToast("Could not release: " + (res.error || "unknown error")); return; }
    await loadHolds();
    showToast("Hold released 🔓");
  }

  if (!pools.length) return null;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#94A3B8", letterSpacing: 1.2, marginTop: 4 }}>
          POOLS
        </div>
        {pools.map(p => (
          <PoolCard
            key={p.key}
            pool={p}
            holds={holdsByKey.get(p.key) || []}
            holderNames={holderNames}
            openQuotes={quotesByKey.get(p.key) || []}
            canRelease={canRelease}
            onHold={setHoldTarget}
            onRelease={doRelease}
          />
        ))}
      </div>

      {holdTarget && (
        <HoldSheet
          pool={holdTarget}
          onClose={() => setHoldTarget(null)}
          onPlaced={() => { loadHolds(); showToast("Units held ⏳"); }}
        />
      )}
    </>
  );
}
