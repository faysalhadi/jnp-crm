import { supabase } from "../supabase";
import { callClaude } from "../utils/claude";

export function getMatchingClients(item, customers) {
  if (!item) return [];
  return customers.filter(c => {
    if (c.contact_type !== "client") return false;
    const deals = c.deals || [];
    return deals.some(d => {
      if (d.stage === "closed" || d.stage === "parked")
        return false;
      const brandMatch = !item.brand || !d.brand ||
        d.brand.toLowerCase() === item.brand.toLowerCase();
      const budgetMatch = !d.budget || !item.max_price ||
        Number(d.budget) >= Number(item.max_price) * 0.8;
      return brandMatch && budgetMatch;
    });
  });
}

export async function generateBroadcastMessages(item, clients, anthropicKey) {
  const messages = {};
  for (const client of clients) {
    const deal = (client.deals || []).find(d =>
      d.stage !== "closed" && d.stage !== "parked"
    );
    const prompt = `Generate a short friendly WhatsApp message
to ${client.name} about this laptop:
${item.brand} ${item.model} - ${item.ram} RAM,
${item.ssd} SSD, ${item.condition}
Price: AED ${item.max_price}
${deal?.budget ? `Their budget: AED ${deal.budget}` : ""}
${deal?.brand ? `They want: ${deal.brand}` : ""}

Keep it under 3 sentences. Be natural and friendly.
Return only the message text.`;

    try {
      const res = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 200,
            messages: [{ role: "user", content: prompt }],
          }),
        }
      );
      const data = await res.json();
      messages[client.id] = data?.content?.[0]?.text ||
        `Hi ${client.name}! I have a ${item.brand} ${item.model} available that matches what you're looking for. Interested?`;
    } catch {
      messages[client.id] =
        `Hi ${client.name}! I have a ${item.brand} ${item.model} available. Interested?`;
    }
  }
  return messages;
}
