import { supabase } from "../supabase";
import { callClaude, buildSystemPromptFromCache } from "../utils/claude";

export async function loadMessages(dealId) {
  if (!dealId) return [];
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("deal_id", dealId)
    .order("ts", { ascending: true });
  return data || [];
}

export async function saveMessage(dealId, role, content, sent) {
  const { data } = await supabase
    .from("messages")
    .insert({
      deal_id: dealId,
      role,
      content,
      sent: sent || null,
      ts: new Date().toISOString(),
    })
    .select()
    .single();
  return data;
}

export async function generateReply(messages, cachedStock, anthropicKey, cType) {
  const history = messages.map(m => ({
    role: m.role === "customer" ? "user" : "assistant",
    content: m.sent && m.sent !== "NOT_SENT"
      ? m.sent : m.content,
  }));
  const system = buildSystemPromptFromCache(cachedStock);
  const raw = await callClaude(anthropicKey, history, system);
  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(clean);
    return parsed.reply || raw;
  } catch {
    return raw;
  }
}
