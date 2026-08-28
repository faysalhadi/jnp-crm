// ── Role-based access — the single source of truth ───────────────────────────
// Every nav component and every restricted tab asks this module. No component
// decides access on its own, so a new nav surface cannot quietly bypass the
// rules the way the client detail view's private sidebar did.

// The full nav, in display order. Nav components render from this list and
// filter it with canAccessTab — they no longer keep private copies.
// `short` is what the cramped mobile bottom nav renders; `label` is the full
// name used by the sidebar.
export const ALL_NAV_TABS = [
  { key: "home",      icon: "🏠", label: "Home",       short: "Home" },
  { key: "customers", icon: "👥", label: "Clients",    short: "Clients" },
  { key: "stock",     icon: "📦", label: "Stock",      short: "Stock" },
  { key: "sourcing",  icon: "🌍", label: "Sourcing",   short: "Sourcing" },
  { key: "traders",   icon: "🏪", label: "Traders",    short: "Traders" },
  { key: "ask",       icon: "🤖", label: "Ask Claude", short: "Ask" },
];

// Tabs a salesperson may reach. Everything else is owner-only — including the
// tabs that are only reachable from the side drawer (marketing, parts, sales,
// screentally), since those are set as activeTab values too.
export const SALESPERSON_TABS = ["home", "customers", "stock"];

// Side drawer items a salesperson may reach.
export const SALESPERSON_DRAWER_ITEMS = ["settings", "signout"];

// An owner who is viewing the CRM as a salesperson gets the salesperson's
// restrictions — that is the whole point of the mode.
function hasFullAccess({ isOwner, isViewingAs }) {
  return Boolean(isOwner) && !isViewingAs;
}

export function canAccessTab(tabId, roles) {
  if (hasFullAccess(roles)) return true;
  return SALESPERSON_TABS.includes(tabId);
}

export function canAccessDrawerItem(itemId, roles) {
  if (hasFullAccess(roles)) return true;
  return SALESPERSON_DRAWER_ITEMS.includes(itemId);
}
