import React from "react";
import { useStock } from "../../context/StockContext";
import { useUI } from "../../context/UIContext";
import DevicesView from "../stock/DevicesView";
import PartsView from "../stock/PartsView";

export default function StockTab({
  customers,
  showUpgrade, setShowUpgrade,
  upgradeTarget, setUpgradeTarget,
  showQuickSale, setShowQuickSale,
  quickSalePrefill, setQuickSalePrefill,
  openBroadcast,
  handleUpgradeApply,
  loadCustomers, loadTodaySales,
  setSaleReceiptData, setReceiptEditName, setShowSaleReceipt,
  filteredStock,
}) {
  const { isMobile } = useUI();
  const { stockView, setStockView } = useStock();

  return (
    <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 32px 40px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Devices / Parts toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { key: "devices", label: "💻 Devices" },
          { key: "parts",   label: "🔧 Parts" },
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

      {stockView === "devices" && (
        <DevicesView
          filteredStock={filteredStock}
          openBroadcast={openBroadcast}
          handleUpgradeApply={handleUpgradeApply}
          loadTodaySales={loadTodaySales}
          setSaleReceiptData={setSaleReceiptData}
          setReceiptEditName={setReceiptEditName}
          setShowSaleReceipt={setShowSaleReceipt}
          showUpgrade={showUpgrade}
          setShowUpgrade={setShowUpgrade}
          upgradeTarget={upgradeTarget}
          setUpgradeTarget={setUpgradeTarget}
          showQuickSale={showQuickSale}
          setShowQuickSale={setShowQuickSale}
          quickSalePrefill={quickSalePrefill}
          setQuickSalePrefill={setQuickSalePrefill}
          customers={customers}
        />
      )}
    </div>
  );
}
