import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { matchStockToClients } from "../../constants";
import { useAuth } from "../../context/AuthContext";

export default function WaitingClientsPanel({ stockItem }) {
  const [waitingDeals, setWaitingDeals] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [messages, setMessages] = useState({});
  const [sent, setSent] = useState({});
  const { anthropicKey } = useAuth();

  useEffect(() => {
    loadWaitingClients();
  }, [stockItem.id]); // eslint-disable-line

  const loadWaitingClients = async () => {
    const { data: deals } = await supabase
      .from("deals")
      .select("*, customers(id, name, number, messages(content, role, ts))")
      .eq("stage", "waiting");

    if (!deals) return;

    const scored = matchStockToClients(stockItem, deals);
    setWaitingDeals(scored);
  };

  const generateMessages = async () => {
    if (!anthropicKey || waitingDeals.length === 0) return;
    setGenerating(true);

    const newMessages = {};
    for (const deal of waitingDeals) {
      const customer = deal.customers;
      const recentMsgs = (customer?.messages || [])
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, 6)
        .reverse()
        .map(m => `${m.role === "customer" ? customer.name : "Me"}: ${m.content}`)
        .join("\n");

      const deviceDesc = [stockItem.brand, stockItem.model, stockItem.processor, stockItem.ram, stockItem.ssd].filter(Boolean).join(" ");
      const prompt = `You are a laptop reseller in UAE. Generate a short WhatsApp message to notify a waiting client that a matching laptop is now available.

Client name: ${customer?.name}
Device available: ${deviceDesc}
Price: AED ${stockItem.max_price}
Client's budget from deal: ${deal.budget ? "AED " + deal.budget : "not specified"}
Recent conversation:
${recentMsgs || "No previous messages"}

Rules:
- Write in English OR Roman Urdu based on the conversation language (default English if no conversation)
- Never use Arabic script
- Keep it short — WhatsApp style, 2-3 sentences max
- Mention the device and price
- If price is slightly over budget, acknowledge it but stay firm
- Be friendly and personal
- Do not mention you are AI
- End with a question to invite reply

Return ONLY the message text, nothing else.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
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
        });
        const data = await response.json();
        newMessages[deal.id] = data.content?.[0]?.text || "";
      } catch (err) {
        newMessages[deal.id] = `Hey ${customer?.name}, the ${deviceDesc} you were looking for is now available at AED ${stockItem.max_price}. Interested?`;
      }
    }

    setMessages(newMessages);
    setGenerating(false);
  };

  const sendMessage = (deal, message) => {
    const number = deal.customers?.number?.replace(/\D/g, "");
    if (!number) return;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank");
    setSent(p => ({ ...p, [deal.id]: true }));
  };

  if (waitingDeals.length === 0) return null;

  const deviceDesc = [stockItem.brand, stockItem.model].filter(Boolean).join(" ");

  return (
    <div style={{ margin: "10px 14px", padding: "12px", borderRadius: 12, background: "#EEEDFE", border: "1px solid #AFA9EC" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>👥</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3C3489" }}>
          {waitingDeals.length} client{waitingDeals.length !== 1 ? "s" : ""} waiting for {deviceDesc}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {waitingDeals.map(deal => (
          <div key={deal.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#534AB7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {(deal.customers?.name || "?").slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: "#3C3489", flex: 1 }}>{deal.customers?.name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
              background: deal.matchScore.bg, color: deal.matchScore.color }}>
              {deal.matchScore.emoji} {deal.matchScore.label}
            </span>
            {deal.budget && <span style={{ fontSize: 10, color: "#7F77DD" }}>AED {Number(deal.budget).toLocaleString()}</span>}
          </div>
        ))}
      </div>

      {Object.keys(messages).length === 0 ? (
        <button
          onClick={generateMessages}
          disabled={generating}
          style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: generating ? "#AFA9EC" : "#534AB7", color: "#fff", fontSize: 12, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer" }}>
          {generating ? "Generating messages..." : "Notify clients"}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {waitingDeals.map(deal => (
            <div key={deal.id} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid #AFA9EC" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#534AB7", marginBottom: 6 }}>{deal.customers?.name}</div>
              <textarea
                value={messages[deal.id] || ""}
                onChange={e => setMessages(p => ({ ...p, [deal.id]: e.target.value }))}
                rows={3}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => sendMessage(deal, messages[deal.id])}
                  style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", background: sent[deal.id] ? "#10B981" : "#1D9E75", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {sent[deal.id] ? "✓ Sent" : "Send on WA"}
                </button>
                <button
                  onClick={() => setMessages(p => ({ ...p, [deal.id]: "" }))}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 11, cursor: "pointer" }}>
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
