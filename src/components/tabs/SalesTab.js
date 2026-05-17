import React, { useState } from "react";
import Spinner from "../ui/Spinner";

export default function SalesTab({
  isMobile,
  salesHistory, salesHistoryLoading,
  salesFilter, setSalesFilter,
  setSaleReceiptData, setReceiptEditName, setShowSaleReceipt,
}) {
  const [expandedSaleId, setExpandedSaleId] = useState(null);

  return (
    <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 32px 40px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>📊 Sales History</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[{key:"today",label:"Today"},{key:"week",label:"This Week"},{key:"month",label:"This Month"},{key:"all",label:"All Time"}].map(f => (
          <button key={f.key} onClick={() => setSalesFilter(f.key)}
            style={{ padding: "6px 16px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: salesFilter === f.key ? "#6366F1" : "#F1F5F9", color: salesFilter === f.key ? "#fff" : "#64748B" }}>
            {f.label}
          </button>
        ))}
      </div>
      {!salesHistoryLoading && salesHistory.length > 0 && (() => {
        const total = salesHistory.reduce((s, x) => s + (Number(x.price) || 0), 0);
        const devices = salesHistory.filter(s => s.type !== "part").length;
        const partsCount = salesHistory.filter(s => s.type === "part").length;
        return (
          <div style={{ padding: "12px 16px", background: "#ECFDF5", borderRadius: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#059669" }}>AED {total.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "#10B981", marginTop: 2 }}>{salesHistory.length} sales · {devices} devices · {partsCount} parts</div>
            </div>
          </div>
        );
      })()}
      {salesHistoryLoading && <Spinner />}
      {!salesHistoryLoading && salesHistory.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No sales found</div>
          <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Try a different time filter</div>
        </div>
      )}
      {!salesHistoryLoading && salesHistory.map((sale, i) => (
        <div key={sale.id || i} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", border: "1.5px solid #F1F5F9", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{sale.customerName}</div>
              <div style={{ fontSize: 13, color: "#475569", marginTop: 2, fontWeight: 600 }}>{sale.device}</div>
              {sale.specs ? <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{sale.specs}</div> : null}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#6366F1" }}>AED {Number(sale.price).toLocaleString()}</div>
              {sale.depositAmount > 0 && (
                <div style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700, marginTop: 2 }}>Deposit: AED {Number(sale.depositAmount).toLocaleString()}</div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700,
                background: sale.type==="part"?"#F5F3FF":sale.type==="walkin"?"#EFF6FF":"#ECFDF5",
                color: sale.type==="part"?"#7C3AED":sale.type==="walkin"?"#2563EB":"#059669" }}>
                {sale.type==="part"?"🔧 Part":sale.type==="walkin"?"⚡ Walk-in":"💬 WhatsApp"}
              </span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700, background: "#F1F5F9", color: "#64748B" }}>{sale.paymentMethod}</span>
              <span style={{ fontSize: 10, color: "#CBD5E1" }}>{new Date(sale.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
            <button onClick={() => { setSaleReceiptData(sale); setReceiptEditName(sale.customerName || ""); setShowSaleReceipt(true); }}
              style={{ padding: "5px 14px", borderRadius: 8, border: "1.5px solid #6366F1", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              🧾 Receipt
            </button>
          </div>
          {sale.items && sale.items.length > 1 && (
            <div style={{ marginTop: 6 }}>
              <button onClick={() => setExpandedSaleId(expandedSaleId === (sale.id || i) ? null : (sale.id || i))}
                style={{ fontSize: 11, color: "#6366F1", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {expandedSaleId === (sale.id || i) ? "▲ Hide items" : `▼ ${sale.items.length} items`}
              </button>
              {expandedSaleId === (sale.id || i) && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {sale.items.map((item, j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", background: "#F8FAFC", borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: "#475569" }}>{item.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6366F1" }}>AED {item.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
