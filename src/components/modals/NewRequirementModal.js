import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabase";
import { BRANDS } from "../../constants";
import { useAuth } from "../../context/AuthContext";
import { useStock } from "../../context/StockContext";
import { modelKey, buildStockPools, dealTotal } from "../../utils/bulk";
import { getHolds, placeHold } from "../../services/holdService";

const GREEN  = "#10B981";
const AMBER  = "#D97706";
const PURPLE = "#8B5CF6";

const input = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none",
  boxSizing: "border-box",
};
const label = { fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.6, marginBottom: 5 };

function Check({ children }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
      <span style={{ color: GREEN, fontWeight: 800, flexShrink: 0 }}>✓</span>
      <span>{children}</span>
    </div>
  );
}

export default function NewRequirementModal({ customer, open, onClose, onSaved }) {
  const { user } = useAuth();
  const { stock } = useStock();

  const [screen, setScreen] = useState(1);
  const [door, setDoor]     = useState(null);      // "A" | "B" | "C"
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);     // deal written, hold may have failed
  const [error, setError]   = useState("");
  const [warning, setWarning] = useState("");

  const [brand, setBrand]   = useState("");
  const [model, setModel]   = useState("");
  const [qty, setQty]       = useState("1");

  const [unitPrice, setUnitPrice] = useState("");
  const [wouldPay, setWouldPay]   = useState("");
  const [wantHold, setWantHold]   = useState(false);   // never pre-checked

  const [holds, setHolds] = useState([]);

  useEffect(() => {
    if (!open) return;
    setScreen(1); setDoor(null); setSaving(false); setSaved(false);
    setError(""); setWarning("");
    setBrand(""); setModel(""); setQty("1");
    setUnitPrice(""); setWouldPay(""); setWantHold(false);
  }, [open, customer?.id]);

  const key = useMemo(() => modelKey(brand, model), [brand, model]);

  const loadHolds = useCallback(async () => {
    if (!key) { setHolds([]); return; }
    const res = await getHolds([key]);
    setHolds(res.holds || []);
  }, [key]);

  useEffect(() => { if (open) loadHolds(); }, [open, loadHolds]);

  const pool = useMemo(() => {
    if (!key) return null;
    return buildStockPools(stock, holds).find(p => p.key === key) || null;
  }, [key, stock, holds]);

  const wanted = Math.max(1, parseInt(qty, 10) || 1);
  const free   = pool ? pool.free : 0;

  // Only the doors that make sense. No "allocate all" when there is nothing.
  const doors = free >= wanted ? ["A", "C"] : free > 0 ? ["B", "C"] : ["C"];
  const splitHave = Math.min(free, wanted);
  const splitNeed = Math.max(0, wanted - free);

  const step1Valid = brand.trim() !== "" && model.trim() !== "";

  function goNext() {
    if (!step1Valid) {
      setError("Without brand and model we can't match this when stock arrives.");
      return;
    }
    setError("");
    // Nothing free means there is only one real answer — don't make them pick it.
    if (free === 0) setDoor("C");
    setScreen(2);
  }

  // ── writes ────────────────────────────────────────────────────────────────
  const unitNum  = unitPrice === "" ? null : Number(unitPrice);
  const payNum   = wouldPay === ""  ? null : Number(wouldPay);
  const priceOk  = unitPrice !== "" && Number.isFinite(unitNum) && unitNum > 0;
  const livePreview = dealTotal({ quantity: wanted, unit_price: unitNum });

  const canSave =
    door === "A" ? priceOk :
    door === "B" ? (unitPrice === "" || (Number.isFinite(unitNum) && unitNum > 0)) :
    door === "C" ? (wouldPay === "" || (Number.isFinite(payNum) && payNum > 0)) :
    false;

  async function save() {
    setError(""); setWarning("");
    if (door === "A" && !priceOk) { setError("Enter the unit price you quoted."); return; }
    if (!canSave) { setError("That price must be a number."); return; }
    setSaving(true);

    const now = new Date().toISOString();
    const base = {
      customer_id: customer.id,
      brand:       brand.trim(),
      model:       model.trim(),
      quantity:    wanted,
      created_by:  user?.id || null,
    };

    const fields =
      door === "A" ? { ...base, stage: "device_found", unit_price: unitNum, value: unitNum }
    : door === "B" ? { ...base, stage: "sourcing", sourcing_started_at: now,
                       ...(unitNum ? { unit_price: unitNum, value: unitNum } : {}) }
    :                { ...base, stage: "sourcing", sourcing_started_at: now,
                       ...(payNum ? { target_unit_price: payNum } : {}) };

    const { data: deal, error: dealErr } = await supabase
      .from("deals").insert(fields).select().single();
    if (dealErr || !deal) {
      setSaving(false);
      setError(dealErr?.message || "Could not save the requirement.");
      return;
    }

    // Manual hold only, and only for the portion actually in stock.
    let holdFailed = null;
    if (wantHold && (door === "A" || door === "B")) {
      const holdQty = door === "A" ? wanted : splitHave;
      const res = await placeHold({
        brand: base.brand, model: base.model, quantity: holdQty,
        dealId: deal.id, customerId: customer.id, hours: 48,
      });
      if (!res.ok) {
        holdFailed = res.insufficient
          ? `Only ${res.free} free right now — nothing was held.`
          : (res.error || "The hold could not be placed.");
      }
    }

    const what = `${base.brand} ${base.model} × ${wanted}`;
    const note =
      door === "A" ? `Requirement: ${what} — allocated from stock, quoted AED ${unitNum.toLocaleString()}/unit`
    : door === "B" ? `Requirement: ${what} — ${splitHave} allocated from stock, ${splitNeed} to source`
                     + (unitNum ? `, quoted AED ${unitNum.toLocaleString()}/unit` : "")
    :                `Requirement: ${what} — none in stock, sourcing`
                     + (payNum ? ` · would pay AED ${payNum.toLocaleString()}/unit` : "");

    await supabase.from("activity_log").insert({
      customer_id: customer.id, activity_type: "note", note, logged_at: now,
    });
    await supabase.from("customers")
      .update({ last_activity_at: now, last_active: now }).eq("id", customer.id);

    // Door C is tracked by the sourcing clock in the queue, not by a follow-up.
    if (door === "A" || door === "B") {
      await supabase.from("follow_ups").insert({
        customer_id: customer.id,
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        note: `Follow up on ${what}`,
        status: "pending",
      });
    }

    setSaving(false);
    if (holdFailed) {
      // The requirement is recorded either way — say plainly what did not happen.
      setSaved(true);
      setWarning(`Requirement saved. ${holdFailed}`);
      onSaved && onSaved();
      return;
    }
    onSaved && onSaved();
    onClose && onClose();
  }

  if (!open) return null;

  const doorMeta = {
    A: { color: GREEN,  title: `Allocate all ${wanted}`,                    sub: "You have them — quote from stock" },
    B: { color: AMBER,  title: `Allocate ${splitHave}, source ${splitNeed}`, sub: "Part from stock, rest to find" },
    C: { color: PURPLE, title: "Not in stock — go looking",                 sub: "Starts the sourcing clock" },
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, marginTop: "auto" }}>

          {/* ── header ── */}
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F1F5F9" }}>
            {screen === 2 && (
              <button onClick={() => { setScreen(1); setDoor(null); setError(""); setWarning(""); }}
                style={{ background: "none", border: "none", padding: 0, color: "#6366F1", fontSize: 12, cursor: "pointer" }}>
                ← Back
              </button>
            )}
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: screen === 2 ? 6 : 0 }}>
              + New requirement
            </div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{customer?.name || "Client"}</div>
          </div>

          {/* ── SCREEN 1 ── */}
          {screen === 1 && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={label}>BRAND — REQUIRED</div>
                <input value={brand} onChange={e => { setBrand(e.target.value); setError(""); }}
                  placeholder="e.g. Dell" style={input} />
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                  {BRANDS.filter(b => b !== "Other").map(b => (
                    <button key={b} onClick={() => { setBrand(b); setError(""); }}
                      style={{
                        padding: "3px 10px", borderRadius: 14, cursor: "pointer", fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${brand === b ? "#6366F1" : "#E2E8F0"}`,
                        background: brand === b ? "#EEF2FF" : "#fff",
                        color: brand === b ? "#6366F1" : "#94A3B8",
                      }}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={label}>MODEL — REQUIRED</div>
                <input value={model} onChange={e => { setModel(e.target.value); setError(""); }}
                  placeholder="e.g. Latitude 7490" style={input} />
              </div>

              <div>
                <div style={label}>QUANTITY</div>
                <input type="number" inputMode="numeric" min={1} value={qty}
                  onChange={e => setQty(e.target.value)} style={{ ...input, fontWeight: 700 }} />
              </div>

              {/* live pool read-out */}
              {key && (
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: "1px solid #F1F5F9", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                  {pool ? (
                    <>
                      <span style={{ color: "#64748B" }}>You have </span>
                      <span style={{ color: GREEN, fontWeight: 800 }}>{pool.free} free</span>
                      <span style={{ color: "#94A3B8" }}> · {pool.held} held · {pool.sold} sold</span>
                    </>
                  ) : (
                    <span style={{ color: "#94A3B8" }}>None in stock</span>
                  )}
                </div>
              )}

              {error && (
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
                  {error}
                </div>
              )}

              <button onClick={goNext} disabled={!step1Valid}
                style={{
                  padding: 13, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800,
                  cursor: step1Valid ? "pointer" : "not-allowed",
                  background: step1Valid ? "#6366F1" : "#E2E8F0",
                  color: step1Valid ? "#fff" : "#94A3B8",
                }}>
                Next
              </button>
              <button onClick={onClose}
                style={{ padding: 10, borderRadius: 12, border: "none", background: "none", color: "#CBD5E1", fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          )}

          {/* ── SCREEN 2 ── */}
          {screen === 2 && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                They want {wanted} · you have {free} free
              </div>

              {/* doors */}
              {!door && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {doors.map(d => (
                    <button key={d} onClick={() => { setDoor(d); setError(""); }}
                      style={{
                        padding: "14px 16px", borderRadius: 14, textAlign: "left", cursor: "pointer",
                        border: `2px solid ${doorMeta[d].color}`, background: "#fff",
                      }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: doorMeta[d].color }}>{doorMeta[d].title}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{doorMeta[d].sub}</div>
                    </button>
                  ))}
                </div>
              )}

              {door && (
                <>
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1.5px solid ${doorMeta[door].color}` }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: doorMeta[door].color }}>{doorMeta[door].title}</div>
                    {doors.length > 1 && (
                      <button onClick={() => { setDoor(null); setError(""); }}
                        style={{ background: "none", border: "none", padding: 0, marginTop: 4, color: "#94A3B8", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                        choose differently
                      </button>
                    )}
                  </div>

                  {/* A + B: price and the manual hold */}
                  {(door === "A" || door === "B") && (
                    <>
                      <div>
                        <div style={label}>UNIT PRICE (AED){door === "B" ? " — OPTIONAL" : " — REQUIRED"}</div>
                        <input type="number" inputMode="numeric" value={unitPrice}
                          onChange={e => { setUnitPrice(e.target.value); setError(""); }}
                          placeholder="per unit" style={{ ...input, fontWeight: 700 }} />
                        {livePreview > 0 && (
                          <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                            {wanted} × {unitNum.toLocaleString()} = AED {livePreview.toLocaleString()}
                          </div>
                        )}
                      </div>

                      {door === "A" && wanted > free * 0.5 && (
                        <div style={{ padding: "8px 10px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 11, color: AMBER, fontWeight: 700 }}>
                          You're quoting {wanted} of {free} free. Worth holding.
                        </div>
                      )}

                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
                        <input type="checkbox" checked={wantHold} onChange={e => setWantHold(e.target.checked)}
                          style={{ width: 18, height: 18, cursor: "pointer" }} />
                        <span style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
                          Hold {door === "A" ? wanted : splitHave} unit{(door === "A" ? wanted : splitHave) !== 1 ? "s" : ""} for 48h
                        </span>
                      </label>
                    </>
                  )}

                  {/* C: what would he pay */}
                  {door === "C" && (
                    <div>
                      <div style={label}>WHAT WOULD HE PAY PER UNIT (AED) — OPTIONAL</div>
                      <input type="number" inputMode="numeric" value={wouldPay}
                        onChange={e => { setWouldPay(e.target.value); setError(""); }}
                        placeholder="per unit" style={{ ...input, fontWeight: 700 }} />
                    </div>
                  )}

                  {/* summary */}
                  <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 6 }}>
                    <Check>{brand.trim()} {model.trim()} × {wanted} recorded for {customer?.name || "this client"}</Check>
                    {door === "A" && <Check>Stage → found</Check>}
                    {door === "B" && <Check>Stage → sourcing — {splitHave} from stock, {splitNeed} to find</Check>}
                    {door === "C" && <Check>Stage → sourcing — starts the two-day clock</Check>}
                    {wantHold && (door === "A" || door === "B")
                      ? <Check>{door === "A" ? wanted : splitHave} units held 48h — visible to everyone</Check>
                      : (door === "A" || door === "B") ? <Check>No hold placed</Check> : null}
                    {(door === "A" || door === "B")
                      ? <Check>24h follow-up created</Check>
                      : <Check>No follow-up — the sourcing clock tracks this</Check>}
                  </div>

                  {warning && (
                    <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 12, color: AMBER, fontWeight: 600 }}>
                      {warning}
                    </div>
                  )}
                  {error && (
                    <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
                      {error}
                    </div>
                  )}

                  {saved ? (
                    <button onClick={onClose}
                      style={{ padding: 13, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", background: "#6366F1", color: "#fff" }}>
                      Done
                    </button>
                  ) : (
                    <button onClick={save} disabled={saving || !canSave}
                      style={{
                        padding: 13, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800,
                        cursor: saving || !canSave ? "not-allowed" : "pointer",
                        background: saving || !canSave ? "#E2E8F0" : doorMeta[door].color,
                        color: saving || !canSave ? "#94A3B8" : "#fff",
                      }}>
                      {saving ? "Saving…" : "Record it"}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
