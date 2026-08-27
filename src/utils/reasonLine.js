function fmt(x) {
  return `AED ${Number(x).toLocaleString()}`;
}

function device(deal) {
  return [deal?.brand, deal?.model].filter(Boolean).join(" ") || "open request";
}

function clientName(customer) {
  const name = customer?.name || "";
  if (name.length <= 18) return name;
  return name.split(" ")[0];
}

function overdueInfo(followUp) {
  if (!followUp?.due_at) return null;
  const diffMs = Date.now() - new Date(followUp.due_at).getTime();
  if (diffMs <= 0) return null;
  const days = Math.floor(diffMs / 86400000);
  return days >= 1 ? days : null;
}

function isDueToday(followUp) {
  if (!followUp?.due_at) return false;
  const diffMs = new Date(followUp.due_at).getTime() - Date.now();
  return diffMs > 0 && diffMs < 86400000;
}

export function getReasonLine(customer, ctx = {}) {
  const { openDeal, followUp, matchedStock, daysSilent } = ctx;
  const dev = device(openDeal);
  const overdueDays = overdueInfo(followUp);

  // 1. Follow-up overdue
  if (overdueDays !== null) {
    if (openDeal?.budget || openDeal?.value) {
      const n = overdueDays;
      const s = n === 1 ? "" : "s";
      return `Quoted ${fmt(openDeal.budget || openDeal.value)} ${n} day${s} ago — no reply`;
    }
    const n = overdueDays;
    const s = n === 1 ? "" : "s";
    return `Follow-up ${n} day${s} overdue`;
  }

  // 2. Follow-up due today
  if (isDueToday(followUp)) return "Follow-up due today";

  // 3. Confirmed pending pickup
  if (openDeal?.stage === "confirmed_pending_pickup") {
    let line = `Pickup today — ${dev}`;
    if (openDeal.balance) line += `, ${fmt(openDeal.balance)} balance`;
    return line;
  }

  // 4. Stock match
  if (matchedStock) {
    const s = matchedStock.stock || matchedStock;
    const stockDev = [s.brand, s.model].filter(Boolean).join(" ") || "matching device";
    return `${stockDev} just landed — matches what he wants`;
  }

  // 5. Open deal, silent 3+ days
  if (openDeal && daysSilent >= 3) return `Silent ${daysSilent} days on ${dev}`;

  // 6. Open deal
  if (openDeal) {
    let line = dev;
    if (openDeal.budget) line += ` — ${fmt(openDeal.budget)}`;
    return line;
  }

  // 7. No contact in 60+ days
  if (customer?.last_activity_at) {
    const days = Math.floor((Date.now() - new Date(customer.last_activity_at).getTime()) / 86400000);
    if (days >= 60) {
      const months = Math.floor(days / 30);
      return `No contact in ${months} month${months === 1 ? "" : "s"}`;
    }
  }

  // 8. Fallback
  return "No open request";
}

export function getQuickMessage(customer, ctx = {}) {
  const { openDeal, followUp, matchedStock, daysSilent } = ctx;
  const name = clientName(customer);
  const dev = device(openDeal);
  const overdueDays = overdueInfo(followUp);

  // 1. Overdue quote
  if (overdueDays !== null) {
    const money = openDeal?.budget || openDeal?.value;
    if (money) return `Hi ${name}, following up on the ${dev} — ${fmt(money)}. Still interested?`;
    return `Hi ${name}, following up on the ${dev}. Still interested?`;
  }

  // 2. Follow-up due today
  if (isDueToday(followUp)) return `Hi ${name}, checking in on the ${dev}. Any update?`;

  // 3. Pickup today
  if (openDeal?.stage === "confirmed_pending_pickup") {
    const balance = openDeal.balance ? fmt(openDeal.balance) : null;
    return `Hi ${name}, confirming pickup today for the ${dev}${balance ? `. Balance ${balance}` : ""}. What time works for you?`;
  }

  // 4. Stock match
  if (matchedStock) {
    const s = matchedStock.stock || matchedStock;
    const stockDev = [s.brand, s.model].filter(Boolean).join(" ") || "matching device";
    return `Hi ${name}, just got a ${stockDev} in stock. Want the details?`;
  }

  // 5. Silent on deal
  if (openDeal && daysSilent >= 3) return `Hi ${name}, any update on the ${dev}?`;

  // 6. Open deal
  if (openDeal) return `Hi ${name}, following up on the ${dev}. Let me know if you need anything.`;

  // 7. Cold / re-engage
  if (customer?.last_activity_at) {
    const days = Math.floor((Date.now() - new Date(customer.last_activity_at).getTime()) / 86400000);
    if (days >= 60) return `Hi ${name}, we have new stock in. Anything you're looking for right now?`;
  }

  // 8. Fallback
  return `Hi ${name}, checking in — anything you need at the moment?`;
}
