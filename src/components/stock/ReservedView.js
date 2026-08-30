import React from "react";
import { supabase } from "../../supabase";
import { useStock } from "../../context/StockContext";
import { useReservations } from "../../context/ReservationsContext";
import { useCustomers } from "../../context/CustomerContext";
import { useSales } from "../../context/SalesContext";
import Spinner from "../ui/Spinner";
import { dealTotal } from "../../utils/bulk";

export default function ReservedView() {
  const { loadStock, refreshCachedStock } = useStock();
  const { loadCustomers } = useCustomers();
  const { setSaleReceiptData, setReceiptEditName, setShowSaleReceipt } = useSales();
  const {
    reservedDeals, reservedDealsLoading,
    loadReservedDeals,
    expandedReservedDeal, setExpandedReservedDeal,
    showCompleteReservation, setShowCompleteReservation,
    completingDeal, setCompletingDeal,
    completionPaymentMethod, setCompletionPaymentMethod,
    showEditReservation, setShowEditReservation,
    editReservationItem, setEditReservationItem,
    editReservationForm, setEditReservationForm,
  } = useReservations();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {reservedDealsLoading && <Spinner />}
      {!reservedDealsLoading && reservedDeals.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No reservations</div>
        </div>
      )}
      {!reservedDealsLoading && reservedDeals.map(deal => {
        const customer = deal.customers;
        const items = deal.deal_items || [];
        const isExpanded = expandedReservedDeal === deal.id;
        const today = new Date(); today.setHours(0,0,0,0);
        const isOverdue = deal.pickup_date && new Date(deal.pickup_date) < today;
        const pickupLabel = deal.pickup_date
          ? new Date(deal.pickup_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : null;
        const deviceItems = items.filter(i => i.item_type === "device");
        const partItems = items.filter(i => i.item_type === "part");
        const itemSummary = [
          ...deviceItems.map(i => [i.brand, i.model].filter(Boolean).join(" ") || "Device"),
          ...partItems.map(i => i.category || "Part"),
        ].join(" · ");
        return (
          <div key={deal.id} style={{
            background: "#fff", borderRadius: 18,
            border: `1.5px solid ${isOverdue ? "#FCA5A5" : "#FDE68A"}`,
            boxShadow: "0 1px 6px rgba(245,158,11,0.15)",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 14px",
              background: isOverdue ? "#FEF2F2" : "#FFFBEB",
              borderBottom: isExpanded ? "1px solid #FDE68A" : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>
                    🔒 {customer?.name || "Walk-in"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    {itemSummary || "No items"}
                  </div>
                  <div style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#B45309", marginTop: 3, fontWeight: 700 }}>
                    {isOverdue ? `⚠️ Overdue — pickup was ${pickupLabel}` : `Pickup: ${pickupLabel || "—"}`}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#6366F1" }}>
                    AED {dealTotal(deal).toLocaleString()}
                  </div>
                  {deal.deposit_amount > 0 && (
                    <div style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>
                      Deposit: AED {Number(deal.deposit_amount).toLocaleString()}
                    </div>
                  )}
                  {deal.balance_due > 0 && (
                    <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 700 }}>
                      Balance: AED {Number(deal.balance_due).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => setExpandedReservedDeal(isExpanded ? null : deal.id)}
                  style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #FDE68A", background: "#fff", color: "#D97706", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {isExpanded ? "▲ Hide Items" : `▼ ${items.length} Item${items.length !== 1 ? "s" : ""}`}
                </button>
                <button onClick={() => {
                  setCompletingDeal(deal);
                  setCompletionPaymentMethod("Cash");
                  setShowCompleteReservation(true);
                }}
                  style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  ✅ Complete
                </button>
                <button onClick={() => {
                  setEditReservationItem(deal);
                  setEditReservationForm({
                    agreedPrice: String(deal.value || ""),
                    pickupDate: deal.pickup_date ? deal.pickup_date.split("T")[0] : "",
                    depositAmount: String(deal.deposit_amount || ""),
                    balanceDue: String(deal.balance_due || ""),
                    notes: deal.reservation_notes || "",
                  });
                  setShowEditReservation(true);
                }}
                  style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Edit
                </button>
                <button onClick={() => {
                  const receiptItems = (deal.deal_items || []).map(i => ({
                    label: i.item_type === "device"
                      ? ([i.brand, i.model].filter(Boolean).join(" ") || "Device")
                      : `${i.category || "Part"}${i.specs ? ` · ${i.specs}` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
                    price: Number(i.agreed_price || 0),
                  }));
                  setSaleReceiptData({
                    type: "reserved",
                    date: deal.created_at,
                    customerName: deal.customers?.name || "Customer",
                    customerNumber: deal.customers?.number || null,
                    price: Number(deal.value || 0),
                    depositAmount: Number(deal.deposit_amount || 0),
                    balanceDue: Number(deal.balance_due || 0),
                    paymentMethod: "Cash",
                    items: receiptItems,
                  });
                  setReceiptEditName(deal.customers?.name || "Customer");
                  setShowSaleReceipt(true);
                }}
                  style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #6366F1", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🧾
                </button>
                <button onClick={async () => {
                  if (!window.confirm("Release all items in this reservation?")) return;
                  const deviceItems = (deal.deal_items || []).filter(i => i.item_type === "device");
                  for (const item of deviceItems) {
                    if (item.stock_id) {
                      await supabase.from("stock").update({
                        status: "available",
                        reserved_for_customer_id: null,
                        reserved_at: null,
                        pickup_date: null,
                        sold_price: null,
                      }).eq("id", item.stock_id);
                    }
                  }
                  await supabase.from("deal_items").delete().eq("deal_id", deal.id);
                  await supabase.from("deals").update({
                    stage: "device_found",
                    value: null,
                    deposit_amount: null,
                    balance_due: null,
                    pickup_date: null,
                    stock_item_id: null,
                  }).eq("id", deal.id);
                  loadReservedDeals();
                  loadStock();
                  loadCustomers();
                }}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🔓
                </button>
              </div>
            </div>
            {isExpanded && (
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "12px 0" }}>No items recorded</div>
                )}
                {items.map((item, i) => (
                  <div key={item.id || i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", borderRadius: 10,
                    background: item.item_type === "device" ? "#F8FAFC" : "#F5F3FF",
                    border: `1px solid ${item.item_type === "device" ? "#F1F5F9" : "#DDD6FE"}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                        {item.item_type === "device"
                          ? ([item.brand, item.model].filter(Boolean).join(" ") || "Device")
                          : `🔧 ${item.category || "Part"}${item.specs ? ` · ${item.specs}` : ""}`}
                      </div>
                      {item.item_type === "device" && (
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                          {[item.ram, item.ssd, item.condition].filter(Boolean).join(" · ")}
                          {item.upgrade_ram || item.upgrade_ssd ? " · ⬆ Upgraded" : ""}
                        </div>
                      )}
                      {item.item_type === "part" && item.quantity > 1 && (
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>×{item.quantity}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>
                        AED {Number(item.agreed_price || 0).toLocaleString()}
                      </div>
                      <button onClick={async () => {
                        if (!window.confirm("Release this item back to stock?")) return;
                        if (item.item_type === "device" && item.stock_id) {
                          await supabase.from("stock").update({
                            status: "available",
                            reserved_for_customer_id: null,
                            reserved_at: null,
                            pickup_date: null,
                            sold_price: null,
                          }).eq("id", item.stock_id);
                        }
                        await supabase.from("deal_items").delete().eq("id", item.id);
                        const remaining = items.filter(x => x.id !== item.id);
                        const newTotal = remaining.reduce((s, x) => s + (Number(x.agreed_price) || 0), 0);
                        await supabase.from("deals").update({
                          value: newTotal || null,
                          balance_due: Math.max(0, newTotal - (Number(deal.deposit_amount) || 0)),
                        }).eq("id", deal.id);
                        loadReservedDeals();
                        loadStock();
                      }}
                        style={{ padding: "3px 8px", borderRadius: 6, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                        🔓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
