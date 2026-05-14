import { useState } from "react";
import { supabase } from "./supabase";

// ── type definitions ──────────────────────────────────────────────────────────
const TYPES = [
  {
    id: "client",
    emoji: "🔴",
    label: "Client",
    sub: "I sell to them",
    detail: "Retail buyer — personal or office use",
    comms: "WhatsApp",
    color: "#EF4444",
    bg: "#FEF2F2",
    border: "#FECACA",
  },
  {
    id: "trader",
    emoji: "🟡",
    label: "Trader",
    sub: "I buy and sell",
    detail: "UAE market trader, JNP Market etc",
    comms: "WhatsApp",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  {
    id: "supplier",
    emoji: "🔵",
    label: "Supplier",
    sub: "I buy from them",
    detail: "International bulk supplier — USA/UK",
    comms: "Gmail + WhatsApp",
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
];

const TYPE_MAP = Object.fromEntries(TYPES.map(t => [t.id, t]));

const EMPTY_FORM = {
  name: "", number: "", notes: "",
  // client
  looking_for: "", budget: "", urgent: false,
  // trader
  group: "", usually_sells: "", usually_buys: "",
  // supplier
  email: "", location: "", currency: "USD", sends_via: "gmail",
};

// ── main component ────────────────────────────────────────────────────────────
export default function ContactModal({ defaultType, onClose, onCreated }) {
  const [step,    setStep]    = useState(defaultType ? 2 : 1);
  const [type,    setType]    = useState(defaultType || null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [created, setCreated] = useState(null); // { customer, deal }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const t = type ? TYPE_MAP[type] : null;

  // ── save ─────────────────────────────────────────────────────────────────
  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);

    const customerRow = {
      name:         form.name.trim(),
      number:       form.number.trim() || null,
      notes:        form.notes.trim()  || null,
      contact_type: type,
      tier:         "cold",
      urgent:       type === "client" ? form.urgent : false,
      last_active:  new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    };

    if (type === "trader") {
      customerRow.location = form.group.trim() || null;
    }
    if (type === "supplier") {
      customerRow.email    = form.email.trim()    || null;
      customerRow.location = form.location.trim() || null;
      customerRow.currency = form.currency        || "USD";
    }

    const { data: c, error } = await supabase
      .from("customers").insert(customerRow).select().single();
    if (error) { alert("Failed to save: " + error.message); setSaving(false); return; }

    let deal = null;

    if (type === "client") {
      const { data: d } = await supabase.from("deals").insert({
        customer_id: c.id,
        stage:       "new_inquiry",
        budget:      form.budget ? parseFloat(form.budget) : null,
        notes:       form.looking_for.trim() || null,
      }).select().single();
      deal = d;
    }

    if (type === "supplier") {
      // mirror into suppliers table (best-effort)
      try {
        await supabase.from("suppliers").insert({
          name:     form.name.trim(),
          email:    form.email.trim()    || null,
          whatsapp: form.number.trim()   || null,
          location: form.location.trim() || null,
          currency: form.currency        || "USD",
          notes:    form.notes.trim()    || null,
        });
      } catch {}
    }

    setSaving(false);
    setCreated({ customer: c, deal });
    setStep(3);
    // onCreated is called when user taps "Open Chat" in step 3
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      zIndex: 500, overflowY: "auto",
    }}>
      <div style={{
        minHeight: "100%", padding: "16px 12px 40px",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <div style={{
          background: "#fff", borderRadius: 24, padding: 24,
          width: "100%", maxWidth: 440, position: "relative",
        }}>
          {/* close */}
          <button onClick={onClose} style={{
            position: "absolute", top: 16, right: 16,
            width: 30, height: 30, borderRadius: 8, border: "none",
            background: "#F1F5F9", cursor: "pointer", fontSize: 14, color: "#64748B",
          }}>✕</button>

          {/* ── STEP 1 — pick type ── */}
          {step === 1 && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
                Who are you adding?
              </div>
              <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>
                Pick a contact type to continue
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {TYPES.map(tp => {
                  const selected = type === tp.id;
                  return (
                    <button key={tp.id} onClick={() => setType(tp.id)} style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                      borderRadius: 16, border: `2px solid ${selected ? tp.color : "#E2E8F0"}`,
                      background: selected ? tp.bg : "#fff", cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}>
                      <span style={{ fontSize: 28, flexShrink: 0 }}>{tp.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: selected ? tp.color : "#0F172A" }}>
                          {tp.label}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{tp.sub}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                          {tp.detail} · {tp.comms}
                        </div>
                      </div>
                      {selected && (
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: tp.color, display: "flex", alignItems: "center",
                          justifyContent: "center", flexShrink: 0,
                        }}>
                          <span style={{ color: "#fff", fontSize: 13, lineHeight: 1 }}>✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <button onClick={() => setStep(2)} disabled={!type} style={{
                width: "100%", padding: 14, borderRadius: 14, border: "none",
                background: type ? (t?.color || "#6366F1") : "#E2E8F0",
                color: type ? "#fff" : "#94A3B8",
                fontWeight: 800, fontSize: 15, cursor: type ? "pointer" : "not-allowed",
              }}>
                Next →
              </button>
            </>
          )}

          {/* ── STEP 2 — fill details ── */}
          {step === 2 && t && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <button onClick={() => defaultType ? onClose() : setStep(1)} style={{
                  width: 32, height: 32, borderRadius: 8, border: "none",
                  background: "#F1F5F9", cursor: "pointer", fontSize: 16,
                }}>←</button>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
                    {t.emoji} Add {t.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>{t.sub}</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* ── ALL TYPES ── */}
                <Field label="NAME *" value={form.name} onChange={v => set("name", v)} placeholder={`e.g. ${type === "client" ? "Ali Hassan" : type === "trader" ? "Mohammed Trading" : "Electro Computer Warehouse"}`} />
                <Field label="WHATSAPP NUMBER" value={form.number} onChange={v => set("number", v)} placeholder="e.g. 971501234567" type="tel" />

                {/* ── CLIENT EXTRAS ── */}
                {type === "client" && (
                  <>
                    <Field label="LOOKING FOR" value={form.looking_for} onChange={v => set("looking_for", v)} placeholder="e.g. MacBook Air M2 16GB, budget 4000 AED" />
                    <div>
                      <div style={labelStyle}>BUDGET (AED)</div>
                      <input type="number" value={form.budget} onChange={e => set("budget", e.target.value)}
                        placeholder="e.g. 3500"
                        style={inputStyle} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                  padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0",
                                  background: form.urgent ? "#FEF2F2" : "#F8FAFC" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: form.urgent ? "#EF4444" : "#0F172A" }}>Urgent</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>Needs device ASAP</div>
                      </div>
                      <button onClick={() => set("urgent", !form.urgent)} style={{
                        width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                        background: form.urgent ? "#EF4444" : "#E2E8F0",
                        position: "relative", transition: "background 0.2s",
                      }}>
                        <div style={{
                          position: "absolute", top: 2,
                          left: form.urgent ? 22 : 2,
                          width: 20, height: 20, borderRadius: "50%",
                          background: "#fff", transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </button>
                    </div>
                  </>
                )}

                {/* ── TRADER EXTRAS ── */}
                {type === "trader" && (
                  <>
                    <Field label="GROUP / LOCATION" value={form.group} onChange={v => set("group", v)} placeholder="e.g. JNP Market, Computer Mall" />
                    <Field label="USUALLY SELLS" value={form.usually_sells} onChange={v => set("usually_sells", v)} placeholder="e.g. HP laptops, Dell laptops" />
                    <Field label="USUALLY BUYS" value={form.usually_buys} onChange={v => set("usually_buys", v)} placeholder="e.g. MacBooks, gaming laptops" />
                  </>
                )}

                {/* ── SUPPLIER EXTRAS ── */}
                {type === "supplier" && (
                  <>
                    <Field label="EMAIL ADDRESS" value={form.email} onChange={v => set("email", v)} placeholder="e.g. sobia@example.com" type="email" />
                    <Field label="LOCATION" value={form.location} onChange={v => set("location", v)} placeholder="e.g. Texas, USA" />
                    <div>
                      <div style={labelStyle}>CURRENCY</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["USD", "GBP", "EUR"].map(c => (
                          <button key={c} onClick={() => set("currency", c)} style={{
                            flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                            fontSize: 13, fontWeight: 700, cursor: "pointer",
                            background: form.currency === c ? "#2563EB" : "#F1F5F9",
                            color:      form.currency === c ? "#fff"    : "#64748B",
                          }}>{c}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ── NOTES (all types) ── */}
                <div>
                  <div style={labelStyle}>NOTES</div>
                  <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
                    placeholder={
                      type === "client"   ? "e.g. Prefers cash, lives in Sharjah…" :
                      type === "trader"   ? "e.g. Good for HP lots, replies fast…" :
                      "e.g. Wire transfer before release. Mondays 12PM deadline…"
                    }
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
                </div>

                <button onClick={save} disabled={saving || !form.name.trim()} style={{
                  padding: 14, borderRadius: 14, border: "none",
                  background: saving || !form.name.trim() ? "#E2E8F0" : t.color,
                  color: saving || !form.name.trim() ? "#94A3B8" : "#fff",
                  fontWeight: 800, fontSize: 15,
                  cursor: saving || !form.name.trim() ? "not-allowed" : "pointer",
                  marginTop: 4,
                }}>
                  {saving ? "Saving…" : `Save ${t.label} →`}
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3 — success ── */}
          {step === 3 && created && (() => {
            const c = created.customer;
            const cType = TYPE_MAP[c.contact_type] || TYPE_MAP["client"];
            return (
              <>
                <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 6 }}>
                    {c.name} added!
                  </div>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "4px 14px", borderRadius: 20,
                    background: cType.bg, color: cType.color,
                    fontSize: 13, fontWeight: 700,
                  }}>
                    {cType.emoji} {cType.label}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button onClick={() => onCreated && onCreated(c, created.deal)} style={{
                    padding: 13, borderRadius: 14, border: "none",
                    background: cType.color, color: "#fff",
                    fontWeight: 800, fontSize: 14, cursor: "pointer",
                  }}>
                    Open Chat →
                  </button>
                  <button onClick={() => {
                    setStep(defaultType ? 2 : 1);
                    setType(defaultType || null);
                    setForm(EMPTY_FORM);
                    setCreated(null);
                  }} style={{
                    padding: 13, borderRadius: 14,
                    border: "1.5px solid #E2E8F0", background: "#fff",
                    color: "#64748B", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}>
                    + Add Another
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────
const labelStyle = {
  fontSize: 10, fontWeight: 700, color: "#94A3B8",
  letterSpacing: 0.5, marginBottom: 5,
};

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
  boxSizing: "border-box",
};

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}
