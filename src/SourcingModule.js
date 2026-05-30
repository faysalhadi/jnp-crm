import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import DealDetail from "./components/sourcing/DealDetail";
import SourcingDealList from "./components/sourcing/SourcingDealList";
import AnalyzeTab from "./components/sourcing/AnalyzeTab";
import {
  DealCard, NewDealModal, GmailSheet, SectionToggle,
  SupplierDetail, SuppliersList, AddSupplierModal
} from "./components/sourcing/SupplierComponents";
import {
  STAGES, STAGE_MAP, DEFAULT_RATE,
} from "./components/sourcing/SourcingHelpers";
import { hoursUntil } from "./components/sourcing/SourcingHelpers";

// ══════════════════════════════════════════════════════════════════════════════
export default function SourcingModule({ anthropicKey, onAddToStock }) {
  const [deals,       setDeals]       = useState([]);
  const [suppliers,   setSuppliers]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [section,     setSection]     = useState("deals");   // "deals" | "suppliers"
  const [selected,    setSelected]    = useState(null);      // deal id
  const [selectedSup, setSelectedSup] = useState(null);      // supplier id
  const [showNew,     setShowNew]     = useState(false);
  const [showAddSup,  setShowAddSup]  = useState(false);
  const [showGmail,   setShowGmail]   = useState(false);
  const [rate]                        = useState(DEFAULT_RATE);
  const [prefillForm, setPrefillForm] = useState(null);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("sourcing_deals")
      .select("*").order("created_at", { ascending: false });
    setDeals(data || []);
    setLoading(false);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("customers").select("*").eq("contact_type", "supplier").order("name");
    setSuppliers(data || []);
  }, []);

  useEffect(() => { loadDeals(); loadSuppliers(); }, [loadDeals, loadSuppliers]);

  const selectedDeal = deals.find(d => d.id === selected);
  const selectedSupplier = suppliers.find(s => s.id === selectedSup);

  // ── deal detail (from either section) ─────────────────────────────────────
  if (selectedDeal) {
    return (
      <DealDetail
        deal={selectedDeal}
        suppliers={suppliers}
        rate={rate}
        anthropicKey={anthropicKey}
        onBack={() => setSelected(null)}
        onUpdate={updated => {
          setDeals(ds => ds.map(d => d.id === updated.id ? updated : d));
          if (updated.status === "in_stock" && onAddToStock) onAddToStock();
        }}
      />
    );
  }

  // ── supplier detail ────────────────────────────────────────────────────────
  if (selectedSupplier) {
    return (
      <SupplierDetail
        supplier={selectedSupplier}
        deals={deals}
        rate={rate}
        onBack={() => setSelectedSup(null)}
        onSelectDeal={id => setSelected(id)}
        onUpdate={updated => setSuppliers(ss => ss.map(s => s.id === updated.id ? updated : s))}
        onDelete={id => { setSuppliers(ss => ss.filter(s => s.id !== id)); setSelectedSup(null); }}
      />
    );
  }

  // ── analyze tab ───────────────────────────────────────────────────────────
  if (section === "analyze") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <SectionToggle section={section} setSection={setSection} deals={deals} suppliers={suppliers} />
        <AnalyzeTab anthropicKey={anthropicKey} />
      </div>
    );
  }

  // ── suppliers list ─────────────────────────────────────────────────────────
  if (section === "suppliers") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Section toggle header */}
        <SectionToggle section={section} setSection={setSection} deals={deals} suppliers={suppliers} />
        <SuppliersList
          suppliers={suppliers}
          deals={deals}
          rate={rate}
          onSelect={id => setSelectedSup(id)}
          onAdd={() => setShowAddSup(true)}
        />
        {showAddSup && (
          <AddSupplierModal
            onClose={() => setShowAddSup(false)}
            onCreate={s => { setSuppliers(ss => [...ss, s].sort((a,b) => a.name.localeCompare(b.name))); setShowAddSup(false); }}
          />
        )}
      </div>
    );
  }

  // ── deals pipeline ─────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Section toggle header */}
      <SectionToggle section={section} setSection={setSection} deals={deals} suppliers={suppliers} />
      <SourcingDealList
        deals={deals}
        loading={loading}
        rate={rate}
        setSelected={setSelected}
        showNew={showNew}
        setShowNew={setShowNew}
        showGmail={showGmail}
        setShowGmail={setShowGmail}
        setPrefillForm={setPrefillForm}
        prefillForm={prefillForm}
        anthropicKey={anthropicKey}
        suppliers={suppliers}
        setDeals={setDeals}
      />
    </div>
  );
}

// ── Dashboard alerts hook ─────────────────────────────────────────────────────
export function useSourcingAlerts() {
  const [alerts, setAlerts] = useState({ bidsDue: [], inTransit: 0, arrived: 0, paymentDue: 0 });
  useEffect(() => {
    supabase.from("sourcing_deals")
      .select("id, supplier_name, lot_name, status, bid_deadline")
      .then(({ data }) => {
        const rows = data || [];
        setAlerts({
          bidsDue:    rows.filter(x => x.status === "evaluating" && x.bid_deadline &&
                                       hoursUntil(x.bid_deadline) <= 24 && hoursUntil(x.bid_deadline) >= 0),
          inTransit:  rows.filter(x => x.status === "in_transit").length,
          arrived:    rows.filter(x => x.status === "arrived").length,
          paymentDue: rows.filter(x => x.status === "payment_due").length,
        });
      });
  }, []);
  return alerts;
}
