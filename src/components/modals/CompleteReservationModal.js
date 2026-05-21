import React from "react";
import { supabase } from "../../supabase";
import { useReservations } from "../../context/ReservationsContext";
import { useStock } from "../../context/StockContext";
import { useCustomers } from "../../context/CustomerContext";
import { useSales } from "../../context/SalesContext";
import { useUI } from "../../context/UIContext";

export default function CompleteReservationModal() {
  const {
    showCompleteReservation, setShowCompleteReservation,
    completingDeal, setCompletingDeal,
    completionPaymentMethod, setCompletionPaymentMethod,
    loadReservedDeals,
  } = useReservations();
  const { loadStock, refreshCachedStock } = useStock();
  const { loadCustomers } = useCustomers();
  const { setSaleReceiptData, setReceiptEditName, setShowSaleReceipt, loadTodaySales } = useSales();
  const { isMobile } = useUI();

  if (!showCompleteReservation || !completingDeal) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>✅ Complete Sale</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{completingDeal.customers?.name || "Customer"}</div>
            </div>
            <button onClick={() => setShowCompleteReservation(false)}
              style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(completingDeal.deal_items || []).map((item, i) => (
                <div key={item.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#F8FAFC", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                    {item.item_type === "device"
                      ? ([item.brand, item.model].filter(Boolean).join(" ") || "Device")
                      : `🔧 ${item.category || "Part"}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>AED {Number(item.agreed_price || 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", marginBottom: 6 }}>
                <span>Total</span>
                <span style={{ fontWeight: 700 }}>AED {Number(completingDeal.value || 0).toLocaleString()}</span>
              </div>
              {completingDeal.deposit_amount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#F59E0B", marginBottom: 6 }}>
                  <span>Deposit paid</span>
                  <span style={{ fontWeight: 700 }}>AED {Number(completingDeal.deposit_amount).toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#10B981", borderTop: "1px solid #E2E8F0", paddingTop: 8 }}>
                <span>Balance due today</span>
                <span>AED {Number(completingDeal.balance_due || completingDeal.value || 0).toLocaleString()}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>PAYMENT METHOD</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Cash", "Bank Transfer", "Partial"].map(m => (
                  <button key={m} onClick={() => setCompletionPaymentMethod(m)}
                    style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                             background: completionPaymentMethod === m ? "#6366F1" : "#F1F5F9",
                             color: completionPaymentMethod === m ? "#fff" : "#64748B" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={async () => {
              try {
                const soldAt = new Date().toISOString();
                const items = completingDeal.deal_items || [];
                for (const item of items) {
                  if (item.item_type === "device" && item.stock_id) {
                    await supabase.from("stock").update({
                      status: "sold",
                      sold_at: soldAt,
                      sold_to_customer_id: completingDeal.customers?.id || null,
                    }).eq("id", item.stock_id);
                  }
                }
                await supabase.from("deals").update({
                  stage: "closed",
                  closed_at: soldAt,
                  payment_method: completionPaymentMethod,
                  payment_status: "received",
                }).eq("id", completingDeal.id);
                setShowCompleteReservation(false);
                setCompletingDeal(null);
                loadReservedDeals();
                loadStock();
                loadCustomers();
                loadTodaySales();
                const receiptItems = items.map(i => ({
                  label: i.item_type === "device"
                    ? ([i.brand, i.model].filter(Boolean).join(" ") || "Device")
                    : `${i.category || "Part"}${i.specs ? ` · ${i.specs}` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
                  price: Number(i.agreed_price || 0),
                }));
                setSaleReceiptData({
                  type: "reserved",
                  date: soldAt,
                  customerName: completingDeal.customers?.name || "Customer",
                  customerNumber: completingDeal.customers?.number || null,
                  price: Number(completingDeal.value || 0),
                  depositAmount: Number(completingDeal.deposit_amount || 0),
                  balanceDue: Number(completingDeal.balance_due || 0),
                  paymentMethod: completionPaymentMethod,
                  items: receiptItems,
                });
                setReceiptEditName(completingDeal.customers?.name || "Customer");
                setShowSaleReceipt(true);
              } catch (e) {
                alert("Error completing sale: " + (e.message || "Unknown error"));
              }
            }}
              style={{ padding: 14, borderRadius: 12, border: "none", background: "#10B981", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              ✅ Complete Sale — AED {Number(completingDeal.balance_due || completingDeal.value || 0).toLocaleString()} Due
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
