export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning!";
  if (h < 17) return "Good afternoon!";
  return "Good evening!";
}

export function timeAgo(ts) {
  if (!ts) return "—";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function waTsFormat(ts) {
  if (!ts) return "";
  const now  = new Date();
  const d    = new Date(ts);
  const diffMs  = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMs / 3600000);
  const diffDays= Math.floor(diffMs / 86400000);
  if (diffMin < 1)  return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffH   < 24) return `${diffH}h`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
}

export function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

export function autoTier(deals) {
  const closed = (deals || []).filter(d => d.stage === "closed").length;
  if (closed >= 3) return "vip";
  if (closed >= 1) return "regular";
  return "cold";
}

export function monthRevenue(customers) {
  const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
  let total = 0;
  (customers || []).forEach(c =>
    (c.deals || []).forEach(d => {
      if (d.stage === "closed" && d.closed_at && new Date(d.closed_at) >= start)
        total += (d.value || 0);
    })
  );
  return total;
}

export function getAnthropicKey() { return localStorage.getItem("jnp_anthropic_key") || ""; }
export function saveAnthropicKey(k) { localStorage.setItem("jnp_anthropic_key", k); }

export function parseGB(str) {
  if (!str) return 0;
  const tb = str.match(/(\d+)\s*TB/i);
  if (tb) return parseInt(tb[1]) * 1024;
  const gb = str.match(/(\d+)/);
  return gb ? parseInt(gb[1]) : 0;
}

export function labelGB(gb) {
  if (!gb) return "";
  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`;
}

export function cleanWhatsAppText(text) {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp === 0x202F || cp === 0x00A0) { out += ' '; continue; }
    if (cp === 0x200E || cp === 0x200F || cp === 0x000D) continue;
    out += text[i];
  }
  return out;
}
