import React, { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "../supabase";
import { EMPTY_PART } from "../constants";

const PartsContext = createContext(null);

export function PartsProvider({ children }) {
  const [parts, setParts] = useState([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [partForm, setPartForm] = useState(EMPTY_PART);
  const [showPartSale, setShowPartSale] = useState(false);
  const [partSaleTarget, setPartSaleTarget] = useState(null);
  const [partsSold, setPartsSold] = useState([]);
  const [partsSoldLoading, setPartsSoldLoading] = useState(false);
  const [partsRevMTD, setPartsRevMTD] = useState(0);

  async function loadParts() {
    setPartsLoading(true);
    const { data } = await supabase
      .from("stock_parts")
      .select("*")
      .order("created_at", { ascending: false });
    setParts(data || []);
    setPartsLoading(false);
  }

  async function savePart() {
    const payload = {
      category: partForm.category,
      compatible_with: partForm.compatible_with.trim() || null,
      specs: partForm.specs.trim() || null,
      condition: partForm.condition,
      quantity: parseInt(partForm.quantity) || 1,
      cost_price: partForm.cost_price ? parseFloat(partForm.cost_price) : null,
      sell_price: partForm.sell_price ? parseFloat(partForm.sell_price) : null,
      source: partForm.source.trim() || null,
      notes: partForm.notes.trim() || null,
      status: "available",
    };
    if (editingPart) {
      await supabase.from("stock_parts").update(payload).eq("id", editingPart.id);
    } else {
      await supabase.from("stock_parts").insert(payload);
    }
    await loadParts();
    setShowAddPart(false);
    setEditingPart(null);
    setPartForm(EMPTY_PART);
  }

  async function deletePart(id) {
    await supabase.from("stock_parts").delete().eq("id", id);
    setParts(prev => prev.filter(p => p.id !== id));
  }

  const loadPartsRevMTD = useCallback(async () => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("deals")
      .select("value")
      .eq("sale_type", "parts")
      .eq("stage", "closed")
      .gte("closed_at", monthStart.toISOString());
    setPartsRevMTD(
      (data || []).reduce((s, d) => s + (Number(d.value) || 0), 0)
    );
  }, []);

  return (
    <PartsContext.Provider value={{
      parts, setParts,
      partsLoading,
      showAddPart, setShowAddPart,
      editingPart, setEditingPart,
      partForm, setPartForm,
      showPartSale, setShowPartSale,
      partSaleTarget, setPartSaleTarget,
      partsSold, setPartsSold,
      partsSoldLoading, setPartsSoldLoading,
      partsRevMTD,
      loadParts,
      savePart,
      deletePart,
      loadPartsRevMTD,
    }}>
      {children}
    </PartsContext.Provider>
  );
}

export function useParts() {
  const context = useContext(PartsContext);
  if (!context) throw new Error(
    "useParts must be used within PartsProvider"
  );
  return context;
}
