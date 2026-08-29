// Soft holds on stock units.
//
// DESIGN RULE: expiry is COMPUTED, never stored. There is no cron and no
// background timer. A 'quoted' row older than HOLD_HOURS is simply treated as
// available everywhere — every availability check goes through effectiveStatus.
//
// Pure helpers only: no React, no supabase. Every function must survive a null
// row and a row whose quoted_* columns do not exist yet.

export const HOLD_HOURS = 48;

const HOLD_MS = HOLD_HOURS * 60 * 60 * 1000;

// Epoch ms of the moment the hold started, or null when the row is not held.
function holdStartedAt(stockItem) {
  if (!stockItem || stockItem.status !== "quoted") return null;
  const raw = stockItem.quoted_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export function isHoldActive(stockItem) {
  const started = holdStartedAt(stockItem);
  if (started === null) return false;
  return Date.now() - started < HOLD_MS;
}

export function holdRemainingMs(stockItem) {
  const started = holdStartedAt(stockItem);
  if (started === null) return 0;
  const left = HOLD_MS - (Date.now() - started);
  return left > 0 ? left : 0;
}

export function formatHoldRemaining(stockItem) {
  const ms = holdRemainingMs(stockItem);
  if (ms <= 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h left`;
}

// The status to ACT on. A 'quoted' row whose hold has expired is available.
export function effectiveStatus(stockItem) {
  if (!stockItem) return null;
  const status = stockItem.status || null;
  if (status === "quoted" && !isHoldActive(stockItem)) return "available";
  return status;
}

// Millisecond timestamp the hold expires at, or null when not held.
export function holdExpiresAt(stockItem) {
  const started = holdStartedAt(stockItem);
  return started === null ? null : started + HOLD_MS;
}
