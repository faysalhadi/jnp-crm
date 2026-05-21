import { useCallback } from "react";
import { supabase } from "../supabase";
import { useCustomers } from "../context/CustomerContext";
import { useStock } from "../context/StockContext";
import { useReservations } from "../context/ReservationsContext";
import { useSales } from "../context/SalesContext";
import { callClaude, buildSystemPromptFromCache } from "../utils/claude";
import { autoTier } from "../utils/helpers";
import { STAGES } from "../constants";

export function useChat(
  messages, setMessages,
  setMsgLoading,
  incomingText, setIncomingText,
  replyMode, setReplyMode,
  replyingToId, setReplyingToId,
  directReplyText, setDirectReplyText,
  generatedReply, setGeneratedReply,
  setGeneratedReplyLoading,
  setEditingGenerated,
  copied, setCopied,
  setEditSent,
  anthropicKey,
) {
  const {
    activeCustomer, activeDeal, activeDealId, activeCustomerId,
    setActiveDealId, loadCustomers,
    updateCustomer: _updateCustomer,
    updateDeal: _updateDeal,
    pendingSuggestion, setPendingSuggestion,
    showLossReason, setShowLossReason,
  } = useCustomers();
  const { cachedStock, loadStock, refreshCachedStock, stock } = useStock();
  const { loadTodaySales } = useSales();
  const {
    setShowLinkStock, setLinkStockDeal,
    setShowReservation,
  } = useReservations();

  // Wrappers that mirror the ones in App.js
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
    // Auto-create deal if none exists
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
    await updateCustomer(activeCustomerId, { tier: autoTier(updatedDeals) });
    setPendingSuggestion(null);
    if (stageId === "lost") setShowLossReason(true);
    if (stageId === "confirmed_pending_pickup") { setLinkStockDeal({ ...activeDeal, stage: stageId }); setShowReservation(true); }
    if (stageId === "closed") { setLinkStockDeal({ ...activeDeal, ...fields }); setShowLinkStock(true); }
  }

  // Step 1: add an incoming client message (saves as role=customer, shows LEFT)
  async function addIncomingMessage() {
    if (!incomingText.trim()) return;
    // Auto-create a deal if no active deal exists (e.g. new contact from floating button)
    let dealId = activeDealId;
    if (!dealId && activeCustomer?.id) {
      const { data: newDeal } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: "new_inquiry",
        brand: "", model: "",
      }).select().single();
      if (newDeal) {
        dealId = newDeal.id;
        setActiveDealId(newDeal.id);
        await loadCustomers();
      }
    }
    if (!dealId) return;
    const content = incomingText.trim();
    setIncomingText("");
    const isVoice  = content.toLowerCase().startsWith("voice note:");
    const isUrgent = /urgent|today|asap|same day|need it now|quickly/i.test(content);
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: activeDealId, role: "customer", content, is_voice: isVoice,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    if (isUrgent) await updateCustomer(activeCustomerId, { urgent: true });
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  // Step 3b: call Claude with full conversation history, show result for review
  async function generateAIReply(triggerMsgId) {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setReplyingToId(triggerMsgId);
    setReplyMode("ai");
    setGeneratedReplyLoading(true);
    setGeneratedReply("");
    setEditingGenerated(false);

    const history = messages.map(m => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.sent && m.sent !== "NOT_SENT" ? m.sent : m.content,
    }));

    const cType = activeCustomer?.contact_type || "client";
    const systemPrompt = cType === "trader"
      ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, a local laptop trader. Keep messages short, direct and casual. Return JSON with only a "reply" field (WhatsApp style, max 3 lines).`
      : cType === "supplier"
      ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, an international laptop supplier. Write professional business messages. Return JSON with only a "reply" field (formal, 2-4 sentences).`
      : buildSystemPromptFromCache(cachedStock); // clients and walk-ins

    try {
      const raw = await callClaude(anthropicKey, history, systemPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed; try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
      setGeneratedReply(parsed.reply || raw);
      // Update deal specs from AI analysis (clients and walk-ins)
      if ((cType === "client" || cType === "walkin") && parsed) {
        const specUpdate = {};
        if (parsed.brand && parsed.brand !== "unknown" && !activeDeal?.brand) specUpdate.brand = parsed.brand;
        if (parsed.model && parsed.model !== "unknown" && !activeDeal?.model) specUpdate.model = parsed.model;
        if (parsed.ram   && parsed.ram   !== "unknown") specUpdate.ram   = parsed.ram;
        if (parsed.storage && parsed.storage !== "unknown") specUpdate.storage = parsed.storage;
        if (parsed.condition && parsed.condition !== "unknown") specUpdate.condition = parsed.condition;
        if (parsed.budget) specUpdate.budget = parsed.budget;
        if (Object.keys(specUpdate).length) await updateDeal(activeDealId, specUpdate);
        if (parsed.suggestedStage && parsed.suggestedStage !== activeDeal?.stage)
          setPendingSuggestion({ stage: parsed.suggestedStage, reason: parsed.stageReason });
        if (parsed.urgency) await updateCustomer(activeCustomerId, { urgent: true });
      }
    } catch {
      setGeneratedReply("⚠️ Error generating. Check your API key in Settings.");
    }
    setGeneratedReplyLoading(false);
  }

  // Send the AI-generated reply (or edited version)
  async function sendAIReply() {
    const content = generatedReply.trim();
    if (!content || !activeDealId) return;
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: activeDealId, role: "assistant", content, sent: content,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    setGeneratedReply(""); setReplyMode(null); setReplyingToId(null); setEditingGenerated(false);
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  // Send the manually-typed reply
  async function sendDirectReply() {
    const content = directReplyText.trim();
    if (!content || !activeDealId) return;
    setDirectReplyText("");
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: activeDealId, role: "assistant", content, sent: content,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    setReplyMode(null); setReplyingToId(null);
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  // Generate an opening message for an empty conversation
  async function generateOpeningMessage() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setReplyMode("ai");
    setGeneratedReplyLoading(true);
    setGeneratedReply("");
    const prompt = `Generate a friendly opening WhatsApp message from "Laptop for Less" (UAE laptop reseller) to a new client named ${activeCustomer?.name}. ${activeDeal?.brand ? `They are interested in: ${activeDeal.brand} ${activeDeal.model || ""}` : ""}${activeDeal?.budget ? `. Budget: AED ${activeDeal.budget}` : ""}. Keep it short, welcoming, ask what they're looking for. Return JSON with only a "reply" field.`;
    try {
      const raw = await callClaude(anthropicKey, [{ role: "user", content: prompt }], buildSystemPromptFromCache(cachedStock));
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed; try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
      setGeneratedReply(parsed.reply || raw);
    } catch { setGeneratedReply("Error generating. Check your API key."); }
    setGeneratedReplyLoading(false);
  }

  async function sendDirectMessage(msgInput, setMsgInput) {
    if (!msgInput.trim()) return;
    // Auto-create a deal if no active deal exists
    let dealId = activeDealId;
    if (!dealId && activeCustomer?.id) {
      const { data: newDeal } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: "new_inquiry",
        brand: "", model: "",
      }).select().single();
      if (newDeal) {
        dealId = newDeal.id;
        setActiveDealId(newDeal.id);
        await loadCustomers();
      }
    }
    if (!dealId) return;
    const content = msgInput.trim();
    setMsgInput("");
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: dealId,
      role: "assistant",
      content,
      sent: content,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  async function sendMessage(msgInput, setMsgInput) {
    if (!msgInput.trim() || !activeDeal || !anthropicKey) return;
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }

    const isVoice = msgInput.toLowerCase().startsWith("voice note:");
    const isUrgent = /urgent|today|asap|same day|need it now|quickly/i.test(msgInput);

    const { data: userMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "customer", content: msgInput.trim(), is_voice: isVoice }).select().single();
    setMessages(prev => [...prev, userMsg]);
    setMsgInput(""); setMsgLoading(true); setPendingSuggestion(null);
    if (isUrgent) await updateCustomer(activeCustomerId, { urgent: true });
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role === "customer" ? "user" : "assistant",
        content: m.sent && m.sent !== "NOT_SENT" ? m.sent : m.content,
      }));

      const cType = activeCustomer?.contact_type || "client";
      const systemPrompt = cType === "trader"
        ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, a local laptop trader. Keep messages short, direct and casual — this is a trader-to-trader conversation. You may be buying from or selling to them. Return JSON with only a "reply" field (WhatsApp style, max 3 lines).`
        : cType === "supplier"
        ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, an international laptop supplier. Write professional business messages. Return JSON with only a "reply" field (formal but friendly, 2-4 sentences).`
        : buildSystemPromptFromCache(cachedStock);
      const raw = await callClaude(anthropicKey, history, systemPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }

      // update deal specs
      const specUpdate = {};
      if (parsed.brand && parsed.brand !== "unknown" && !activeDeal.brand) specUpdate.brand = parsed.brand;
      if (parsed.model && parsed.model !== "unknown" && !activeDeal.model) specUpdate.model = parsed.model;
      if (parsed.ram && parsed.ram !== "unknown") specUpdate.ram = parsed.ram;
      if (parsed.storage && parsed.storage !== "unknown") specUpdate.storage = parsed.storage;
      if (parsed.screen && parsed.screen !== "unknown") specUpdate.screen = parsed.screen;
      if (parsed.condition && parsed.condition !== "unknown") specUpdate.condition = parsed.condition;
      if (parsed.budget) specUpdate.budget = parsed.budget;
      if (parsed.activationLock && parsed.activationLock !== "unknown") specUpdate.activation_lock = parsed.activationLock;
      if (parsed.charger && parsed.charger !== "unknown") specUpdate.charger = parsed.charger;
      if (parsed.box && parsed.box !== "unknown") specUpdate.box = parsed.box;
      if (Object.keys(specUpdate).length) await updateDeal(activeDealId, specUpdate);

      const { data: aiMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: parsed.reply || raw }).select().single();
      setMessages(prev => [...prev, aiMsg]);

      if (parsed.suggestedStage && parsed.suggestedStage !== activeDeal.stage) {
        setPendingSuggestion({ stage: parsed.suggestedStage, reason: parsed.stageReason });
      }
      if (parsed.urgency) await updateCustomer(activeCustomerId, { urgent: true });

    } catch {
      const { data: errMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: "⚠️ API error. Check your Anthropic key in Settings." }).select().single();
      setMessages(prev => [...prev, errMsg]);
    } finally { setMsgLoading(false); }
  }

  async function generateSupplierReply(supplierReplyCtx, setSupplierReplyGmail, setSupplierReplyWA, setSupplierReplyLoading) {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setSupplierReplyLoading(true); setSupplierReplyGmail(""); setSupplierReplyWA("");
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
      setSupplierReplyGmail(p.gmail || ""); setSupplierReplyWA(p.whatsapp || "");
    } catch { setSupplierReplyGmail("Error generating — check your API key."); }
    setSupplierReplyLoading(false);
  }

  async function generateOutreach(outreachReason, outreachCustom, setOutreachMode, setOutreachReason, setOutreachCustom) {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    const reason = outreachReason === "Custom message" ? outreachCustom : outreachReason;
    if (!reason) return;
    setMsgLoading(true);

    const context = `Generate a WhatsApp outreach message to send to ${activeCustomer?.name}.
Reason: ${reason}
Customer history: ${activeDeal?.brand ? `Interested in ${activeDeal.brand} ${activeDeal.model || ""}` : "General customer"}
Budget: ${activeDeal?.budget ? `AED ${activeDeal.budget}` : "Unknown"}
Last stage: ${STAGES.find(s => s.id === activeDeal?.stage)?.label}
Return JSON with only a "reply" field containing the message.`;

    try {
      const systemPrompt = buildSystemPromptFromCache(cachedStock);
      const raw = await callClaude(anthropicKey, [{ role: "user", content: context }], systemPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
      const { data: aiMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: parsed.reply || raw }).select().single();
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      alert("Error generating message. Check your API key.");
    } finally {
      setMsgLoading(false); setOutreachMode(false); setOutreachReason(""); setOutreachCustom("");
    }
  }

  async function confirmSent(msgId, text) {
    await supabase.from("messages").update({ sent: text }).eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sent: text } : m));
    setEditSent(null);
    // open whatsapp
    if (activeCustomer?.number) window.open(`https://wa.me/${activeCustomer.number.replace(/\D/g,"")}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function markNotSent(msgId) {
    await supabase.from("messages").update({ sent: "NOT_SENT" }).eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sent: "NOT_SENT" } : m));
  }

  function copyMsg(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(() => setCopied(null), 2000);
  }

  return {
    handleReserveDevice, handleConfirmSale, moveStage,
    addIncomingMessage, generateAIReply, sendAIReply,
    sendDirectReply, generateOpeningMessage,
    confirmSent, markNotSent, copyMsg,
    generateOutreach, generateSupplierReply,
    sendMessage, sendDirectMessage,
  };
}
