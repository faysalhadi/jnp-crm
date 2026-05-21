import React from "react";
import { supabase } from "../../supabase";
import { useReservations } from "../../context/ReservationsContext";
import { useStock } from "../../context/StockContext";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";

export default function EditReservationModal() {
  const {
    showEditReservation, setShowEditReservation,
    editReservationItem, setEditReservationItem,
    editReservationForm, setEditReservationForm,
    loadReservedDeals,
  } = useReservations();
  const { loadStock } = useStock();
  const { loadCustomers } = useCustomers();
  const { showToast } = useUI();

  if (!showEditReservation || !editReservationItem) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>✏️ Edit Reservation</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                {[editReservationItem.brand, editReservationItem.model].filter(Boolean).join(" ") || "Device"}
              </div>
            </div>
            <button onClick={() => setShowEditReservation(false)}
              style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "AGREED PRICE (AED)", key: "agreedPrice", type: "number" },
              { label: "PICKUP DATE", key: "pickupDate", type: "date" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                <input type={type} value={editReservationForm[key]}
                  onChange={e => setEditReservationForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>DEPOSIT PAID (AED)</div>
              <input type="number" value={editReservationForm.depositAmount}
                onChange={e => {
                  const dep = Number(e.target.value) || 0;
                  const bal = Math.max(0, (Number(editReservationForm.agreedPrice) || 0) - dep);
                  setEditReservationForm(f => ({ ...f, depositAmount: e.target.value, balanceDue: String(bal) }));
                }}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>BALANCE DUE (AED)</div>
              <input type="number" value={editReservationForm.balanceDue}
                onChange={e => setEditReservationForm(f => ({ ...f, balanceDue: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES</div>
              <input value={editReservationForm.notes}
                onChange={e => setEditReservationForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Client confirmed via WhatsApp"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowEditReservation(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={async () => {
                const agreedN = Number(editReservationForm.agreedPrice) || 0;
                const depositN = Number(editReservationForm.depositAmount) || 0;
                const balanceN = Number(editReservationForm.balanceDue) || 0;
                await supabase.from("stock").update({
                  pickup_date: editReservationForm.pickupDate || null,
                  sold_price: agreedN || null,
                }).eq("id", editReservationItem.id);
                const { data: dealData } = await supabase.from("deals")
                  .select("id").eq("stock_item_id", editReservationItem.id).single();
                if (dealData) {
                  await supabase.from("deals").update({
                    value: agreedN || null,
                    deposit_amount: depositN || null,
                    balance_due: balanceN || null,
                    pickup_date: editReservationForm.pickupDate || null,
                    reservation_notes: editReservationForm.notes || null,
                  }).eq("id", dealData.id);
                }
                setShowEditReservation(false);
                loadReservedDeals();
                loadStock();
                loadCustomers();
              }}
                style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                Save Changes
              </button>
            </div>
            <button onClick={async () => {
              if (!window.confirm("Release this reservation? Device will return to available stock.")) return;
              try {
                const deal = editReservationItem;

                // Release all reserved stock items linked to this deal
                const { data: dealItems } = await supabase
                  .from("deal_items")
                  .select("*")
                  .eq("deal_id", deal.id);

                for (const item of (dealItems || [])) {
                  if (item.item_type === "device" && item.stock_id) {
                    await supabase.from("stock").update({
                      status: "available",
                      reserved_for_customer_id: null,
                      reserved_at: null,
                      pickup_date: null,
                      sold_price: null,
                    }).eq("id", item.stock_id);
                  }
                }

                // Also try to release via stock_item_id on deal directly
                if (deal.stock_item_id) {
                  await supabase.from("stock").update({
                    status: "available",
                    reserved_for_customer_id: null,
                    reserved_at: null,
                    pickup_date: null,
                    sold_price: null,
                  }).eq("id", deal.stock_item_id);
                }

                // Delete deal items
                await supabase.from("deal_items").delete().eq("deal_id", deal.id);

                // Reset the deal stage
                await supabase.from("deals").update({
                  stage: "device_found",
                  value: null,
                  deposit_amount: null,
                  balance_due: null,
                  pickup_date: null,
                  stock_item_id: null,
                }).eq("id", deal.id);

                setShowEditReservation(false);
                loadStock();
                loadCustomers();
                loadReservedDeals();
                showToast("Device released back to stock 🔓");
              } catch (e) {
                alert("Error releasing reservation: " + (e.message || "Unknown error"));
              }
            }}
              style={{ padding: 12, borderRadius: 12, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              🔓 Release Reservation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
