import React, { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "../supabase";
import { daysSince, monthRevenue } from "../utils/helpers";

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastMsgMap, setLastMsgMap] = useState({});
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [activeDealId, setActiveDealId] = useState(null);
  const [view, setView] = useState("list");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("all");
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactModalPreType, setContactModalPreType] = useState(null);
  const [newCustomer, setNewCustomer] = useState({
    name: "", number: "", notes: ""
  });
  const [newDeal, setNewDeal] = useState({
    brand: "", model: "", value: ""
  });
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLossReason, setShowLossReason] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const { data: custs } = await supabase
      .from("customers")
      .select("*, deals(*)")
      .order("last_active", { ascending: false });
    setCustomers(custs || []);
    setLoading(false);

    const dealIds = [];
    const dealToCustomer = {};
    (custs || []).forEach(c =>
      (c.deals || []).forEach(d => {
        dealIds.push(d.id);
        dealToCustomer[d.id] = c.id;
      })
    );
    if (!dealIds.length) return;
    const { data: msgs } = await supabase
      .from("messages")
      .select("deal_id, role, content, sent, ts")
      .in("deal_id", dealIds)
      .order("ts", { ascending: false })
      .limit(1000);
    const map = {};
    (msgs || []).forEach(msg => {
      const cid = dealToCustomer[msg.deal_id];
      if (cid && !map[cid]) map[cid] = msg;
    });
    setLastMsgMap(map);
  }, []);

  const activeCustomer = customers.find(c => c.id === activeCustomerId);
  const activeDeal = activeCustomer?.deals?.find(d => d.id === activeDealId);

  const openDeals = customers.reduce((a, c) => a + (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost").length, 0);
  const closedDeals = customers.reduce((a, c) => a + (c.deals || []).filter(d => d.stage === "closed").length, 0);
  const revenue = monthRevenue(customers);

  const filtered = customers
    .filter(c => {
      const cType = c.contact_type || "client";
      if (contactTypeFilter !== "all" && cType !== contactTypeFilter) return false;
      if (search) return c.name.toLowerCase().includes(search.toLowerCase()) || (c.number || "").includes(search);
      if (filter === "urgent") return c.urgent;
      if (filter === "overdue") return daysSince(c.last_active) >= 1 && (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
      if (filter === "vip") return c.tier === "vip";
      if (filter === "cold") return c.tier === "cold";
      return true;
    })
    .sort((a, b) => {
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      const aTime = a.last_activity_at || a.last_active;
      const bTime = b.last_activity_at || b.last_active;
      return new Date(bTime) - new Date(aTime);
    });

  async function addCustomer() {
    if (!newCustomer.name.trim()) return;
    const { data: c } = await supabase
      .from("customers")
      .insert({
        name: newCustomer.name.trim(),
        number: newCustomer.number.trim(),
        notes: newCustomer.notes.trim(),
        tier: "cold",
        urgent: false,
      })
      .select()
      .single();
    if (!c) return;
    const { data: d } = await supabase
      .from("deals")
      .insert({ customer_id: c.id, stage: "new_inquiry" })
      .select()
      .single();
    await loadCustomers();
    setActiveCustomerId(c.id);
    setActiveDealId(d?.id);
    setNewCustomer({ name: "", number: "", notes: "" });
    setView("detail");
  }

  async function deleteCustomer(customerId) {
    // delete related records first to avoid FK constraint errors
    const { data: deals } = await supabase.from("deals").select("id").eq("customer_id", customerId);
    const dealIds = (deals || []).map(d => d.id);
    if (dealIds.length > 0) {
      await supabase.from("deal_items").delete().in("deal_id", dealIds);
      await supabase.from("deals").delete().in("id", dealIds);
    }
    await supabase.from("messages").delete().eq("customer_id", customerId);
    await supabase.from("follow_ups").delete().eq("customer_id", customerId);
    await supabase.from("activity_log").delete().eq("customer_id", customerId);
    const { error } = await supabase.from("customers").delete().eq("id", customerId);
    if (error) {
      alert("Delete failed: " + error.message);
      console.error("deleteCustomer error:", error);
      return;
    }
    setShowDeleteConfirm(false);
    setActiveCustomerId(null);
    setActiveDealId(null);
    setView("list");
    await loadCustomers();
  }

  async function updateCustomer(customerId, fields) {
    await supabase
      .from("customers")
      .update({ ...fields, last_active: new Date().toISOString() })
      .eq("id", customerId);
    await loadCustomers();
  }

  async function updateDeal(dealId, fields) {
    await supabase.from("deals").update(fields).eq("id", dealId);
    await loadCustomers();
  }

  async function addDeal(customerId, dealData) {
    const { data: d } = await supabase
      .from("deals")
      .insert({
        customer_id: customerId,
        brand: dealData.brand,
        model: dealData.model,
        value: dealData.value ? parseFloat(dealData.value) : null,
        stage: "new_inquiry",
      })
      .select()
      .single();
    await loadCustomers();
    setActiveDealId(d?.id);
    setShowAddDeal(false);
    setNewDeal({ brand: "", model: "", value: "" });
  }

  return (
    <CustomerContext.Provider value={{
      customers, setCustomers,
      loading,
      lastMsgMap,
      activeCustomerId, setActiveCustomerId,
      activeDealId, setActiveDealId,
      activeCustomer,
      activeDeal,
      view, setView,
      filter, setFilter,
      search, setSearch,
      contactTypeFilter, setContactTypeFilter,
      pendingSuggestion, setPendingSuggestion,
      showContactModal, setShowContactModal,
      contactModalPreType, setContactModalPreType,
      newCustomer, setNewCustomer,
      newDeal, setNewDeal,
      showAddDeal, setShowAddDeal,
      showDeleteConfirm, setShowDeleteConfirm,
      showLossReason, setShowLossReason,
      openDeals,
      closedDeals,
      revenue,
      filtered,
      loadCustomers,
      addCustomer,
      deleteCustomer,
      updateCustomer,
      updateDeal,
      addDeal,
    }}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomers() {
  const context = useContext(CustomerContext);
  if (!context) throw new Error(
    "useCustomers must be used within CustomerProvider"
  );
  return context;
}
