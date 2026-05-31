// ── Notification permission ───────────────────────────────────────────────────
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

export function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// ── Show notification via Service Worker ─────────────────────────────────────
export async function showNotification(title, body, tag = "jnp") {
  if (!("serviceWorker" in navigator)) {
    // Fallback: direct notification
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/logo192.png" });
    }
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    tag,
    icon: "/logo192.png",
    badge: "/logo192.png",
    vibrate: [200, 100, 200],
    requireInteraction: false,
  });
}

// ── Schedule checker — runs every minute while app is open ───────────────────
let _checkInterval = null;

export function startNotificationChecker(getReminders, getFollowUps) {
  if (_checkInterval) return;
  _checkInterval = setInterval(async () => {
    if (Notification.permission !== "granted") return;
    const now  = new Date();
    const key  = `jnp_notified_${now.toISOString().slice(0, 10)}`;
    const done = JSON.parse(localStorage.getItem(key) || "{}");

    // Check personal reminders
    const reminders = getReminders();
    for (const r of reminders) {
      if (r.status === "done" || done[`r_${r.id}`]) continue;
      const due = new Date(r.due_at);
      const diffMins = Math.round((due - now) / 60000);
      if (diffMins <= 5 && diffMins > -60) {
        const label = diffMins <= 0 ? "Due now" : `Due in ${diffMins} min`;
        await showNotification(`⏰ ${label}: ${r.title}`, r.note || "", `r_${r.id}`);
        done[`r_${r.id}`] = true;
        localStorage.setItem(key, JSON.stringify(done));
      }
    }

    // Check follow-ups
    const followUps = getFollowUps();
    for (const f of followUps) {
      if (f.status === "done" || done[`f_${f.id}`]) continue;
      const due = new Date(f.due_at);
      const diffMins = Math.round((due - now) / 60000);
      if (diffMins <= 5 && diffMins > -60) {
        const label = diffMins <= 0 ? "Overdue" : `Due in ${diffMins} min`;
        await showNotification(
          `📞 ${label}: ${f.customer_name || "Follow up"}`,
          f.note || "Time to follow up",
          `f_${f.id}`
        );
        done[`f_${f.id}`] = true;
        localStorage.setItem(key, JSON.stringify(done));
      }
    }
  }, 60 * 1000); // Check every minute
}

export function stopNotificationChecker() {
  if (_checkInterval) { clearInterval(_checkInterval); _checkInterval = null; }
}
