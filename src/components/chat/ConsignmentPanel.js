import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";

function fmtAED(n) { return n ? "AED " + Number(n).toLocaleString() : "—"; }

export default function ConsignmentPanel() {
  const { activeCustomerId, activeCustomer } = useCustomers();

  const [items, setItems]               = useState([]);
  const [sales, setSales]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [showSell, setShowSell]         = useState(null); // item to sell
  const [clientName, setClientName]     = useState("");
  const [selling, setSelling]           = useState(false);
  const [form, setForm]                 = useState({
    brand: "", model: "", processor: "", ram: "", ssd: "",
    condition: "", qty: "1", trader_price: "", your_price: "", notes: "",
  });
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (activeCustomerId) fetchAll();
  }, [activeCustomerId]); // eslint-disable-line

  async function fetchAll() {
    setLoading(true);
    const { data: itemData } = await supabase
      .from("consignment_items")
      .select("*")
      .eq("trader_id", activeCustomerId)
      .order("created_at", { ascending: false });
    setItems(itemData || []);

    const { data: saleData } = await supabase
      .from("consignment_sales")
      .select("*")
      .eq("trader_id", activeCustomerId)
      .order("sold_at", { ascending: false });
    setSales(saleData || []);
    setLoading(false);
  }

  async function addItem() {
    if (!form.brand || !form.trader_price || !form.your_price) return;
    setSaving(true);
    await supabase.from("consignment_items").insert({
      trader_id:    activeCustomerId,
      brand:        form.brand.trim(),
      model:        form.model.trim(),
      processor:    form.processor.trim(),
      ram:          form.ram.trim(),
      ssd:          form.ssd.trim(),
      condition:    form.condition.trim(),
      qty:          parseInt(form.qty) || 1,
      trader_price: parseFloat(form.trader_price),
      your_price:   parseFloat(form.your_price),
      notes:        form.notes.trim() || null,
      status:       "available",
    });
    setForm({ brand: "", model: "", processor: "", ram: "", ssd: "", condition: "", qty: "1", trader_price: "", your_price: "", notes: "" });
    setShowAdd(false);
    setSaving(false);
    fetchAll();
  }

  async function markSold(item) {
    if (!clientName.trim()) return;
    setSelling(true);
    // Insert sale record
    await supabase.from("consignment_sales").insert({
      item_id:      item.id,
      trader_id:    activeCustomerId,
      client_name:  clientName.trim(),
      sold_price:   item.your_price,
      trader_price: item.trader_price,
      settled:      false,
    });
    // Reduce qty or mark sold
    const newQty = (item.qty || 1) - 1;
    if (newQty <= 0) {
      await supabase.from("consignment_items").update({ status: "sold" }).eq("id", item.id);
    } else {
      await supabase.from("consignment_items").update({ qty: newQty }).eq("id", item.id);
    }
    setShowSell(null);
    setClientName("");
    setSelling(false);
    fetchAll();
  }

  async function deleteItem(id) {
    await supabase.from("consignment_items").delete().eq("id", id);
    fetchAll();
  }

  async function markSettled(saleId) {
    await supabase.from("consignment_sales").update({ settled: true }).eq("id", saleId);
    fetchAll();
  }

  const availableItems = items.filter(i => i.status === "available");
  const unsettledSales = sales.filter(s => !s.settled);
  const totalOwed      = unsettledSales.reduce((s, x) => s + (x.sold_price - x.trader_price), 0);
  const totalProfit    = sales.reduce((s, x) => s + (x.sold_price - x.trader_price), 0);

  if (activeCustomer?.contact_type !== "trader") return null;

  return (
    <div style={{ borderTop: "1px solid #F1F5F9" }}>

      {/* Header */}
      <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFBEB" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#D97706" }}>📦 Consignment Stock</div>
          {totalOwed > 0 && (
            <div style={{ fontSize: 10, color: "#D97706", marginTop: 1 }}>
              {fmtAED(totalOwed)} owed to you from {unsettledSales.length} unsettled sale{unsettledSales.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ padding: "6px 12px", borderRadius: 10, border: "none", background: showAdd ? "#F1F5F9" : "#D97706", color: showAdd ? "#64748B" : "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ padding: "12px 14px", background: "#FFFBEB", borderBottom: "1px solid #FDE68A" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {[
              { label: "Brand *", key: "brand", placeholder: "HP, Dell..." },
              { label: "Model",   key: "model", placeholder: "EliteBook 840 G8" },
              { label: "Processor", key: "processor", placeholder: "i5 11th Gen" },
              { label: "RAM",     key: "ram",  placeholder: "8GB" },
              { label: "SSD",     key: "ssd",  placeholder: "256GB" },
              { label: "Condition", key: "condition", placeholder: "Grade A" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#D97706", marginBottom: 2 }}>{f.label}</div>
                <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #FDE68A", fontSize: 12, outline: "none", boxSizing: "border-box", background: "#fff" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            {[
              { label: "Qty",           key: "qty",          placeholder: "1",    type: "number" },
              { label: "Trader price *",key: "trader_price", placeholder: "1400", type: "number" },
              { label: "Your price *",  key: "your_price",   placeholder: "1650", type: "number" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#D97706", marginBottom: 2 }}>{f.label}</div>
                <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #FDE68A", fontSize: 12, outline: "none", boxSizing: "border-box", background: "#fff" }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#D97706", marginBottom: 2 }}>Notes</div>
            <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Any notes..."
              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #FDE68A", fontSize: 12, outline: "none", boxSizing: "border-box", background: "#fff" }} />
          </div>
          {form.trader_price && form.your_price && (
            <div style={{ padding: "6px 10px", borderRadius: 8, background: "#ECFDF5", marginBottom: 8, fontSize: 11, color: "#059669", fontWeight: 700 }}>
              Your profit: {fmtAED(parseFloat(form.your_price) - parseFloat(form.trader_price))} per unit
              {parseInt(form.qty) > 1 ? ` · ${fmtAED((parseFloat(form.your_price) - parseFloat(form.trader_price)) * parseInt(form.qty))} total potential` : ""}
            </div>
          )}
          <button onClick={addItem} disabled={saving || !form.brand || !form.trader_price || !form.your_price}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: !form.brand || !form.trader_price || !form.your_price ? "#E2E8F0" : "#D97706",
              color:      !form.brand || !form.trader_price || !form.your_price ? "#94A3B8" : "#fff" }}>
            {saving ? "Saving..." : "Save Consignment Item"}
          </button>
        </div>
      )}

      {/* Available items */}
      {loading && <div style={{ padding: "12px 14px", fontSize: 12, color: "#94A3B8" }}>Loading...</div>}

      {!loading && availableItems.length === 0 && !showAdd && (
        <div style={{ padding: "16px 14px", fontSize: 12, color: "#CBD5E1", textAlign: "center" }}>
          No consignment stock. Tap + Add to add devices from this trader.
        </div>
      )}

      {availableItems.map(item => {
        const profit = item.your_price - item.trader_price;
        const isSelling = showSell?.id === item.id;
        return (
          <div key={item.id} style={{ borderBottom: "1px solid #F8FAFC" }}>
            <div style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                  {item.brand} {item.model}
                  {item.qty > 1 && <span style={{ fontSize: 10, color: "#6366F1", fontWeight: 700, marginLeft: 6, background: "#EEF2FF", padding: "1px 6px", borderRadius: 8 }}>×{item.qty}</span>}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                  {[item.processor, item.ram, item.ssd, item.condition].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#EF4444" }}>Trader: {fmtAED(item.trader_price)}</span>
                  <span style={{ fontSize: 10, color: "#6366F1", fontWeight: 700 }}>Sell: {fmtAED(item.your_price)}</span>
                  <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>Profit: {fmtAED(profit)}</span>
                </div>
                {item.notes && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{item.notes}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <button onClick={() => setShowSell(isSelling ? null : item)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: isSelling ? "#F1F5F9" : "#10B981", color: isSelling ? "#64748B" : "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {isSelling ? "Cancel" : "Sold ✓"}
                </button>
                <button onClick={() => deleteItem(item.id)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FFF5F5", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            </div>

            {/* Mark sold inline form */}
            {isSelling && (
              <div style={{ padding: "8px 14px 12px", background: "#F0FDF4", borderTop: "1px solid #BBF7D0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#059669", marginBottom: 6 }}>
                  Profit on this sale: {fmtAED(profit)} · Client goes directly to {activeCustomer?.name}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={clientName} onChange={e => setClientName(e.target.value)}
                    placeholder="Client name (for your records)"
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #BBF7D0", fontSize: 12, outline: "none", background: "#fff" }} />
                  <button onClick={() => markSold(item)} disabled={selling || !clientName.trim()}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: selling ? "#E2E8F0" : "#10B981", color: selling ? "#94A3B8" : "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {selling ? "..." : "Confirm"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Sales history + settlement */}
      {sales.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A" }}>
              Sales History
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {totalOwed > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706" }}>{fmtAED(totalOwed)} owed</span>}
              <span style={{ fontSize: 10, color: "#94A3B8" }}>{fmtAED(totalProfit)} total profit</span>
            </div>
          </div>
          {sales.map(s => (
            <div key={s.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: "1px solid #F8FAFC",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{s.client_name}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>
                  {new Date(s.sold_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {" · "}{fmtAED(s.sold_price)} · profit {fmtAED(s.sold_price - s.trader_price)}
                </div>
              </div>
              {s.settled ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#10B981", background: "#ECFDF5", padding: "2px 8px", borderRadius: 20 }}>✓ Settled</span>
              ) : (
                <button onClick={() => markSettled(s.id)}
                  style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#D97706", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  Mark Settled
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
