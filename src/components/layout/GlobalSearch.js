import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";
import { useStock } from "../../context/StockContext";
import { useUI } from "../../context/UIContext";
import { useTraders } from "../../context/TradersContext";
import { useProfile } from "../../context/ProfileContext";
import { effectiveStatus, isHoldActive } from "../../utils/holds";

export default function GlobalSearch({ onClose }) {
  const [query, setQuery]           = useState("");
  const [noteResults, setNoteResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);

  const { customers, setActiveCustomerId, setActiveDealId, setView } = useCustomers();
  const { stock }          = useStock();
  const { setActiveTab }   = useUI();
  const { traderListings } = useTraders();
  const { isOwner, isViewingAs } = useProfile();

  // Trader listings and the trader/supplier contact book are owner territory.
  const showTraderResults = isOwner && !isViewingAs;

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced notes search (Supabase)
  useEffect(() => {
    if (query.length < 3) { setNoteResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      let noteQuery = supabase
        .from("activity_log")
        .select("customer_id, note, logged_at")
        .ilike("note", `%${query}%`)
        .eq("activity_type", "note")
        .order("logged_at", { ascending: false })
        .limit(5);
      // This searched every client's notes regardless of role. Restricted
      // viewers only ever see notes on the clients assigned to them.
      if (!showTraderResults) {
        noteQuery = noteQuery.in("customer_id", customers.map(c => c.id));
      }
      const { data } = await noteQuery;
      setNoteResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query, showTraderResults, customers]); // eslint-disable-line

  const q = query.toLowerCase().trim();

  const clientResults = q.length < 2 ? [] : customers
    .filter(c => !c.contact_type || c.contact_type === "client" || c.contact_type === "walkin")
    .filter(c => c.name?.toLowerCase().includes(q) || (c.number || "").includes(q))
    .slice(0, 5);

  const contactResults = (q.length < 2 || !showTraderResults) ? [] : customers
    .filter(c => c.contact_type === "trader" || c.contact_type === "supplier")
    .filter(c => c.name?.toLowerCase().includes(q) || (c.number || "").includes(q))
    .slice(0, 4);

  const dealResults = q.length < 2 ? [] : customers
    .flatMap(c => (c.deals || [])
      .filter(d => d.stage !== "closed" && d.stage !== "lost")
      .filter(d =>
        (d.brand || "").toLowerCase().includes(q) ||
        (d.model || "").toLowerCase().includes(q)
      )
      .map(d => ({ customer: c, deal: d }))
    )
    .slice(0, 5);

  const stockResults = q.length < 2 ? [] : stock
    .filter(s =>
      (s.brand || "").toLowerCase().includes(q) ||
      (s.model || "").toLowerCase().includes(q) ||
      (s.serial_number || "").toLowerCase().includes(q) ||
      (s.processor || "").toLowerCase().includes(q)
    )
    .slice(0, 5);

  const traderResults = (q.length < 2 || !showTraderResults) ? [] : traderListings
    .filter(t =>
      (t.brand || "").toLowerCase().includes(q) ||
      (t.model || "").toLowerCase().includes(q) ||
      (t.trader_name || "").toLowerCase().includes(q)
    )
    .slice(0, 4);

  const hasResults = clientResults.length || contactResults.length || dealResults.length ||
                     stockResults.length || traderResults.length || noteResults.length;

  function goToClient(c) {
    const deal = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost")[0] || (c.deals || [])[0];
    setActiveCustomerId(c.id);
    setActiveDealId(deal?.id || null);
    setView("detail");
    setActiveTab(c.contact_type === "trader" ? "traders" : c.contact_type === "supplier" ? "sourcing" : "customers");
    onClose();
  }

  function goToDeal(customer, deal) {
    setActiveCustomerId(customer.id);
    setActiveDealId(deal.id);
    setView("detail");
    setActiveTab("customers");
    onClose();
  }

  function goToStock() {
    setActiveTab("stock");
    onClose();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 400, display: "flex", flexDirection: "column" }}
      onClick={onClose}>
      <div
        style={{ background: "#fff", maxWidth: 480, width: "100%", margin: "0 auto", borderRadius: "0 0 24px 24px", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}
        onClick={e => e.stopPropagation()}>

        {/* ── Input row ── */}
        <div style={{ padding: "14px 14px 12px", display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid #F1F5F9" }}>
          <span style={{ fontSize: 18, flexShrink: 0, color: "#94A3B8" }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Escape" && onClose()}
            placeholder="Search clients, stock, deals, notes..."
            style={{ flex: 1, border: "none", outline: "none", fontSize: 16, color: "#0F172A", background: "transparent" }}
          />
          {query && (
            <button onClick={() => setQuery("")}
              style={{ border: "none", background: "none", color: "#94A3B8", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
          )}
          <button onClick={onClose}
            style={{ border: "none", background: "#F1F5F9", color: "#64748B", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, cursor: "pointer", flexShrink: 0 }}>
            Cancel
          </button>
        </div>

        {/* ── Results ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 28px" }}>

          {q.length < 2 && (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#CBD5E1" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.8 }}>
                Search across clients, stock,<br />open deals, and your notes
              </div>
            </div>
          )}

          {q.length >= 2 && !hasResults && !searching && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🤷</div>
              <div style={{ fontSize: 13, color: "#94A3B8" }}>No results for "{query}"</div>
            </div>
          )}

          {clientResults.length > 0 && (
            <Section title="CLIENTS">
              {clientResults.map(c => {
                const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
                return (
                  <ResultRow key={c.id} onClick={() => goToClient(c)}
                    icon={<Av name={c.name} color="#6366F1" bg="#EEF2FF" />}
                    title={c.name}
                    sub={deal ? ([deal.brand, deal.model].filter(Boolean).join(" ") || "Open deal") + (deal.budget ? ` · AED ${Number(deal.budget).toLocaleString()}` : "") : c.number || "Client"}
                    badge={c.contact_type === "walkin" ? { label: "Walk-in", color: "#6366F1" } : null}
                  />
                );
              })}
            </Section>
          )}

          {contactResults.length > 0 && (
            <Section title="TRADERS & SUPPLIERS">
              {contactResults.map(c => (
                <ResultRow key={c.id} onClick={() => goToClient(c)}
                  icon={<Av name={c.name} color={c.contact_type === "supplier" ? "#2563EB" : "#D97706"} bg={c.contact_type === "supplier" ? "#EFF6FF" : "#FFFBEB"} />}
                  title={c.name}
                  sub={c.location || c.number || ""}
                  badge={{ label: c.contact_type === "supplier" ? "Supplier" : "Trader", color: c.contact_type === "supplier" ? "#2563EB" : "#D97706" }}
                />
              ))}
            </Section>
          )}

          {dealResults.length > 0 && (
            <Section title="OPEN DEALS">
              {dealResults.map(({ customer, deal }) => (
                <ResultRow key={deal.id} onClick={() => goToDeal(customer, deal)}
                  icon={<span style={{ fontSize: 22 }}>📋</span>}
                  title={customer.name}
                  sub={([deal.brand, deal.model].filter(Boolean).join(" ") || "Device TBD") + (deal.budget ? ` · AED ${Number(deal.budget).toLocaleString()}` : "") + ` · ${(deal.stage || "").replace(/_/g, " ")}`}
                />
              ))}
            </Section>
          )}

          {stockResults.length > 0 && (
            <Section title="STOCK">
              {stockResults.map(s => (
                <ResultRow key={s.id} onClick={() => goToStock()}
                  icon={<span style={{ fontSize: 22 }}>📦</span>}
                  title={`${s.brand || ""} ${s.model || ""}`.trim() || "Device"}
                  sub={[s.processor, s.ram, s.ssd, s.condition].filter(Boolean).join(" · ") + (s.max_price ? ` · AED ${s.max_price}` : "")}
                  badge={{ label: effectiveStatus(s) === "available" ? "Available" : isHoldActive(s) ? "On hold" : "Sold", color: effectiveStatus(s) === "available" ? "#10B981" : isHoldActive(s) ? "#D97706" : "#94A3B8" }}
                />
              ))}
            </Section>
          )}

          {traderResults.length > 0 && (
            <Section title="TRADER INVENTORY">
              {traderResults.map((t, i) => (
                <ResultRow key={i}
                  icon={<span style={{ fontSize: 22 }}>🏪</span>}
                  title={`${t.brand || ""} ${t.model || ""}`.trim() || "Device"}
                  sub={[t.trader_name, t.quantity ? `×${t.quantity}` : null, t.price ? `${t.currency || "AED"} ${t.price}` : null].filter(Boolean).join(" · ")}
                />
              ))}
            </Section>
          )}

          {noteResults.length > 0 && (
            <Section title="IN YOUR NOTES">
              {noteResults.map((n, i) => {
                const customer = customers.find(c => c.id === n.customer_id);
                return (
                  <ResultRow key={i} onClick={customer ? () => goToClient(customer) : null}
                    icon={<span style={{ fontSize: 22 }}>📝</span>}
                    title={customer?.name || "Unknown client"}
                    sub={(n.note || "").slice(0, 70) + ((n.note || "").length > 70 ? "…" : "")}
                  />
                );
              })}
            </Section>
          )}

          {searching && (
            <div style={{ textAlign: "center", padding: "16px", color: "#94A3B8", fontSize: 12 }}>
              Searching notes...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 1, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{children}</div>
    </div>
  );
}

function ResultRow({ icon, title, sub, badge, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 12, background: "#F8FAFC",
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "#64748B", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
      </div>
      {badge && (
        <span style={{ fontSize: 9, fontWeight: 700, color: badge.color, background: badge.color + "18", padding: "2px 7px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" }}>
          {badge.label}
        </span>
      )}
      {onClick && <span style={{ fontSize: 12, color: "#CBD5E1", flexShrink: 0 }}>›</span>}
    </div>
  );
}

function Av({ name, color, bg }) {
  return (
    <div style={{ width: 38, height: 38, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color, textTransform: "uppercase" }}>
      {(name || "?")[0]}
    </div>
  );
}
