import React from "react";

// ── Milestones ────────────────────────────────────────────────────────────────
const MILESTONES = {
  BID_ACCEPTED:      { label: "Bid Accepted",       icon: "✅", color: "#059669", bg: "#ECFDF5", nextStatus: "bid_won"     },
  PAYMENT_CONFIRMED: { label: "Payment Confirmed",  icon: "💳", color: "#2563EB", bg: "#DBEAFE", nextStatus: "paid"        },
  TRACKING_RECEIVED: { label: "Tracking Received",  icon: "🚚", color: "#7C3AED", bg: "#EDE9FE", nextStatus: "in_transit"  },
  ARRIVED:           { label: "Arrived",            icon: "📦", color: "#0891B2", bg: "#CFFAFE", nextStatus: "arrived"     },
};

function MilestoneBadge({ milestone }) {
  const m = MILESTONES[milestone];
  if (!m) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 6, padding: "4px 10px", borderRadius: 20,
                  background: m.bg, border: `1px solid ${m.color}30` }}>
      <span style={{ fontSize: 13 }}>{m.icon}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: m.color }}>{m.label}</span>
    </div>
  );
}

function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SOURCING MESSAGES — Timeline section extracted from DealDetail
// ══════════════════════════════════════════════════════════════════════════════
export default function SourcingMessages({
  deal,
  messages,
  msgsLoaded,
  timelineRef,
  gmailMsgs,
  waMsgs,
  setPasteText,
  setPasteStep,
  setDetected,
  setShowPaste,
  addGmailNote,
}) {
  return (
    /* ══════════════════════════════════════════════════════════════════
        TIMELINE
    ══════════════════════════════════════════════════════════════════ */
    <div style={{ background: "#fff", borderRadius: 16, marginTop: 10,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>

      {/* Timeline header */}
      <div style={{ padding: "13px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>
          TIMELINE
        </div>
        {/* channel counts */}
        <div style={{ display: "flex", gap: 6 }}>
          {gmailMsgs.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", padding: "2px 7px", borderRadius: 8 }}>
              📧 {gmailMsgs.length}
            </span>
          )}
          {waMsgs.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "2px 7px", borderRadius: 8 }}>
              💬 {waMsgs.length}
            </span>
          )}
        </div>
      </div>

      {/* Messages list */}
      <div ref={timelineRef} style={{ maxHeight: 380, overflowY: "auto", padding: "10px 12px" }}>
        {!msgsLoaded ? (
          <div style={{ textAlign: "center", padding: 24, color: "#94A3B8", fontSize: 12 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: 28, color: "#CBD5E1", fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            No messages yet.<br />
            <span style={{ fontSize: 12 }}>Paste a WhatsApp message or add a Gmail note below.</span>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isGmail  = msg.channel === "gmail";
            const isOut    = msg.direction === "outbound";
            const prevMsg  = messages[idx - 1];
            const showDate = !prevMsg || new Date(msg.ts).toDateString() !== new Date(prevMsg.ts).toDateString();

            return (
              <div key={msg.id}>
                {/* Date separator */}
                {showDate && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 8px" }}>
                    <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", flexShrink: 0 }}>
                      {new Date(msg.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                  </div>
                )}

                {/* Message bubble */}
                <div style={{
                  display: "flex", gap: 9, marginBottom: 12,
                  flexDirection: isOut ? "row-reverse" : "row",
                }}>
                  {/* Channel icon */}
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: isGmail ? "#FEF2F2" : "#F0FDF4",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, alignSelf: "flex-start",
                    border: `2px solid ${isGmail ? "#FECACA" : "#BBF7D0"}`,
                  }}>
                    {isGmail ? "📧" : "💬"}
                  </div>

                  {/* Bubble content */}
                  <div style={{ maxWidth: "82%", minWidth: 0 }}>
                    {/* sender + time */}
                    <div style={{
                      display: "flex", gap: 6, alignItems: "baseline", marginBottom: 4,
                      flexDirection: isOut ? "row-reverse" : "row",
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: isGmail ? "#DC2626" : "#16A34A",
                      }}>
                        {isOut ? "You" : (msg.sender || "Supplier")}
                      </span>
                      <span style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(msg.ts)}</span>
                    </div>

                    {/* bubble */}
                    <div style={{
                      padding: "9px 12px", borderRadius: isOut ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                      background: isGmail
                        ? (isOut ? "#FEF2F2" : "#fff")
                        : (isOut ? "#F0FDF4" : "#fff"),
                      border: `1.5px solid ${isGmail ? "#FECACA" : "#BBF7D0"}`,
                      fontSize: 13, color: "#1E293B", lineHeight: 1.55,
                      wordBreak: "break-word",
                    }}>
                      {msg.content}
                    </div>

                    {/* Milestone badge */}
                    {msg.milestone && MILESTONES[msg.milestone] && (
                      <MilestoneBadge milestone={msg.milestone} />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add message actions */}
      <div style={{ display: "flex", gap: 0, borderTop: "1px solid #F1F5F9" }}>
        <button onClick={() => { setPasteText(""); setPasteStep("input"); setDetected(null); setShowPaste(true); }}
          style={{
            flex: 1, padding: "12px 8px", border: "none", borderRight: "1px solid #F1F5F9",
            background: "#F0FDF4", color: "#16A34A", fontWeight: 700, fontSize: 12, cursor: "pointer",
            borderRadius: "0 0 0 16px",
          }}>
          💬 Paste WhatsApp
        </button>
        <button onClick={addGmailNote}
          style={{
            flex: 1, padding: "12px 8px", border: "none",
            background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer",
            borderRadius: "0 0 16px 0",
          }}>
          📧 Add Gmail Note
        </button>
      </div>
    </div>
  );
}
