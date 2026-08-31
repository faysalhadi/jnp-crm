import React, { useState, useEffect } from "react";
import { PARK_REASONS } from "../../constants";
import { parkDeal } from "../../services/parkService";
import { getHoldsForDeal } from "../../services/holdService";
import { dealQty } from "../../utils/bulk";

const REASON_ICON = {
  price_too_high:   "💰",
  not_sourced:      "🔍",
  bought_elsewhere: "🏃",
  went_quiet:       "🤐",
  not_needed_now:   "📅",
};

function Check({ children }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
      <span style={{ color: "#10B981", fontWeight: 800, flexShrink: 0 }}>✓</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Parking a deal, not losing it. Five reasons as large tap targets; "Price too
 * high" demands the number he actually named, because that is the one fact that
 * makes the deal worth reviving later.
 */
export default function ParkSheet({ open, deal, customer, onClose, onParked }) {
  const [reason, setReason]   = useState(null);
  const [offer, setOffer]     = useState("");
  const [note, setNote]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [heldUnits, setHeldUnits] = useState(0);

  useEffect(() => {
    if (!open) return;
    setReason(null); setOffer(""); setNote(""); setSaving(false); setError("");
    setHeldUnits(0);
    let cancelled = false;
    // Only promise units back to free when a hold actually exists.
    getHoldsForDeal(deal?.id).then(res => {
      if (cancelled) return;
      setHeldUnits((res.holds || []).reduce((a, h) => a + (Number(h.quantity) || 0), 0));
    });
    return () => { cancelled = true; };
  }, [open, deal?.id]);

  if (!open) return null;

  const needsOffer = reason === "price_too_high";
  const offerNum   = offer === "" ? null : Number(offer);
  const offerValid = !needsOffer || (offer !== "" && Number.isFinite(offerNum) && offerNum > 0);
  const canSave    = !!reason && offerValid && !saving;

  async function save() {
    if (!reason) { setError("Pick a reason."); return; }
    if (needsOffer && !offerValid) {
      setError("Enter what he offered per unit — that number is why this is worth reviving.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await parkDeal(deal?.id, {
      reason,
      targetUnitPrice: needsOffer ? offerNum : undefined,
      note: note.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error || "Could not park this deal."); return; }
    onParked && onParked();
    onClose && onClose();
  }

  const title = [deal?.brand, deal?.model].filter(Boolean).join(" ") || "This deal";
  const qty   = dealQty(deal);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: 40, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />

        <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>Park this one</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>
          {customer?.name ? `${customer.name} · ` : ""}{title} × {qty}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {PARK_REASONS.map(r => (
            <button key={r.id} onClick={() => { setReason(r.id); setError(""); }}
              style={{
                padding: "14px 16px", borderRadius: 12, border: "none", textAlign: "left",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                background: reason === r.id ? "#EEF2FF" : "#F8FAFC",
                color:      reason === r.id ? "#6366F1" : "#374151",
                outline:    reason === r.id ? "2px solid #6366F1" : "2px solid transparent",
                transition: "all 0.15s",
              }}>
              {REASON_ICON[r.id] ? `${REASON_ICON[r.id]}  ` : ""}{r.label}
            </button>
          ))}
        </div>

        {needsOffer && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.6, marginBottom: 5 }}>
              WHAT DID HE OFFER (PER UNIT) — REQUIRED
            </div>
            <input
              autoFocus type="number" inputMode="numeric" value={offer}
              onChange={e => { setOffer(e.target.value); setError(""); }}
              placeholder="AED per unit"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
          </div>
        )}

        {reason && (
          <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            <Check>Leaves the queue · follow-up closed</Check>
            {heldUnits > 0 && <Check>{heldUnits} unit{heldUnits !== 1 ? "s" : ""} released back to free</Check>}
            <Check>Joins {title} parked demand</Check>
            <Check>Comes back when stock lands or his price clears</Check>
          </div>
        )}

        <textarea
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="Note (optional)" rows={2}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", marginBottom: 14 }} />

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#EF4444", fontWeight: 600, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={save} disabled={!canSave}
            style={{
              width: "100%", padding: 13, borderRadius: 12, border: "none",
              background: canSave ? "#6366F1" : "#E2E8F0",
              color: canSave ? "#fff" : "#94A3B8",
              fontWeight: 800, fontSize: 14, cursor: canSave ? "pointer" : "default",
            }}>
            {saving ? "Parking…" : "👁 Park it"}
          </button>
          <button onClick={onClose}
            style={{ width: "100%", padding: 10, borderRadius: 12, border: "none", background: "none", color: "#CBD5E1", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
