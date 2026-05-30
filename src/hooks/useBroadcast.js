import { useCustomers } from "../context/CustomerContext";
import { useAuth } from "../context/AuthContext";
import { useBroadcastCtx } from "../context/BroadcastContext";
import { callClaude } from "../utils/claude";

export function useBroadcast() {
  const { anthropicKey } = useAuth();
  const { customers } = useCustomers();
  const {
    showBroadcast, setShowBroadcast,
    broadcastItem, setBroadcastItem,
    broadcastClients, setBroadcastClients,
    broadcastSelected, setBroadcastSelected,
    broadcastMessages, setBroadcastMessages,
    broadcastLoading, setBroadcastLoading,
    broadcastStep, setBroadcastStep,
    broadcastSent, setBroadcastSent,
  } = useBroadcastCtx();

  function openBroadcast(item) {
    const matches = customers.filter(c =>
      (c.deals || []).some(d => {
        if (d.stage === "closed" || d.stage === "lost") return false;
        if (!item) return true; // no item filter — show all open deals
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
    try {
      const selected = broadcastClients.filter(c => broadcastSelected.has(c.id));
      const device = broadcastItem ? [broadcastItem.brand, broadcastItem.model].filter(Boolean).join(" ") : "";
      const specs  = broadcastItem ? [broadcastItem.ram, broadcastItem.ssd, broadcastItem.condition].filter(Boolean).join(", ") : "";
      const price  = broadcastItem?.max_price || "";
      const msgs = await Promise.all(selected.map(async c => {
        const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
        const interest = deal ? `${deal.brand || "laptop"} budget AED ${deal.budget || "unknown"}` : "laptop";
        const about = device ? `${device}${specs ? " — " + specs : ""}${price ? " AED " + price : ""}` : "available laptops";
        const prompt = `Write a short WhatsApp message to ${c.name} about: ${about}. Their interest: ${interest}. Personal, friendly, under 40 words, 1-2 emojis. Return message text only.`;
        try {
          const text = await callClaude(anthropicKey, [{ role: "user", content: prompt }], "You write short friendly WhatsApp messages for Laptop for Less UAE.");
          return { client: c, message: text.trim(), deal };
        } catch {
          const fallback = device
            ? `Hey ${c.name}! 👋 Just got a ${device}${price ? " — AED " + price : ""}. Interested? 😊`
            : `Hey ${c.name}! 👋 We have some great laptops available. Let me know what you need! 😊`;
          return { client: c, message: fallback, deal };
        }
      }));
      setBroadcastMessages(msgs); setBroadcastStep("messages");
    } catch (e) {
      console.error("Broadcast generate error:", e);
    }
    setBroadcastLoading(false);
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
