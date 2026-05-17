import { useState } from "react";
import { callClaude } from "../utils/claude";

export function useBroadcast(anthropicKey, customers) {
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastItem, setBroadcastItem] = useState(null);
  const [broadcastClients, setBroadcastClients] = useState([]);
  const [broadcastSelected, setBroadcastSelected] = useState(new Set());
  const [broadcastMessages, setBroadcastMessages] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastStep, setBroadcastStep] = useState("clients");
  const [broadcastSent, setBroadcastSent] = useState(new Set());

  function openBroadcast(item) {
    const matches = customers.filter(c =>
      (c.deals || []).some(d => {
        if (d.stage === "closed" || d.stage === "lost") return false;
        const brandMatch = !item.brand || !d.brand || d.brand.toLowerCase() === item.brand.toLowerCase();
        const budgetOk = !item.min_price || !d.budget || Number(d.budget) >= Number(item.min_price);
        return brandMatch || budgetOk;
      })
    );
    setBroadcastItem(item);
    setBroadcastClients(matches);
    setBroadcastSelected(new Set(matches.map(c => c.id)));
    setBroadcastMessages([]); setBroadcastStep("clients"); setBroadcastSent(new Set());
    setShowBroadcast(true);
  }

  async function generateBroadcastMessages() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setBroadcastLoading(true);
    const selected = broadcastClients.filter(c => broadcastSelected.has(c.id));
    const device = [broadcastItem?.brand, broadcastItem?.model].filter(Boolean).join(" ");
    const specs = [broadcastItem?.ram, broadcastItem?.ssd, broadcastItem?.condition].filter(Boolean).join(", ");
    const msgs = await Promise.all(selected.map(async c => {
      const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
      const prompt = `Write a short WhatsApp message to ${c.name} about: ${device} ${specs} AED ${broadcastItem?.max_price}. Their interest: ${deal?.brand || "laptop"} budget AED ${deal?.budget || "unknown"}. Personal, friendly, under 40 words, 1-2 emojis. Return message text only.`;
      try {
        const text = await callClaude(anthropicKey, [{ role: "user", content: prompt }], "You write short friendly WhatsApp messages for Laptop for Less UAE.");
        return { client: c, message: text.trim(), deal };
      } catch {
        return { client: c, message: `Hey ${c.name}! 👋 Just got a ${device} — ${specs}. AED ${broadcastItem?.max_price}. Interested? 😊`, deal };
      }
    }));
    setBroadcastMessages(msgs); setBroadcastStep("messages"); setBroadcastLoading(false);
  }

  return {
    showBroadcast, setShowBroadcast,
    broadcastItem, setBroadcastItem,
    broadcastClients, setBroadcastClients,
    broadcastSelected, setBroadcastSelected,
    broadcastMessages, setBroadcastMessages,
    broadcastLoading, setBroadcastLoading,
    broadcastStep, setBroadcastStep,
    broadcastSent, setBroadcastSent,
    openBroadcast,
    generateBroadcastMessages,
  };
}
