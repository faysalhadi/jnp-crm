import React, { useState } from "react";
import LinkStockModal from "../modals/LinkStockModal";
import ReservationModal from "../modals/ReservationModal";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useTraders } from "../../context/TradersContext";
import { useReservations } from "../../context/ReservationsContext";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import InputBar from "./InputBar";

export default function ChatDetailView({
  messages, setMessages,
  msgLoading,
  incomingText, setIncomingText,
  replyMode, setReplyMode,
  replyingToId, setReplyingToId,
  directReplyText, setDirectReplyText,
  generatedReply, setGeneratedReply,
  generatedReplyLoading, setGeneratedReplyLoading,
  editingGenerated, setEditingGenerated,
  copied, setCopied,
  editSent, setEditSent,
  editingName, setEditingName,
  nameInput, setNameInput,
  editingNumber, setEditingNumber,
  numberInput, setNumberInput,
  outreachMode, setOutreachMode,
  outreachReason, setOutreachReason,
  outreachCustom, setOutreachCustom,
  showReceipt, setShowReceipt,
  receiptPaymentMethod, setReceiptPaymentMethod,
  showSupplierReply, setShowSupplierReply,
  supplierReplyCtx, setSupplierReplyCtx,
  supplierReplyGmail, setSupplierReplyGmail,
  supplierReplyWA, setSupplierReplyWA,
  supplierReplyLoading, setSupplierReplyLoading,
  copiedSupGmail, setCopiedSupGmail,
  copiedSupWA, setCopiedSupWA,
  anthropicKey, cachedStock,
  bottomRef,
  NAV_TABS, activeTab,
  stock,
  loadStock, refreshCachedStock, loadTodaySales,
  moveStage, handleConfirmSale, handleReserveDevice,
  addIncomingMessage, generateAIReply, sendAIReply,
  sendDirectReply, generateOpeningMessage,
  confirmSent, markNotSent, copyMsg,
  generateOutreach, generateSupplierReply,
  showToast,
}) {
  const { isMobile, setActiveTab, setShowSideDrawer } = useUI();
  const {
    traderListings,
    setTraderSearch,
  } = useTraders();
  const {
    showLinkStock, setShowLinkStock,
    linkStockDeal, setLinkStockDeal,
    showReservation, setShowReservation,
  } = useReservations();
  const {
    activeCustomer,
    activeDeal,
    activeCustomerId, setActiveCustomerId,
    activeDealId, setActiveDealId,
    view, setView,
    pendingSuggestion, setPendingSuggestion,
    loadCustomers,
  } = useCustomers();

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
          <ChatHeader
            editingName={editingName} setEditingName={setEditingName}
            nameInput={nameInput} setNameInput={setNameInput}
            editingNumber={editingNumber} setEditingNumber={setEditingNumber}
            numberInput={numberInput} setNumberInput={setNumberInput}
            moveStage={moveStage}
            pendingSuggestion={pendingSuggestion} setPendingSuggestion={setPendingSuggestion}
            showReceipt={showReceipt} setShowReceipt={setShowReceipt}
            receiptPaymentMethod={receiptPaymentMethod} setReceiptPaymentMethod={setReceiptPaymentMethod}
            buildReceiptText={undefined} saveReceiptNumber={undefined}
            outreachMode={outreachMode} setOutreachMode={setOutreachMode}
            outreachReason={outreachReason} setOutreachReason={setOutreachReason}
            outreachCustom={outreachCustom} setOutreachCustom={setOutreachCustom}
            showSupplierReply={showSupplierReply} setShowSupplierReply={setShowSupplierReply}
            supplierReplyCtx={supplierReplyCtx} setSupplierReplyCtx={setSupplierReplyCtx}
            supplierReplyGmail={supplierReplyGmail} setSupplierReplyGmail={setSupplierReplyGmail}
            supplierReplyWA={supplierReplyWA} setSupplierReplyWA={setSupplierReplyWA}
            supplierReplyLoading={supplierReplyLoading} setSupplierReplyLoading={setSupplierReplyLoading}
            copiedSupGmail={copiedSupGmail} setCopiedSupGmail={setCopiedSupGmail}
            copiedSupWA={copiedSupWA} setCopiedSupWA={setCopiedSupWA}
            handleConfirmSale={handleConfirmSale}
            handleReserveDevice={handleReserveDevice}
            generateSupplierReply={generateSupplierReply}
          />

          <MessageList
            messages={messages}
            replyMode={replyMode} setReplyMode={setReplyMode}
            replyingToId={replyingToId} setReplyingToId={setReplyingToId}
            generatedReply={generatedReply} setGeneratedReply={setGeneratedReply}
            generatedReplyLoading={generatedReplyLoading}
            editingGenerated={editingGenerated} setEditingGenerated={setEditingGenerated}
            copied={copied} setCopied={setCopied}
            editSent={editSent} setEditSent={setEditSent}
            confirmSent={confirmSent} markNotSent={markNotSent} copyMsg={copyMsg}
            bottomRef={bottomRef}
            generateAIReply={generateAIReply}
            sendAIReply={sendAIReply}
            generateOpeningMessage={generateOpeningMessage}
            showSupplierReply={showSupplierReply} setShowSupplierReply={setShowSupplierReply}
            supplierReplyCtx={supplierReplyCtx} setSupplierReplyCtx={setSupplierReplyCtx}
            supplierReplyGmail={supplierReplyGmail} setSupplierReplyGmail={setSupplierReplyGmail}
            supplierReplyWA={supplierReplyWA} setSupplierReplyWA={setSupplierReplyWA}
            supplierReplyLoading={supplierReplyLoading} setSupplierReplyLoading={setSupplierReplyLoading}
            copiedSupGmail={copiedSupGmail} setCopiedSupGmail={setCopiedSupGmail}
            copiedSupWA={copiedSupWA} setCopiedSupWA={setCopiedSupWA}
            generateSupplierReply={generateSupplierReply}
          />

          <InputBar
            messages={messages}
            incomingText={incomingText} setIncomingText={setIncomingText}
            replyMode={replyMode} setReplyMode={setReplyMode}
            replyingToId={replyingToId} setReplyingToId={setReplyingToId}
            directReplyText={directReplyText} setDirectReplyText={setDirectReplyText}
            generatedReply={generatedReply} setGeneratedReply={setGeneratedReply}
            generatedReplyLoading={generatedReplyLoading} setGeneratedReplyLoading={setGeneratedReplyLoading}
            editingGenerated={editingGenerated} setEditingGenerated={setEditingGenerated}
            anthropicKey={anthropicKey}
            cachedStock={cachedStock}
            addIncomingMessage={addIncomingMessage}
            generateAIReply={generateAIReply}
            sendAIReply={sendAIReply}
            sendDirectReply={sendDirectReply}
            generateOpeningMessage={generateOpeningMessage}
            handleConfirmSale={handleConfirmSale}
            handleReserveDevice={handleReserveDevice}
          />
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
