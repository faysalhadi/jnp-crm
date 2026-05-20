import React, { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "../supabase";

const SalesContext = createContext(null);

export function SalesProvider({ children }) {
  const [todaySales, setTodaySales] = useState({
    total: 0, whatsapp: 0, walkin: 0
  });
  const [salesHistory, setSalesHistory] = useState([]);
  const [salesHistoryLoading, setSalesHistoryLoading] = useState(false);
  const [salesFilter, setSalesFilter] = useState("month");
  const [showSaleReceipt, setShowSaleReceipt] = useState(false);
  const [saleReceiptData, setSaleReceiptData] = useState(null);
  const [receiptEditName, setReceiptEditName] = useState("");
  const [openComplaints, setOpenComplaints] = useState([]);

  const loadTodaySales = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("deals")
      .select("sale_type, closed_at")
      .eq("stage", "closed")
      .gte("closed_at", todayStart.toISOString());
    const deals = data || [];
    setTodaySales({
      total: deals.length,
      whatsapp: deals.filter(d =>
        !d.sale_type || d.sale_type === "whatsapp"
      ).length,
      walkin: deals.filter(d => d.sale_type === "walkin").length,
    });
  }, []);

  const loadSalesHistory = useCallback(async () => {
    setSalesHistoryLoading(true);
    const now = new Date();
    let fromDate = null;
    if (salesFilter === "today") {
      fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);
    } else if (salesFilter === "week") {
      fromDate = new Date(now - 7 * 86400000);
    } else if (salesFilter === "month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const dealQuery = supabase
      .from("deals")
      .select("*, customers(name, number), deal_items(*)")
      .eq("stage", "closed")
      .order("closed_at", { ascending: false });
    if (fromDate) dealQuery.gte("closed_at", fromDate.toISOString());
    const { data: dealSales } = await dealQuery;

    const walkinQuery = supabase
      .from("deals")
      .select("*")
      .eq("stage", "closed")
      .eq("sale_type", "walkin")
      .order("closed_at", { ascending: false });
    if (fromDate) walkinQuery.gte("closed_at", fromDate.toISOString());
    const { data: walkinSales } = await walkinQuery;

    const partsQuery = supabase
      .from("parts_sales")
      .select("*")
      .order("sold_at", { ascending: false });
    if (fromDate) partsQuery.gte("sold_at", fromDate.toISOString());
    const { data: partsSalesData } = await partsQuery;

    const stockIds = (dealSales || [])
      .map(d => d.stock_item_id)
      .filter(Boolean);
    let stockMap = {};
    if (stockIds.length) {
      const { data: stockItems } = await supabase
        .from("stock")
        .select("id, brand, model, processor, ram, ssd, condition, serial_number")
        .in("id", stockIds);
      (stockItems || []).forEach(s => { stockMap[s.id] = s; });
    }

    const combined = [];

    (dealSales || []).forEach(d => {
      const stock = stockMap[d.stock_item_id] || {};
      combined.push({
        id: d.id,
        type: d.sale_type === "walkin" ? "walkin" : "device",
        date: d.closed_at,
        customerName: d.customers?.name || d.walk_in_name || "Walk-in Customer",
        customerNumber: d.customers?.number || null,
        device: [stock.brand, stock.model].filter(Boolean).join(" ") || "Device",
        specs: [stock.ram, stock.ssd, stock.condition].filter(Boolean).join(" · "),
        serialNumber: stock.serial_number || null,
        price: d.value || 0,
        paymentMethod: d.payment_method || "Cash",
        depositAmount: d.deposit_amount || 0,
        balanceDue: d.balance_due || 0,
        brand: stock.brand,
        model: stock.model,
        processor: stock.processor,
        ram: stock.ram,
        ssd: stock.ssd,
        condition: stock.condition,
        items: (d.deal_items || []).map(i => ({
          label: i.item_type === "device"
            ? ([i.brand, i.model].filter(Boolean).join(" ") || "Device")
            : `${i.category || "Part"}${i.specs ? ` · ${i.specs}` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
          price: Number(i.agreed_price || 0),
        })),
      });
    });

    (walkinSales || []).forEach(d => {
      if (d.stock_item_id) return;
      combined.push({
        id: d.id,
        type: "walkin",
        date: d.closed_at,
        customerName: d.walk_in_name || "Walk-in Customer",
        customerNumber: d.walk_in_number || null,
        device: [d.brand, d.model].filter(Boolean).join(" ") || "Device",
        specs: [d.ram, d.storage, d.condition].filter(Boolean).join(" · "),
        serialNumber: null,
        price: d.value || 0,
        paymentMethod: d.payment_method || "Cash",
        depositAmount: 0,
        balanceDue: 0,
        brand: d.brand,
        model: d.model,
        items: [],
      });
    });

    (partsSalesData || []).forEach(p => {
      combined.push({
        id: p.id,
        type: "part",
        date: p.sold_at,
        customerName: p.customer_name || "Walk-in Customer",
        customerNumber: null,
        device: [p.category, p.specs].filter(Boolean).join(" — "),
        specs: p.compatible_with || "",
        serialNumber: null,
        price: p.total_revenue || 0,
        paymentMethod: p.payment_method || "Cash",
        depositAmount: 0,
        balanceDue: 0,
        quantity: p.quantity_sold || 1,
        items: [],
      });
    });

    combined.sort((a, b) => new Date(b.date) - new Date(a.date));
    setSalesHistory(combined);
    setSalesHistoryLoading(false);
  }, [salesFilter]);

  function buildSaleReceiptText(sale, nameOverride) {
    const num = `LFL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const date = new Date(sale.date).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric"
    });
    const customerName = nameOverride || sale.customerName || "Customer";
    return `━━━━━━━━━━━━━━━━━━━━━━
      LAPTOP FOR LESS
      UAE | laptopforless.ae
━━━━━━━━━━━━━━━━━━━━━━
RECEIPT #: ${num}
Date: ${date}

SOLD TO:
Name: ${customerName}${sale.customerNumber ? `\nContact: ${sale.customerNumber}` : ""}

${sale.items && sale.items.length > 0
      ? `ITEMS:\n${sale.items.map(i =>
        `${i.label}${' '.repeat(Math.max(1, 30 - i.label.length))}AED ${Number(i.price).toLocaleString()}`
      ).join('\n')}`
      : sale.type === "part"
        ? `PART DETAILS:\nItem: ${sale.device}${sale.specs ? `\nCompatible With: ${sale.specs}` : ""}\nQuantity: ${sale.quantity || 1}`
        : `DEVICE DETAILS:\n${sale.device}${sale.specs ? `\n${sale.specs}` : ""}${sale.serialNumber ? `\nSerial #: ${sale.serialNumber}` : ""}`
    }

PAYMENT:
${sale.depositAmount > 0
      ? `Total: AED ${Number(sale.price).toLocaleString()}
Deposit Paid: AED ${Number(sale.depositAmount).toLocaleString()}
Balance Received: AED ${Number(sale.price - sale.depositAmount).toLocaleString()}`
      : `Amount: AED ${Number(sale.price).toLocaleString()}`}
Method: ${sale.paymentMethod}

Thank you for your purchase! 🙏
For any issues contact us on WhatsApp.
━━━━━━━━━━━━━━━━━━━━━━`;
  }

  const loadOpenComplaints = useCallback(async () => {
    const { data } = await supabase
      .from("complaints")
      .select("*, customers(name, number)")
      .neq("status", "resolved")
      .order("created_at", { ascending: false });
    setOpenComplaints(data || []);
  }, []);

  return (
    <SalesContext.Provider value={{
      todaySales, setTodaySales,
      salesHistory,
      salesHistoryLoading,
      salesFilter, setSalesFilter,
      showSaleReceipt, setShowSaleReceipt,
      saleReceiptData, setSaleReceiptData,
      receiptEditName, setReceiptEditName,
      openComplaints, setOpenComplaints,
      loadTodaySales,
      loadSalesHistory,
      buildSaleReceiptText,
      loadOpenComplaints,
    }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales() {
  const context = useContext(SalesContext);
  if (!context) throw new Error(
    "useSales must be used within SalesProvider"
  );
  return context;
}
