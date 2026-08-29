import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabase";
import Spinner from "../ui/Spinner";
import { BRANDS } from "../../constants";
import { effectiveStatus, isHoldActive, formatHoldRemaining } from "../../utils/holds";
import { placeHold, getHolderName } from "../../services/stockHoldService";
import { useAuth } from "../../context/AuthContext";
import { useProfile } from "../../context/ProfileContext";

const GREEN  = "#10B981";
const PURPLE = "#8B5CF6";
const AMBER  = "#D97706";

const sheetInput = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none",
  boxSizing: "border-box",
};

const label = {
  fontSize: 10, fontWeight: 800, color: "#94A3B8",
  letterSpacing: 0.6, marginBottom: 5,
};

function SummaryLine({ children }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
      <span style={{ color: GREEN, fontWeight: 800, flexShrink: 0 }}>✓</span>
      <span>{children}</span>
    </div>
  );
}

export default function DealForkModal({ customer, deal, open, onClose, onSaved }) {
  const { user } = useAuth();
  const { isOwner } = useProfile();

  const [screen, setScreen] = useState(1);     // 1 | "yes" | "not_yet"
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // YES side
  const [units,       setUnits]       = useState([]);
  const [unitsLoading,setUnitsLoading]= useState(true);
  const [holderNames, setHolderNames] = useState({});
  const [search,      setSearch]      = useState("");
  const [selectedId,  setSelectedId]  = useState(null);
  const [heldWarning, setHeldWarning] = useState(null);   // stock id we warned about
  const [overrideId,  setOverrideId]  = useState(null);   // owner override confirm
  const [quoted,      setQuoted]      = useState("");
  const [offered,     setOffered]     = useState("");
  const [conflict,    setConflict]    = useState(null);

  // NOT YET side
  const [brand,   setBrand]   = useState("");
  const [model,   setModel]   = useState("");
  const [wouldPay,setWouldPay]= useState("");

  const myId = user?.id || null;

  // Reset every time the sheet opens — never carry one client's answer to the next.
  useEffect(() => {
    if (!open) return;
    setScreen(1); setSaving(false); setError("");
    setSearch(""); setSelectedId(null); setHeldWarning(null); setOverrideId(null);
    setQuoted(""); setOffered(""); setConflict(null);
    setBrand(deal?.brand || ""); setModel(deal?.model || ""); setWouldPay("");
  }, [open, customer?.id]); // eslint-disable-line

  const loadUnits = useCallback(async () => {
    setUnitsLoading(true);
    // 'quoted' rows come back too — an expired one reads as available, and a
    // live one has to be shown greyed rather than silently hidden.
    const { data } = await supabase
      .from("stock").select("*")
      .in("status", ["available", "quoted"])
      .order("brand", { ascending: true });
    setUnits(data || []);
    setUnitsLoading(false);
  }, []);

  useEffect(() => { if (open) loadUnits(); }, [open, loadUnits]);

  // Resolve holder names once per user id — getHolderName caches across rows.
  useEffect(() => {
    const ids = [...new Set(units.filter(isHoldActive).map(u => u.quoted_by).filter(Boolean))]
      .filter(id => !(id in holderNames));
    if (!ids.length) return;
    let cancelled = false;
    Promise.all(ids.map(id => getHolderName(id).then(n => [id, n]))).then(pairs => {
      if (!cancelled) setHolderNames(p => ({ ...p, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [units]); // eslint-disable-line

  const visibleUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units
      .filter(u => effectiveStatus(u) === "available" || isHoldActive(u))
      .filter(u => !q || [u.brand, u.model, u.processor, u.ram, u.ssd, u.condition]
        .filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [units, search]);

  const selected = units.find(u => u.id === selectedId) || null;

  function heldByOther(unit) {
    return isHoldActive(unit) && unit.quoted_by && unit.quoted_by !== myId;
  }

  function pickUnit(unit) {
    setError("");
    if (heldByOther(unit)) {
      if (!isOwner)          { setHeldWarning(unit.id); return; }
      if (overrideId !== unit.id) { setOverrideId(unit.id); setHeldWarning(unit.id); return; }
    }
    setHeldWarning(null);
    setSelectedId(prev => (prev === unit.id ? null : unit.id));
  }

  // ── shared deal write ──────────────────────────────────────────────────────
  // Reuses the stub deal the client was created with rather than stacking a
  // second empty one next to it.
  const reusableDeal = deal && deal.stage === "new_inquiry" ? deal : null;

  // Exactly the fields the fork overwrites, snapshotted so a refused hold can
  // put a reused deal back the way it was.
  function snapshotOf(d) {
    return {
      stage:         d.stage ?? null,
      stock_item_id: d.stock_item_id ?? null,
      brand:         d.brand ?? null,
      model:         d.model ?? null,
      value:         d.value ?? null,
      target_price:  d.target_price ?? null,
      parked_reason: d.parked_reason ?? null,
      parked_at:     d.parked_at ?? null,
    };
  }

  async function writeDeal(fields) {
    if (reusableDeal?.id) {
      const { error: e } = await supabase.from("deals").update(fields).eq("id", reusableDeal.id);
      if (e) return { id: null, created: false, error: e.message };
      return { id: reusableDeal.id, created: false };
    }
    const { data, error: e } = await supabase
      .from("deals").insert({ customer_id: customer.id, ...fields }).select().single();
    if (e || !data) return { id: null, created: false, error: e?.message || "Could not save the deal." };
    return { id: data.id, created: true };
  }

  async function logNote(note) {
    const now = new Date().toISOString();
    await supabase.from("activity_log").insert({
      customer_id: customer.id, activity_type: "note", note, logged_at: now,
    });
    await supabase.from("customers")
      .update({ last_activity_at: now, last_active: now }).eq("id", customer.id);
  }

  // ── YES ────────────────────────────────────────────────────────────────────
  const quotedNum  = Number(quoted);
  const offeredNum = offered === "" ? null : Number(offered);
  const yesValid   = !!selected && quoted !== "" && Number.isFinite(quotedNum) && quotedNum > 0;

  async function saveYes() {
    setError(""); setConflict(null);
    if (!selected)                     { setError("Pick the unit you quoted."); return; }
    if (!yesValid)                     { setError("Enter the price you quoted."); return; }
    if (offered !== "" && !Number.isFinite(offeredNum)) { setError("His offer must be a number."); return; }
    setSaving(true);

    const dealRes = await writeDeal({
      stage:          "negotiation",
      stock_item_id:  selected.id,
      brand:          selected.brand || null,
      model:          selected.model || null,
      value:          quotedNum,
      target_price:   offeredNum,
      created_by:     myId,
      parked_reason:  null,
      parked_at:      null,
    });
    if (!dealRes.id) { setSaving(false); setError(dealRes.error || "Could not save the deal."); return; }

    const hold = await placeHold(selected.id, { customerId: customer.id, dealId: dealRes.id });
    if (!hold.ok) {
      // Nothing gets saved behind a refused hold — undo the deal write.
      if (dealRes.created) {
        await supabase.from("deals").delete().eq("id", dealRes.id);
      } else if (reusableDeal) {
        await supabase.from("deals").update(snapshotOf(reusableDeal)).eq("id", dealRes.id);
      }
      setSaving(false);
      await loadUnits();
      if (hold.conflict) setConflict(hold);
      else setError(hold.error || "Could not hold that unit.");
      return;
    }

    const unitLabel = [selected.brand, selected.model].filter(Boolean).join(" ") || "unit";
    await logNote(
      `Quoted AED ${quotedNum.toLocaleString()}` +
      (offeredNum ? ` · offered AED ${offeredNum.toLocaleString()}` : "") +
      ` — ${unitLabel}`
    );

    const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await supabase.from("follow_ups").insert({
      customer_id: customer.id,
      due_at:      due.toISOString(),
      note:        `Follow up on AED ${quotedNum.toLocaleString()} quote — ${unitLabel}`,
      status:      "pending",
    });

    setSaving(false);
    onSaved && onSaved();
    onClose && onClose();
  }

  // ── NOT YET ────────────────────────────────────────────────────────────────
  const wouldPayNum = wouldPay === "" ? null : Number(wouldPay);
  const notYetValid = brand.trim() !== "" && model.trim() !== "";

  async function saveNotYet() {
    setError("");
    if (!notYetValid) {
      setError("Without brand and model we can't match this when stock arrives.");
      return;
    }
    if (wouldPay !== "" && !Number.isFinite(wouldPayNum)) { setError("That price must be a number."); return; }
    setSaving(true);

    const dealRes = await writeDeal({
      stage:         "watching",
      parked_reason: "no_stock",
      parked_at:     new Date().toISOString(),
      brand:         brand.trim(),
      model:         model.trim(),
      target_price:  wouldPayNum,
      created_by:    myId,
      stock_item_id: null,
    });
    if (!dealRes.id) { setSaving(false); setError(dealRes.error || "Could not save the requirement."); return; }

    await logNote(`Requirement recorded: ${brand.trim()} ${model.trim()}`);

    setSaving(false);
    onSaved && onSaved();
    onClose && onClose();
  }

  if (!open) return null;

  const shellStyle = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    zIndex: 400, overflowY: "auto",
  };
  const sheetStyle = {
    background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480,
    marginTop: "auto",
  };

  return (
    <div style={shellStyle}>
      <div style={{ minHeight: "100%", padding: "16px 12px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={sheetStyle}>

          {/* ── SCREEN 1 — the fork. No dismiss: this question is unskippable. ── */}
          {screen === 1 && (
            <div style={{ padding: "28px 20px 24px" }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A" }}>Do we have it?</div>
                <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>{customer?.name || "This client"}</div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setError(""); setScreen("yes"); }}
                  style={{
                    flex: 1, minHeight: 90, padding: "14px 10px", borderRadius: 16, cursor: "pointer",
                    border: `2px solid ${GREEN}`, background: "#ECFDF5", color: GREEN,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                  }}>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>✅ YES</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Pick the unit</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>48h hold starts</span>
                </button>

                <button onClick={() => { setError(""); setScreen("not_yet"); }}
                  style={{
                    flex: 1, minHeight: 90, padding: "14px 10px", borderRadius: 16, cursor: "pointer",
                    border: `2px solid ${PURPLE}`, background: "#F5F3FF", color: PURPLE,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                  }}>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>👁 NOT YET</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Record the want</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>Matches on arrival</span>
                </button>
              </div>
            </div>
          )}

          {/* ── SCREEN 2A — YES ── */}
          {screen === "yes" && (
            <div>
              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F1F5F9" }}>
                <button onClick={() => { setScreen(1); setError(""); setConflict(null); }}
                  style={{ background: "none", border: "none", padding: 0, color: "#6366F1", fontSize: 12, cursor: "pointer" }}>
                  ← Back
                </button>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>✅ We have it</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{customer?.name || "Client"}</div>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

                {/* 1. UNIT PICKER */}
                <div>
                  <div style={label}>WHICH UNIT</div>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="🔍 Search brand or model…" style={{ ...sheetInput, fontSize: 13, marginBottom: 8 }} />
                  {unitsLoading ? <Spinner /> : (
                    <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {visibleUnits.length === 0 && (
                        <div style={{ textAlign: "center", padding: "20px 0", color: "#CBD5E1", fontSize: 13 }}>
                          {search ? "No matches" : "No available units"}
                        </div>
                      )}
                      {visibleUnits.map(u => {
                        const held    = heldByOther(u);
                        const sel     = u.id === selectedId;
                        const specs   = [u.processor, u.ram, u.ssd, u.condition].filter(Boolean).join(" · ");
                        const holder  = holderNames[u.quoted_by] || "another agent";
                        return (
                          <div key={u.id}>
                            <div onClick={() => pickUnit(u)}
                              style={{
                                padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 10,
                                border: `1.5px solid ${sel ? "#6366F1" : held ? "#E2E8F0" : "#F1F5F9"}`,
                                background: sel ? "#EEF2FF" : held ? "#F8FAFC" : "#F8FAFC",
                                opacity: held && !sel ? 0.55 : 1,
                              }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                                  {[u.brand, u.model].filter(Boolean).join(" ") || "Unit"}
                                </div>
                                {specs && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{specs}</div>}
                                {held && (
                                  <div style={{ fontSize: 11, color: AMBER, fontWeight: 700, marginTop: 2 }}>
                                    ⏳ held by {holder} · {formatHoldRemaining(u)}
                                  </div>
                                )}
                              </div>
                              {u.max_price ? (
                                <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1", flexShrink: 0 }}>
                                  AED {Number(u.max_price).toLocaleString()}
                                </div>
                              ) : null}
                            </div>

                            {heldWarning === u.id && (
                              <div style={{ margin: "6px 0 2px", padding: "8px 10px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                                <div style={{ fontSize: 11, color: AMBER, fontWeight: 700 }}>
                                  {holder} quoted this unit — {formatHoldRemaining(u)} on the hold.
                                </div>
                                {isOwner ? (
                                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                    <button onClick={() => pickUnit(u)}
                                      style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: AMBER, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                      Override anyway
                                    </button>
                                    <button onClick={() => { setHeldWarning(null); setOverrideId(null); }}
                                      style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #FDE68A", background: "#fff", color: AMBER, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                      Leave it
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                                    Ask {holder} before quoting it, or pick another unit.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. YOU QUOTED */}
                <div>
                  <div style={label}>YOU QUOTED (AED)</div>
                  <input type="number" inputMode="numeric" value={quoted}
                    onChange={e => { setQuoted(e.target.value); setError(""); }}
                    placeholder="e.g. 1850" style={sheetInput} />
                </div>

                {/* 3. HE OFFERED */}
                <div>
                  <div style={label}>HE OFFERED (AED) — OPTIONAL</div>
                  <input type="number" inputMode="numeric" value={offered}
                    onChange={e => { setOffered(e.target.value); setError(""); }}
                    placeholder="what the client named" style={sheetInput} />
                </div>

                {/* SUMMARY */}
                <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 6 }}>
                  <SummaryLine>
                    {selected
                      ? <>{[selected.brand, selected.model].filter(Boolean).join(" ") || "Unit"} held 48h — visible to everyone</>
                      : <>Unit held 48h — visible to everyone</>}
                  </SummaryLine>
                  <SummaryLine>Stage → negotiation</SummaryLine>
                  <SummaryLine>24h follow-up created</SummaryLine>
                </div>

                {conflict && (
                  <div style={{ padding: "12px 14px", borderRadius: 12, background: "#FEF2F2", border: "1.5px solid #FECACA" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#EF4444" }}>
                      {conflict.heldBy} just took that unit
                    </div>
                    <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 3, lineHeight: 1.5 }}>
                      It is held until{" "}
                      {conflict.heldUntil
                        ? new Date(conflict.heldUntil).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "later today"}
                      . Nothing was saved — pick another unit, or talk to {conflict.heldBy}.
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
                    {error}
                  </div>
                )}

                <button onClick={saveYes} disabled={saving || !yesValid}
                  style={{
                    padding: 13, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800,
                    cursor: saving || !yesValid ? "not-allowed" : "pointer",
                    background: saving || !yesValid ? "#E2E8F0" : GREEN,
                    color: saving || !yesValid ? "#94A3B8" : "#fff",
                  }}>
                  {saving ? "Saving…" : "✅ Quote it — start 48h hold"}
                </button>
              </div>
            </div>
          )}

          {/* ── SCREEN 2B — NOT YET ── */}
          {screen === "not_yet" && (
            <div>
              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F1F5F9" }}>
                <button onClick={() => { setScreen(1); setError(""); }}
                  style={{ background: "none", border: "none", padding: 0, color: "#6366F1", fontSize: 12, cursor: "pointer" }}>
                  ← Back
                </button>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>👁 Not in stock yet</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{customer?.name || "Client"}</div>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={label}>BRAND — REQUIRED</div>
                  <select value={brand} onChange={e => { setBrand(e.target.value); setError(""); }} style={sheetInput}>
                    <option value="">Select brand</option>
                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div>
                  <div style={label}>MODEL — REQUIRED</div>
                  <input value={model} onChange={e => { setModel(e.target.value); setError(""); }}
                    placeholder="e.g. EliteBook 840 G8" style={sheetInput} />
                </div>

                <div>
                  <div style={label}>WHAT WOULD HE PAY (AED) — OPTIONAL</div>
                  <input type="number" inputMode="numeric" value={wouldPay}
                    onChange={e => { setWouldPay(e.target.value); setError(""); }}
                    placeholder="e.g. 1600" style={sheetInput} />
                </div>

                <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 6 }}>
                  <SummaryLine>Stage → watching — out of your daily queue</SummaryLine>
                  <SummaryLine>Joins the Requirements board</SummaryLine>
                  <SummaryLine>Alerts you the day one lands</SummaryLine>
                </div>

                {error && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
                    {error}
                  </div>
                )}

                <button onClick={saveNotYet} disabled={saving || !notYetValid}
                  style={{
                    padding: 13, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800,
                    cursor: saving || !notYetValid ? "not-allowed" : "pointer",
                    background: saving || !notYetValid ? "#E2E8F0" : PURPLE,
                    color: saving || !notYetValid ? "#94A3B8" : "#fff",
                  }}>
                  {saving ? "Saving…" : "👁 Record the requirement"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
