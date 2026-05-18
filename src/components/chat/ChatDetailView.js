import React, { useState } from "react";
import { supabase } from "../../supabase";
import Badge from "../ui/Badge";
import StageBar from "../ui/StageBar";
import Spinner from "../ui/Spinner";
import LinkStockModal from "../modals/LinkStockModal";
import ReservationModal from "../modals/ReservationModal";
import { STAGES, TIERS, PAYMENT_STATUSES, LOSS_REASONS } from "../../constants";
import { daysSince, timeAgo } from "../../utils/helpers";

export default function ChatDetailView({
  isMobile,
  activeCustomer, activeDeal, activeDealId, setActiveDealId,
  activeCustomerId, setActiveCustomerId,
  messages, setMessages,
  customers,
  view, setView,
  msgLoading,
  incomingText, setIncomingText,
  replyMode, setReplyMode,
  replyingToId, setReplyingToId,
  directReplyText, setDirectReplyText,
  generatedReply, setGeneratedReply,
  generatedReplyLoading, setGeneratedReplyLoading,
  editingGenerated, setEditingGenerated,
  pendingSuggestion, setPendingSuggestion,
  copied, setCopied,
  editSent, setEditSent,
  editingName, setEditingName,
  nameInput, setNameInput,
  editingNumber, setEditingNumber,
  numberInput, setNumberInput,
  outreachMode, setOutreachMode,
  outreachReason, setOutreachReason,
  outreachCustom, setOutreachCustom,
  showAddDeal, setShowAddDeal,
  showDeleteConfirm, setShowDeleteConfirm,
  showLossReason, setShowLossReason,
  showReceipt, setShowReceipt,
  receiptPaymentMethod, setReceiptPaymentMethod,
  showSupplierReply, setShowSupplierReply,
  supplierReplyCtx, setSupplierReplyCtx,
  supplierReplyGmail, setSupplierReplyGmail,
  supplierReplyWA, setSupplierReplyWA,
  supplierReplyLoading, setSupplierReplyLoading,
  copiedSupGmail, setCopiedSupGmail,
  copiedSupWA, setCopiedSupWA,
  showCheckTraders, setShowCheckTraders,
  checkTradersResults, setCheckTradersResults,
  checkTradersLoading, setCheckTradersLoading,
  showLinkStock, setShowLinkStock,
  linkStockDeal, setLinkStockDeal,
  showReservation, setShowReservation,
  newDeal, setNewDeal,
  anthropicKey, cachedStock,
  bottomRef,
  NAV_TABS, activeTab, setActiveTab,
  stock,
  loadCustomers, loadStock, refreshCachedStock, loadTodaySales,
  updateCustomer, updateDeal, addDeal, deleteCustomer,
  moveStage, handleConfirmSale, handleReserveDevice,
  addIncomingMessage, generateAIReply, sendAIReply,
  sendDirectReply, generateOpeningMessage,
  confirmSent, markNotSent, copyMsg,
  generateOutreach, generateSupplierReply,
  checkTradersForDeal,
  buildReceiptText, saveReceiptNumber,
  traderListings,
  setShowSideDrawer,
  showToast,
}) {
    const tier = TIERS[activeCustomer.tier] || TIERS.cold;
    const overdue = daysSince(activeCustomer.last_active) >= 1 && (activeCustomer.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
    const closedDealValue = (activeCustomer.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
    const payStatus = PAYMENT_STATUSES.find(p => p.id === activeDeal?.payment_status) || PAYMENT_STATUSES[0];

    return (
      <div style={isMobile
        ? { minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }
        : { minHeight: "100vh", background: "#F8FAFC", display: "flex" }}>
        {/* Desktop sidebar in detail view */}
        {!isMobile && (
          <div style={{ width: 280, flexShrink: 0, background: "#fff", borderRight: "1px solid #F1F5F9", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 40 }}>
            <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💻</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>JNP CRM</div>
                  <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, letterSpacing: 0.5 }}>LAPTOP FOR LESS</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
              {NAV_TABS.map(t => (
                <button key={t.key}
                  onClick={() => { setActiveTab(t.key); setView("list"); setActiveCustomerId(null); setActiveDealId(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%", fontSize: 14,
                           fontWeight: activeTab === t.key ? 700 : 500, background: activeTab === t.key ? "#EEF2FF" : "transparent",
                           color: activeTab === t.key ? "#6366F1" : "#64748B", transition: "all 0.15s" }}>
                  <span style={{ fontSize: 19 }}>{t.icon}</span>
                  <span style={{ flex: 1 }}>{t.label}</span>
                  {activeTab === t.key && <div style={{ width: 4, height: 20, borderRadius: 2, background: "#6366F1" }} />}
                </button>
              ))}
            </div>
            <div style={{ padding: "16px 20px", borderTop: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#6366F1" }}>F</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Faisal</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>Owner</div>
                </div>
                <button onClick={() => setView("settings")} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 15 }}>⚙️</button>
              </div>
            </div>
          </div>
        )}
        {/* detail content */}
        <div style={isMobile ? { flex: 1, display: "flex", flexDirection: "column" } : { marginLeft: 280, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", maxWidth: "calc(100vw - 280px)" }}>
        {/* header */}
        <div style={{ background: "#fff", padding: "12px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={() => { setView("list"); setActiveCustomerId(null); setActiveDealId(null); setPendingSuggestion(null); }}
              style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {editingName ? (
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={async () => {
                      if (nameInput.trim() && nameInput.trim() !== activeCustomer.name) {
                        await supabase.from('customers').update({ name: nameInput.trim() }).eq('id', activeCustomerId);
                        await loadCustomers();
                      }
                      setEditingName(false);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingName(false); }}
                    style={{ fontWeight: 800, fontSize: 16, color: "#0F172A", border: "none", borderBottom: "2px solid #6366F1", outline: "none", background: "transparent", padding: "1px 0", minWidth: 60, maxWidth: 160 }}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingName(true); setNameInput(activeCustomer.name); }}
                    style={{ fontWeight: 800, fontSize: 16, color: "#0F172A", cursor: "text", borderBottom: "1px dashed transparent" }}
                    title="Tap to edit name"
                  >{activeCustomer.name}</span>
                )}
                {activeCustomer.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>🔴 URGENT</Badge>}
                {activeCustomer.contact_type === "trader"   && <Badge color="#D97706" bg="#FFFBEB" small>🟡 TRADER</Badge>}
                {activeCustomer.contact_type === "supplier" && <Badge color="#2563EB" bg="#EFF6FF" small>🔵 SUPPLIER</Badge>}
                {activeCustomer.contact_type === "walkin"   && <Badge color="#6366F1" bg="#EEF2FF" small>⚡ WALK-IN</Badge>}
                {(!activeCustomer.contact_type || activeCustomer.contact_type === "client") && <Badge color={tier.color} bg={tier.bg} small>{tier.icon} {tier.label}</Badge>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                {editingNumber ? (
                  <input
                    autoFocus
                    value={numberInput}
                    onChange={e => setNumberInput(e.target.value)}
                    onBlur={async () => {
                      if (numberInput.trim() !== activeCustomer.number) {
                        await supabase.from('customers').update({ number: numberInput.trim() }).eq('id', activeCustomerId);
                        await loadCustomers();
                      }
                      setEditingNumber(false);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingNumber(false); }}
                    placeholder="Phone number"
                    style={{ fontSize: 12, color: "#6366F1", border: "none", borderBottom: "2px solid #6366F1", outline: "none", background: "transparent", padding: "1px 0", minWidth: 80, maxWidth: 160, fontWeight: 600 }}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingNumber(true); setNumberInput(activeCustomer.number || ''); }}
                    style={{ fontSize: 12, color: "#6366F1", fontWeight: 600, cursor: "text" }}
                    title="Tap to edit number"
                  >
                    {activeCustomer.number ? `📱 ${activeCustomer.number}` : '+ Add number'}
                  </span>
                )}
                {activeCustomer.number && !editingNumber && (
                  <a href={`https://wa.me/${activeCustomer.number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "#25D366", fontWeight: 700, textDecoration: "none" }}>
                    WA
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setShowSideDrawer(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 14 }}>📊</button>
              <button onClick={() => setShowAddDeal(true)} style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", fontSize: 11, fontWeight: 700, color: "#6366F1", cursor: "pointer" }}>+ Deal</button>
              <button onClick={() => setShowDeleteConfirm(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", cursor: "pointer", fontSize: 14 }}>🗑</button>
            </div>
          </div>

          {/* deal tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
            {(activeCustomer.deals || []).map((d, i) => (
              <button key={d.id} onClick={() => setActiveDealId(d.id)}
                style={{ padding: "5px 13px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", background: d.id === activeDealId ? "#6366F1" : "#F1F5F9", color: d.id === activeDealId ? "#fff" : "#64748B", transition: "all 0.15s" }}>
                {d.brand || "Deal"} {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* ── TRADER action buttons ── */}
        {activeCustomer.contact_type === "trader" && (
          <div style={{ display: "flex", gap: 8, margin: "10px 12px 0" }}>
            {[
              { label: "💰 Buy From", ctx: `I want to buy devices from ${activeCustomer.name}. Ask what they have available and at what price.` },
              { label: "💵 Sell To",  ctx: `I want to sell devices to ${activeCustomer.name}. Mention what stock I have available.` },
            ].map(({ label, ctx }) => (
              <button key={label} onClick={() => {
                setOutreachReason("Custom message");
                setOutreachCustom(ctx);
                setOutreachMode(true);
              }} style={{
                flex: 1, padding: "9px 6px", borderRadius: 12, border: "1.5px solid #FDE68A",
                background: "#FFFBEB", color: "#D97706", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── SUPPLIER action buttons ── */}
        {activeCustomer.contact_type === "supplier" && (
          <div style={{ display: "flex", gap: 8, margin: "10px 12px 0" }}>
            <button onClick={() => {
              const email = window.prompt("Paste the email content from " + activeCustomer.name + ":");
              if (!email?.trim()) return;
              setOutreachReason("Custom message");
              setOutreachCustom("Reply professionally to this email from the supplier: " + email.trim());
              setOutreachMode(true);
            }} style={{
              flex: 1, padding: "9px 6px", borderRadius: 12, border: "1.5px solid #FECACA",
              background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>
              📧 Check Gmail
            </button>
            <button onClick={() => {
              setSupplierReplyCtx(""); setSupplierReplyGmail("");
              setSupplierReplyWA(""); setShowSupplierReply(true);
            }} style={{
              flex: 1, padding: "9px 6px", borderRadius: 12, border: "1.5px solid #BFDBFE",
              background: "#EFF6FF", color: "#2563EB", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>
              ✍️ Generate Reply
            </button>
          </div>
        )}

        {/* deal card */}
        {activeDeal && (
          <div style={{ margin: "10px 12px 0", background: "#fff", borderRadius: 18, padding: "14px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                  {[activeDeal.brand, activeDeal.model].filter(Boolean).join(" ") || "Device TBD"}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                  {[activeDeal.ram, activeDeal.storage, activeDeal.screen, activeDeal.condition].filter(Boolean).join(" · ") || "Extracting specs..."}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {activeDeal.budget && <div style={{ fontSize: 13, fontWeight: 700, color: "#6366F1" }}>AED {Number(activeDeal.budget).toLocaleString()}</div>}
                {activeDeal.value && <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>Sold: AED {Number(activeDeal.value).toLocaleString()}</div>}
              </div>
            </div>

            <StageBar stageId={activeDeal.stage} />

            {/* quick info pills */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {activeDeal.activation_lock !== "unknown" && activeDeal.brand === "MacBook" && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: activeDeal.activation_lock === "yes" ? "#FEF2F2" : "#ECFDF5", color: activeDeal.activation_lock === "yes" ? "#EF4444" : "#10B981", fontWeight: 700 }}>
                  🔒 {activeDeal.activation_lock === "yes" ? "Locked" : "Unlocked"}
                </span>
              )}
              {activeDeal.charger !== "unknown" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>🔌 Charger: {activeDeal.charger}</span>}
              {activeDeal.box !== "unknown" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>📦 Box: {activeDeal.box}</span>}
            </div>

            {overdue && <div style={{ marginTop: 8, fontSize: 11, color: "#EF4444", fontWeight: 700 }}>⚠️ No activity for {daysSince(activeCustomer.last_active)}d — follow up!</div>}

            {/* payment status */}
            {activeDeal.stage === "closed" && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 5, letterSpacing: 0.5 }}>PAYMENT</div>
                <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                  {PAYMENT_STATUSES.map(p => (
                    <button key={p.id} onClick={() => updateDeal({ payment_status: p.id })}
                      style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", background: activeDeal.payment_status === p.id ? p.color : p.bg, color: activeDeal.payment_status === p.id ? "#fff" : p.color, transition: "all 0.15s" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setReceiptPaymentMethod("Cash"); setShowReceipt(true); }}
                  style={{ width: "100%", padding: "8px", borderRadius: 10, border: "1.5px solid #6366F1", background: "#EEF2FF", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  🧾 Generate Receipt
                </button>
              </div>
            )}

            {/* serial number */}
            <div style={{ marginTop: 10 }}>
              <input value={activeDeal.serial_number || ""} onChange={e => updateDeal({ serial_number: e.target.value })} placeholder="Serial / IMEI number (optional)"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box", color: "#475569" }} />
            </div>

            {/* AI stage suggestion */}
            {pendingSuggestion && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
                <div style={{ fontSize: 11, color: "#6366F1", fontWeight: 700, marginBottom: 3 }}>🤖 AI Suggests</div>
                <div style={{ fontSize: 12, color: "#4338CA", marginBottom: 8 }}>{pendingSuggestion.reason}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => moveStage(pendingSuggestion.stage)}
                    style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Move → {STAGES.find(s => s.id === pendingSuggestion.stage)?.label}
                  </button>
                  <button onClick={() => setPendingSuggestion(null)}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #C7D2FE", background: "#fff", color: "#6366F1", fontSize: 11, cursor: "pointer" }}>
                    Ignore
                  </button>
                </div>
              </div>
            )}

            {/* check traders */}
            {activeDeal && activeDeal.stage !== "closed" && activeDeal.stage !== "lost" && (
              <div style={{ marginTop: 8 }}>
                <button onClick={checkTradersForDeal}
                  style={{ width: "100%", padding: "7px", borderRadius: 10, border: "1.5px solid #10B981", background: "#ECFDF5", color: "#059669", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🏪 Check Traders for This Device
                </button>
              </div>
            )}

            {/* manual stages */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>MOVE STAGE</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {STAGES.map(s => (
                  <button key={s.id} onClick={() => moveStage(s.id)}
                    style={{ padding: "4px 10px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", background: s.id === activeDeal.stage ? s.color : s.bg, color: s.id === activeDeal.stage ? "#fff" : s.color, transition: "all 0.15s" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* loss reason */}
            {activeDeal.stage === "lost" && (
              <div style={{ marginTop: 10 }}>
                <select value={activeDeal.loss_reason || ""} onChange={e => updateDeal({ loss_reason: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #FEE2E2", fontSize: 12, outline: "none", color: "#EF4444", background: "#FEF2F2" }}>
                  <option value="">Why was this lost?</option>
                  {LOSS_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            )}

            {closedDealValue > 0 && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#ECFDF5", fontSize: 12, color: "#10B981", fontWeight: 700 }}>
                💰 Total from {activeCustomer.name}: AED {closedDealValue.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* add deal modal */}
        {showAddDeal && (
          <div style={{ margin: "10px 12px 0", background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: "#0F172A" }}>New Deal</div>
            <select value={newDeal.brand} onChange={e => setNewDeal(p => ({ ...p, brand: e.target.value }))}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 8, outline: "none" }}>
              <option value="">Select brand</option>
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
            <input placeholder="Model (e.g. Air M2)" value={newDeal.model} onChange={e => setNewDeal(p => ({ ...p, model: e.target.value }))}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
            <input placeholder="Deal value in AED (if known)" value={newDeal.value} onChange={e => setNewDeal(p => ({ ...p, value: e.target.value }))} type="number"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 12, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addDeal} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add Deal</button>
              <button onClick={() => setShowAddDeal(false)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* delete confirm */}
        {showDeleteConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Delete {activeCustomer.name}?</div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>This will permanently delete this customer and all their deals and messages. This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={deleteCustomer} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#EF4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Yes, Delete</button>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MESSAGES ── */}
        <div style={{ flex: 1, padding: "12px", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "30px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", marginBottom: 20 }}>No messages yet</div>
              <div style={{ display: "flex", gap: 10, width: "100%" }}>
                <button onClick={() => { setReplyMode("myself"); setDirectReplyText(""); }}
                  style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ I'll start typing
                </button>
                <button onClick={generateOpeningMessage}
                  style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🤖 AI opens
                </button>
              </div>
            </div>
          )}

          {/* Imported from WhatsApp banner */}
          {messages.length > 0 && messages[0]?.ts && (Date.now() - new Date(messages[0].ts).getTime()) > 3600000 && (
            <div style={{ textAlign: "center", padding: "5px 12px", borderRadius: 8, background: "#F1F5F9", fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
              📱 Imported from WhatsApp
            </div>
          )}

          {/* Message list with inline reply buttons */}
          {(() => {
            // Compute which customer messages still need a reply
            const lastAssistantTs = messages
              .filter(m => m.role === "assistant" && m.sent && m.sent !== "NOT_SENT")
              .map(m => new Date(m.ts).getTime()).sort().pop() || 0;
            const unansweredIds = new Set(
              messages
                .filter(m => m.role === "customer" && new Date(m.ts).getTime() > lastAssistantTs)
                .map(m => m.id)
            );

            return messages.map(msg => {
              const isCustomer = msg.role === "customer";
              const isSent     = msg.sent && msg.sent !== "NOT_SENT";
              const isNotSent  = msg.sent === "NOT_SENT";
              const display    = isSent && msg.sent !== msg.content ? msg.sent : msg.content;
              const showReplyBtns = isCustomer && unansweredIds.has(msg.id) && replyingToId !== msg.id;

              return (
                <div key={msg.id}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: isCustomer ? "flex-start" : "flex-end", gap: 4 }}>
                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>
                      {isCustomer ? (msg.is_voice ? "🎤 Voice Note" : `👤 ${activeCustomer.name}`) : "You"} · {timeAgo(msg.ts)}
                    </div>
                    <div style={{
                      maxWidth: "84%", padding: "10px 13px", fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-line",
                      borderRadius: isCustomer ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                      background: isCustomer ? "#F1F5F9" : "#6366F1",
                      color:      isCustomer ? "#334155"  : "#fff",
                      border:     isCustomer ? "1px solid #E2E8F0" : "none",
                      opacity: isNotSent ? 0.45 : 1,
                    }}>
                      {display}
                    </div>
                    {isSent  && !isCustomer && <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>✓ Sent · {timeAgo(msg.ts)}</div>}
                    {isNotSent && !isCustomer && <div style={{ fontSize: 10, color: "#94A3B8" }}>Not sent</div>}
                  </div>

                  {/* Inline reply buttons — shown on each unanswered client message */}
                  {showReplyBtns && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button onClick={() => { setReplyingToId(msg.id); setReplyMode("myself"); setDirectReplyText(""); }}
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        ✏️ Reply Myself
                      </button>
                      <button onClick={() => generateAIReply(msg.id)}
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        🤖 AI Reply
                      </button>
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* AI generating spinner */}
          {generatedReplyLoading && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ padding: "10px 16px", borderRadius: "16px 4px 16px 16px", background: "#EEF2FF", border: "1px solid #C7D2FE", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} style={{ fontSize: 14, color: "#6366F1", animation: `pulse 1s ${d}s infinite` }}>●</span>
                ))}
                <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── SUPPLIER REPLY GENERATOR MODAL ── */}
        {showSupplierReply && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
            <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>✍️ Generate Reply</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{activeCustomer.name} · Supplier</div>
                  </div>
                  <button onClick={() => setShowSupplierReply(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>WHAT DO YOU WANT TO SAY?</div>
                <textarea value={supplierReplyCtx} onChange={e => setSupplierReplyCtx(e.target.value)} rows={3}
                  placeholder='e.g. "Accept their lot offer, ask for invoice and shipping quote"'
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 14 }} />

                <button onClick={generateSupplierReply} disabled={supplierReplyLoading} style={{
                  width: "100%", padding: 13, borderRadius: 12, border: "none", marginBottom: 18,
                  background: supplierReplyLoading ? "#E2E8F0" : "#2563EB",
                  color: supplierReplyLoading ? "#94A3B8" : "#fff",
                  fontWeight: 800, fontSize: 14, cursor: "pointer",
                }}>
                  {supplierReplyLoading ? "⏳ Generating…" : "⚡ Generate Gmail + WhatsApp"}
                </button>

                {supplierReplyGmail && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>📧 GMAIL — FORMAL</div>
                    <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                      {supplierReplyGmail}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(supplierReplyGmail); setCopiedSupGmail(true); setTimeout(() => setCopiedSupGmail(false), 2000); }}
                      style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupGmail ? "#ECFDF5" : "#F1F5F9", color: copiedSupGmail ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                      {copiedSupGmail ? "✓ Copied!" : "📋 Copy Gmail"}
                    </button>
                  </div>
                )}

                {supplierReplyWA && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>💬 WHATSAPP — SHORT</div>
                    <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                      {supplierReplyWA}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(supplierReplyWA); setCopiedSupWA(true); setTimeout(() => setCopiedSupWA(false), 2000); }}
                      style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupWA ? "#ECFDF5" : "#F1F5F9", color: copiedSupWA ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                      {copiedSupWA ? "✓ Copied!" : "📋 Copy WhatsApp"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* edit sent overlay */}
        {editSent && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 50 }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: "#0F172A" }}>✏️ Edit Before Sending</div>
              <textarea value={editSent.text} onChange={e => setEditSent(p => ({ ...p, text: e.target.value }))} rows={5}
                style={{ width: "100%", padding: 12, borderRadius: 12, border: "1.5px solid #C7D2FE", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.6 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => confirmSent(editSent.msgId, editSent.text)}
                  style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  Confirm Sent →
                </button>
                <button onClick={() => setEditSent(null)}
                  style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── INPUT BAR — always visible ── */}
        <div style={{ padding: "10px 12px 20px", background: "#fff", borderTop: "1px solid #F1F5F9", position: "sticky", bottom: 0 }}>

          {/* AI generated reply box — shown above inputs when ready */}
          {generatedReply && !generatedReplyLoading && (
            <div style={{ marginBottom: 12, background: "#EEF2FF", borderRadius: 14, padding: 12, border: "1px solid #C7D2FE" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", letterSpacing: 0.5, marginBottom: 6 }}>🤖 SUGGESTED REPLY</div>
              {editingGenerated ? (
                <textarea value={generatedReply} onChange={e => setGeneratedReply(e.target.value)} rows={3} autoFocus
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #6366F1", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", background: "#fff" }} />
              ) : (
                <div style={{ fontSize: 13, color: "#1E1B4B", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                  {generatedReply}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={async () => {
                  const text = generatedReply.trim();
                  await sendAIReply();
                  if (activeCustomer?.number) {
                    const number = activeCustomer.number.replace(/\D/g, "");
                    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
                  }
                }}
                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  📱 Send on WA
                </button>
                <button onClick={() => setEditingGenerated(v => !v)}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #C7D2FE", background: "#fff", color: "#6366F1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {editingGenerated ? "Done" : "✏️ Edit"}
                </button>
                <button onClick={() => { setGeneratedReply(""); setReplyingToId(null); setEditingGenerated(false); }}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  ❌ Skip
                </button>
              </div>
            </div>
          )}

          {/* ── PRIMARY ACTION BAR ── */}
          <div style={{ marginBottom: 8 }}>
            {/* Reserve — primary action for WhatsApp clients */}
            <button
              onClick={handleReserveDevice}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                marginBottom: 6,
              }}
            >
              🔒 Reserve Device
            </button>
            {/* Confirm Sale — secondary action */}
            <div style={{ textAlign: "center" }}>
              <button
                onClick={handleConfirmSale}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6366F1",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: "2px 8px",
                }}
              >
                ⚡ Confirm Sale instead →
              </button>
            </div>
          </div>

          {/* TOP ROW — paste client's incoming message */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
            <textarea
              value={incomingText}
              onChange={e => setIncomingText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addIncomingMessage(); } }}
              placeholder="New message from client..."
              rows={1}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5, background: "#F8FAFC" }}
            />
            <button onClick={addIncomingMessage} disabled={!incomingText.trim()}
              style={{ padding: "9px 14px", height: 38, borderRadius: 10, border: "none", background: incomingText.trim() ? "#22C55E" : "#E2E8F0", color: incomingText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 12, cursor: incomingText.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap", flexShrink: 0 }}>
              + Add
            </button>
          </div>

          {/* BOTTOM ROW — type your own outgoing message (always usable) */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              id="ownerReplyInput"
              value={directReplyText}
              onChange={e => setDirectReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDirectReply(); } }}
              placeholder="Type your message..."
              rows={2}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5 }}
            />
            {/* Save only — shown when no number */}
            {!activeCustomer?.number && (
              <button onClick={sendDirectReply} disabled={!directReplyText.trim()}
                style={{ width: 46, height: 52, borderRadius: 12, border: "none", background: directReplyText.trim() ? "#6366F1" : "#E2E8F0", color: directReplyText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 20, cursor: directReplyText.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}>
                ↑
              </button>
            )}
            {/* Combined Save + WhatsApp — shown when number exists */}
            {activeCustomer?.number && (
              <button
                onClick={async () => {
                  const text = directReplyText.trim();
                  if (!text) return;
                  await sendDirectReply();
                  const number = activeCustomer.number.replace(/\D/g, "");
                  window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
                }}
                disabled={!directReplyText.trim()}
                style={{ height: 52, padding: "0 14px", borderRadius: 12, border: "none", background: directReplyText.trim() ? "#25D366" : "#E2E8F0", color: directReplyText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 13, cursor: directReplyText.trim() ? "pointer" : "not-allowed", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
                <span style={{ fontSize: 16 }}>📱</span>
                <span style={{ fontSize: 9, fontWeight: 700 }}>Send</span>
              </button>
            )}
          </div>
        </div>
        </div>{/* end detail content wrapper */}

        {/* ── LINK STOCK MODAL (inside detail view so it renders when chat is open) ── */}
        {showLinkStock && activeCustomer && linkStockDeal && (
          <LinkStockModal
            customer={activeCustomer}
            deal={linkStockDeal}
            onClose={() => { setShowLinkStock(false); setLinkStockDeal(null); }}
            onDone={() => {
              setShowLinkStock(false);
              setLinkStockDeal(null);
              loadCustomers();
              loadStock();
              refreshCachedStock();
              loadTodaySales();
              showToast("Sale confirmed successfully ✅");
            }}
          />
        )}
        {/* ── RESERVATION MODAL (inside detail view) ── */}
        {showReservation && activeCustomer && linkStockDeal && (
          <ReservationModal
            customer={activeCustomer}
            deal={linkStockDeal}
            stock={stock}
            onClose={() => { setShowReservation(false); setLinkStockDeal(null); }}
            onDone={({ selectedItem, pickupDate, depositAmt, balanceDue }) => {
              setShowReservation(false);
              setLinkStockDeal(null);
              loadStock();
              loadCustomers();
              refreshCachedStock();
              showToast("Device reserved successfully 🔒");
            }}
          />
        )}
      </div>
    );
}
