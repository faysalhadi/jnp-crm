import { useCallback } from "react"; // eslint-disable-line
import { supabase } from "../supabase";
import { useCustomers } from "../context/CustomerContext";
import { useStock } from "../context/StockContext";
import { useReservations } from "../context/ReservationsContext";
import { useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import { callClaude } from "../utils/claude";
import { autoTier } from "../utils/helpers";
import { STAGES } from "../constants";
import { releaseHold, upgradeToReserved } from "../services/stockHoldService";

export function useChatActions() {
  const { anthropicKey } = useAuth();
  const {
    activeCustomer, activeDeal, activeDealId, activeCustomerId,
    setActiveDealId, loadCustomers,
    updateCustomer: _updateCustomer,
    updateDeal: _updateDeal,
    pendingSuggestion, setPendingSuggestion,
    showLossReason, setShowLossReason,
  } = useCustomers();
  const { loadStock, refreshCachedStock } = useStock();
  const {
    setShowLinkStock, setLinkStockDeal,
    setShowReservation,
  } = useReservations();
  const {
    supplierReplyCtx,
    setSupplierReplyGmail, setSupplierReplyWA, setSupplierReplyLoading,
  } = useChat();

  async function updateDeal(dealId, fields) {
    return _updateDeal(dealId, fields);
  }

  async function updateCustomer(customerId, fields) {
    return _updateCustomer(customerId, fields);
  }

  async function handleReserveDevice() {
    let deal = activeDeal;
    if (!deal && activeCustomer?.id) {
      const { data: newD } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: "new_inquiry",
        brand: "", model: "",
      }).select().single();
      if (newD) {
        deal = newD;
        setActiveDealId(newD.id);
        loadCustomers();
      }
    }
    if (!deal) return;
    setLinkStockDeal({ ...deal });
    setShowReservation(true);
  }

  async function handleConfirmSale() {
    if (activeDeal) {
      setLinkStockDeal({ ...activeDeal });
      setShowLinkStock(true);
      return;
    }
    if (!activeCustomer?.id) return;
    const { data: newD } = await supabase.from("deals").insert({
      customer_id: activeCustomer.id,
      stage: "new_inquiry",
      brand: "", model: "",
    }).select().single();
    if (newD) {
      setActiveDealId(newD.id);
      setLinkStockDeal({ ...newD });
      setShowLinkStock(true);
      loadCustomers();
    }
  }

  async function moveStage(stageId) {
    if (!activeDealId && activeCustomer?.id) {
      const { data: newDeal } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: stageId,
        brand: "", model: "",
        ...(stageId === "closed" ? { closed_at: new Date().toISOString() } : {}),
      }).select().single();
      if (newDeal) {
        setActiveDealId(newDeal.id);
        await loadCustomers();
        if (stageId === "lost") setShowLossReason(true);
        if (stageId === "confirmed_pending_pickup") { setLinkStockDeal(newDeal); setShowReservation(true); }
        if (stageId === "closed") { setLinkStockDeal(newDeal); setShowLinkStock(true); }
      }
      return;
    }
    const fields = { stage: stageId };
    if (stageId === "closed") fields.closed_at = new Date().toISOString();
    await updateDeal(activeDealId, fields);
    const updatedDeals = activeCustomer.deals.map(d => d.id === activeDealId ? { ...d, ...fields } : d);
    await updateCustomer(activeCustomerId, { tier: autoTier(updatedDeals, activeCustomer.tier) });
    setPendingSuggestion(null);

    // Hold lifecycle. Soft hold → hard hold on a confirmed pickup; dropped when
    // the deal is lost or parked. 'closed' is left alone — the sold flow owns it.
    const heldStockId = activeDeal?.stock_item_id || null;
    if (heldStockId) {
      if (stageId === "confirmed_pending_pickup") await upgradeToReserved(heldStockId);
      else if (stageId === "lost" || stageId === "watching") await releaseHold(heldStockId);
    }
    if (stageId === "watching") {
      await updateDeal(activeDealId, {
        parked_reason: "no_stock",
        parked_at: new Date().toISOString(),
        stock_item_id: null,
      });
    }
    if (heldStockId && (stageId === "confirmed_pending_pickup" || stageId === "lost" || stageId === "watching")) {
      await loadStock();
      refreshCachedStock();
    }
    if (stageId === "lost") setShowLossReason(true);
    if (stageId === "confirmed_pending_pickup") { setLinkStockDeal({ ...activeDeal, stage: stageId }); setShowReservation(true); }
    if (stageId === "closed") { setLinkStockDeal({ ...activeDeal, ...fields }); setShowLinkStock(true); }
  }

  async function generateSupplierReply() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setSupplierReplyLoading(true);
    setSupplierReplyGmail("");
    setSupplierReplyWA("");
    const sup = activeCustomer;
    const prompt = `You are writing communications on behalf of Faisal Hadi, Laptop for Less, Sharjah UAE.

Supplier: ${sup?.name || "Supplier"}
${sup?.location ? `Location: ${sup.location}` : ""}
${sup?.email ? `Email: ${sup.email}` : ""}
Context: ${supplierReplyCtx || "General follow-up"}

Write TWO versions. Return JSON only:
{
  "gmail": "Formal email, 3-5 sentences, professional tone. End with: Best regards,\\nFaisal Hadi\\nLaptop for Less, UAE",
  "whatsapp": "Casual, 2-3 lines max, 1 emoji, no formal sign-off"
}`;
    try {
      const raw = await callClaude(anthropicKey, [{ role: "user", content: prompt }],
        "You write professional supplier communications for a UAE laptop reseller. Return only valid JSON.");
      const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSupplierReplyGmail(p.gmail || "");
      setSupplierReplyWA(p.whatsapp || "");
    } catch {
      setSupplierReplyGmail("Error generating — check your API key.");
    }
    setSupplierReplyLoading(false);
  }

  return {
    handleReserveDevice,
    handleConfirmSale,
    moveStage,
    generateSupplierReply,
  };
}
