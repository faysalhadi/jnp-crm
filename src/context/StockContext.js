import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";
import { EMPTY_STOCK } from "../constants";

const StockContext = createContext(null);

export function StockProvider({ children }) {
  const [stock, setStock] = useState([]);
  const [lastAddedStock, setLastAddedStock] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [cachedStock, setCachedStock] = useState([]);
  const [stockFilter, setStockFilter] = useState("available");
  const [stockSearch, setStockSearch] = useState("");
  const [stockView, setStockView] = useState("devices");
  const [showAddStock, setShowAddStock] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [stockForm, setStockForm] = useState(EMPTY_STOCK);
  const [expandedStockId, setExpandedStockId] = useState(null);
  const [stockPhotoUploading, setStockPhotoUploading] = useState(false);
  const [showImportStock, setShowImportStock] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importingStock, setImportingStock] = useState(false);
  const [importStockResult, setImportStockResult] = useState(null);
  const [soldDealMap, setSoldDealMap] = useState({});
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [quickSalePrefill, setQuickSalePrefill] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState(null);
  const stockFileInputRef = useRef(null);
  const importStockFileRef = useRef(null);

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    const { data } = await supabase
      .from("stock")
      .select("*")
      .order("created_at", { ascending: false });
    setStock(data || []);
    setStockLoading(false);
  }, []);

  const refreshCachedStock = useCallback(async () => {
    const { data } = await supabase
      .from("stock")
      .select("brand, model, processor, ram, ssd, screen, condition, charger, box, activation_lock, max_price, min_price, cost_price, created_at")
      .eq("status", "available")
      .order("brand");
    setCachedStock(data || []);
  }, []);

  async function saveStock() {
    const payload = {
      brand: stockForm.brand || null,
      model: stockForm.model || null,
      processor: stockForm.processor || null,
      ram: stockForm.ram || null,
      ssd: stockForm.ssd || null,
      screen: stockForm.screen || null,
      condition: stockForm.condition || null,
      charger: stockForm.charger || null,
      box: stockForm.box || null,
      activation_lock: stockForm.activation_lock || null,
      cost_price: stockForm.cost_price ? parseFloat(stockForm.cost_price) : null,
      min_price: stockForm.min_price ? parseFloat(stockForm.min_price) : null,
      max_price: stockForm.max_price ? parseFloat(stockForm.max_price) : null,
      serial_number: stockForm.serial_number || null,
      notes: stockForm.notes || null,
      photo_url: stockForm.photo_url || null,
      status: stockForm.status || "available",
    };
    if (editingStock) {
      await supabase.from("stock").update(payload).eq("id", editingStock.id);
      setStock(prev => prev.map(s =>
        s.id === editingStock.id ? { ...s, ...payload } : s
      ));
    } else {
      const { data: newItem } = await supabase
        .from("stock").insert(payload).select().single();
      if (newItem) {
        setStock(prev => [newItem, ...prev]);
        setLastAddedStock(newItem);
      } else {
        await loadStock();
      }
    }
    refreshCachedStock();
    setShowAddStock(false);
    setEditingStock(null);
    setStockForm(EMPTY_STOCK);
  }

  async function deleteStockItem(id) {
    await supabase.from("stock").delete().eq("id", id);
    if (expandedStockId === id) setExpandedStockId(null);
    await loadStock();
    refreshCachedStock();
  }

  async function toggleStockStatus(item) {
    const newStatus = item.status === "available" ? "sold" : "available";
    await supabase.from("stock").update({ status: newStatus }).eq("id", item.id);
    setStock(prev => prev.map(s =>
      s.id === item.id ? { ...s, status: newStatus } : s
    ));
    refreshCachedStock();
  }

  async function uploadStockPhoto(file) {
    if (!file) return;
    setStockPhotoUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filename = `stock/${Date.now()}.${ext}`;
      const { data: uploadData, error } = await supabase.storage
        .from("stock-photos")
        .upload(filename, file, { upsert: true });
      if (!error && uploadData) {
        const { data: urlData } = supabase.storage
          .from("stock-photos")
          .getPublicUrl(uploadData.path);
        setStockForm(f => ({ ...f, photo_url: urlData.publicUrl }));
      }
    } catch {}
    setStockPhotoUploading(false);
  }

  function downloadStockTemplate() {
    // Unified template — works for both regular import and lot import
    // Lot fields (rows 1-3) are optional — fill them to create a lot
    const lotInfo = [
      ["LOT NAME (optional — leave blank for regular import)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["SUPPLIER (optional)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["LOT PURCHASE PRICE AED (optional — total paid incl. refurb)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      [], // spacer
    ];
    const headers = [["Brand","Model","Processor","RAM","SSD","Screen",
      "Condition","Charger","Box","Activation Lock","Qty",
      "Market Value (AED)","Cost Price","Min Price","Max Price","Serial Number","Notes"]];
    const sample = [
      ["HP","EliteBook 840 G8","Core i5 11th Gen","8GB","256GB","14","Grade A","yes","no","no",5,1600,"","",1850,"",""],
      ["Dell","Latitude 5490","Core i7 8th Gen","8GB","256GB","14","Grade A","yes","no","no",3,1450,"","",1700,"",""],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...lotInfo, ...headers, ...sample]);
    // Column widths
    ws["!cols"] = [18,22,20,8,8,8,12,8,6,14,6,16,10,10,12,14,20].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Import");
    XLSX.writeFile(wb, "JNP_Stock_Import_Template.xlsx");
  }

  function handleStockFileSelect(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const col = (row, ...keys) => {
        for (const k of keys) {
          const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? "";
          if (String(v).trim()) return String(v).trim();
        }
        return "";
      };
      // Expand rows by Qty — one row with Qty 5 becomes 5 stock items
      const expanded = [];
      rows.forEach(r => {
        const qty = parseInt(col(r, "Qty", "QTY", "qty", "Quantity")) || 1;
        const base = {
          brand:           col(r, "Brand") || null,
          model:           col(r, "Model") || null,
          processor:       col(r, "Processor") || null,
          ram:             col(r, "RAM", "Ram") || null,
          ssd:             col(r, "SSD", "Ssd") || null,
          screen:          col(r, "Screen", "Screen Size") || null,
          condition:       col(r, "Condition") || null,
          charger:         col(r, "Charger").toLowerCase() || null,
          box:             col(r, "Box").toLowerCase() || null,
          activation_lock: col(r, "Activation Lock").toLowerCase() || null,
          cost_price:      parseFloat(col(r, "Cost Price")) || null,
          min_price:       parseFloat(col(r, "Min Price")) || null,
          max_price:       parseFloat(col(r, "Max Price", "Sell Price")) || null,
          serial_number:   qty === 1 ? (col(r, "Serial Number", "Serial") || null) : null,
          notes:           col(r, "Notes") || null,
          status:          "available",
        };
        if (!base.brand && !base.model) return;
        for (let i = 0; i < qty; i++) expanded.push({ ...base });
      });
      setImportPreview(expanded);
      setImportStockResult(null);
    };
    reader.readAsArrayBuffer(file);
  }

  async function importStockItems() {
    if (!importPreview?.length) return;
    setImportingStock(true);
    const { data: inserted, error } = await supabase
      .from("stock").insert(importPreview).select();
    if (!error && inserted) {
      setStock(prev => [...inserted, ...prev]);
      setImportStockResult({ success: true, count: inserted.length });
      setTimeout(() => {
        setShowImportStock(false);
        setImportPreview(null);
        setImportStockResult(null);
      }, 1800);
    } else {
      setImportStockResult({
        success: false,
        message: error?.message || "Import failed"
      });
    }
    setImportingStock(false);
  }

  const filteredStock = stock.filter(item => {
    if (stockSearch) {
      const q = stockSearch.toLowerCase();
      return (item.brand || "").toLowerCase().includes(q) ||
             (item.model || "").toLowerCase().includes(q) ||
             (item.processor || "").toLowerCase().includes(q) ||
             (item.serial_number || "").toLowerCase().includes(q);
    }
    if (stockFilter === "available") return item.status === "available";
    if (stockFilter === "reserved") return item.status === "reserved";
    if (stockFilter === "sold") return item.status === "sold";
    return true;
  });

  return (
    <StockContext.Provider value={{
      stock, setStock,
      stockLoading,
      cachedStock, setCachedStock,
      stockFilter, setStockFilter,
      stockSearch, setStockSearch,
      stockView, setStockView,
      showAddStock, setShowAddStock,
      editingStock, setEditingStock,
      stockForm, setStockForm,
      expandedStockId, setExpandedStockId,
      stockPhotoUploading,
      showImportStock, setShowImportStock,
      importPreview, setImportPreview,
      importingStock,
      importStockResult, setImportStockResult,
      soldDealMap, setSoldDealMap,
      showQuickSale, setShowQuickSale,
      quickSalePrefill, setQuickSalePrefill,
      showUpgrade, setShowUpgrade,
      upgradeTarget, setUpgradeTarget,
      filteredStock,
      stockFileInputRef,
      importStockFileRef,
      loadStock,
      lastAddedStock, setLastAddedStock,
      refreshCachedStock,
      saveStock,
      deleteStockItem,
      toggleStockStatus,
      uploadStockPhoto,
      downloadStockTemplate,
      handleStockFileSelect,
      importStockItems,
    }}>
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const context = useContext(StockContext);
  if (!context) throw new Error(
    "useStock must be used within StockProvider"
  );
  return context;
}
