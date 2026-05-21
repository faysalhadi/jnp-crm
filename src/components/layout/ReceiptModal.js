import React from "react";
import { useSales } from "../../context/SalesContext";

export default function ReceiptModal() {
  const {
    showSaleReceipt, setShowSaleReceipt,
    saleReceiptData,
    receiptEditName, setReceiptEditName,
    buildSaleReceiptText,
  } = useSales();
  if (!showSaleReceipt || !saleReceiptData) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>🧾 Receipt</span>
            <button onClick={() => setShowSaleReceipt(false)}
              style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>CUSTOMER NAME</div>
            <input value={receiptEditName} onChange={e => setReceiptEditName(e.target.value)} placeholder="Customer name"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ background: "#F8FAFC", borderRadius: 14, padding: 16, fontFamily: "monospace", fontSize: 12, lineHeight: 1.8, color: "#0F172A", whiteSpace: "pre-line", marginBottom: 16, border: "1px solid #E2E8F0" }}>
            {buildSaleReceiptText(saleReceiptData, receiptEditName)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(buildSaleReceiptText(saleReceiptData, receiptEditName))}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              📋 Copy
            </button>
            <button onClick={() => {
              const text = buildSaleReceiptText(saleReceiptData, receiptEditName);
              const number = saleReceiptData.customerNumber;
              window.open(`https://wa.me/${number ? number.replace(/\D/g,"") : ""}?text=${encodeURIComponent(text)}`, "_blank");
            }}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              📱 WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
