import React from "react";
import { useStock } from "../../context/StockContext";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";
import { useSales } from "../../context/SalesContext";
import DevicesView from "../stock/DevicesView";
import PartsView from "../stock/PartsView";
import LotsView from "../stock/LotsView";

export default function StockTab({ openBroadcast, handleUpgradeApply }) {
  const { isMobile } = useUI();
  const { stockView, setStockView, filteredStock } = useStock();
  const { customers, loadCustomers } = useCustomers();
  const { loadTodaySales, setSaleReceiptData, setReceiptEditName, setShowSaleReceipt } = useSales();

  return (
    <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 32px 40px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Devices / Parts toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { key: "devices", label: "💻 Devices" },
          { key: "parts",   label: "🔧 Parts" },
          { key: "lots",    label: "📦 Lots" },
        ].map(v => (
          <button key={v.key} onClick={() => setStockView(v.key)}
            style={{ flex: 1, padding: "9px 0", borderRadius: 12, border: "none",
                     fontWeight: 700, fontSize: 13, cursor: "pointer",
                     background: stockView === v.key ? "#6366F1" : "#F1F5F9",
                     color:      stockView === v.key ? "#fff"    : "#64748B" }}>
            {v.label}
          </button>
        ))}
      </div>

      {stockView === "parts" && <PartsView />}

      {stockView === "lots" && <LotsView />}

      {stockView === "devices" && (
        <DevicesView
          filteredStock={filteredStock}
          openBroadcast={openBroadcast}
          handleUpgradeApply={handleUpgradeApply}
          loadTodaySales={loadTodaySales}
          setSaleReceiptData={setSaleReceiptData}
          setReceiptEditName={setReceiptEditName}
          setShowSaleReceipt={setShowSaleReceipt}
          customers={customers}
        />
      )}
    </div>
  );
}
