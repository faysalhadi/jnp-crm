import React, { useState, useEffect } from "react";
import { PARK_REASONS } from "../../constants";
import { parkDeal } from "../../services/parkService";
import { dealTotal } from "../../utils/bulk";

/**
 * Parking a deal, not losing it. Five reasons as large tap targets; "Price too
 * high" demands the number he actually named, because that is the one fact that
 * makes the deal worth reviving later.
 */
export default function ParkSheet({ open, deal, onClose, onParked }) {
  const [reason, setReason]   = useState(null);
  const [offer, setOffer]     = useState("");
  const [note, setNote]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!open) return;
    setReason(null); setOffer(""); setNote(""); setSaving(false); setError("");
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
  const qty   = Number(deal?.quantity) > 0 ? Number(deal.quantity) : 1;
  const total = dealTotal(deal);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: 40, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />

        <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>👁 Park this deal</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>
          {title} · × {qty}{total ? ` @ ${Number(deal.unit_price).toLocaleString()}` : ""}
          {" — stays alive, out of your daily queue"}
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
              {r.label}
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
