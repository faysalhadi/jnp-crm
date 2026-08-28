import ownerOnly from "../layout/ownerOnly";
import React, { useState, useMemo, useRef } from "react";
import { useUI } from "../../context/UIContext";

function ScreenTallyTab({ onClose }) {
  const { showToast } = useUI();
  const [codes, setCodes] = useState([]); // [{ code, count }]
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const normalize = (raw) => raw.trim().toUpperCase().replace(/\s+/g, "");

  const normalizedInput = normalize(input);

  const exactMatch = useMemo(
    () => codes.find(c => c.code === normalizedInput) || null,
    [codes, normalizedInput]
  );

  const suggestions = useMemo(() => {
    if (!normalizedInput) return [];
    const prefix = [];
    const mid = [];
    codes.forEach(c => {
      if (c.code === normalizedInput) return; // exact match shown separately
      if (c.code.startsWith(normalizedInput)) prefix.push(c);
      else if (c.code.includes(normalizedInput)) mid.push(c);
    });
    return [...prefix, ...mid].slice(0, 6);
  }, [codes, normalizedInput]);

  const totalUnits = useMemo(() => codes.reduce((sum, c) => sum + c.count, 0), [codes]);
  const sortedCodes = useMemo(() => [...codes].sort((a, b) => a.code.localeCompare(b.code)), [codes]);

  function addOrIncrement(rawCode) {
    const code = normalize(rawCode);
    if (!code) return;
    setCodes(prev => {
      const existing = prev.find(c => c.code === code);
      if (existing) {
        return prev.map(c => c.code === code ? { ...c, count: c.count + 1 } : c);
      }
      return [...prev, { code, count: 1 }];
    });
    setInput("");
    inputRef.current?.focus();
  }

  function decrement(code) {
    setCodes(prev =>
      prev
        .map(c => c.code === code ? { ...c, count: c.count - 1 } : c)
        .filter(c => c.count > 0)
    );
  }

  function removeRow(code) {
    setCodes(prev => prev.filter(c => c.code !== code));
  }

  function handleClear() {
    if (codes.length === 0) return;
    if (window.confirm(`Clear all ${codes.length} codes? This can't be undone.`)) {
      setCodes([]);
      showToast("Tally cleared", "success");
    }
  }

  async function handleCopy() {
    if (codes.length === 0) {
      showToast("Nothing to copy yet", "error");
      return;
    }
    const lines = ["CODE\tQTY"];
    sortedCodes.forEach(c => lines.push(`${c.code}\t${c.count}`));
    lines.push("");
    lines.push(`TOTAL UNITS\t${totalUnits}`);
    lines.push(`UNIQUE CODES\t${codes.length}`);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard ✓", "success");
    } catch {
      showToast("Couldn't copy — try again", "error");
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    addOrIncrement(input);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 250,
      background: "#0F1115", color: "#F1F5F9",
      display: "flex", flexDirection: "column",
      fontFamily: "inherit",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 16px 12px", borderBottom: "1px solid #23262E",
        flexShrink: 0,
      }}>
        <button onClick={onClose}
          style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "#1C1F26", color: "#F1F5F9", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>🧮 Screen Tally</div>
          <div style={{ fontSize: 11, color: "#7C8595" }}>Session-only — log panels as you sort</div>
        </div>
      </div>

      {/* Running totals */}
      <div style={{ display: "flex", gap: 10, padding: "14px 16px", flexShrink: 0 }}>
        <div style={{ flex: 1, background: "#1C1F26", borderRadius: 14, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#7C8595", fontWeight: 700, letterSpacing: 0.5 }}>TOTAL UNITS</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#10B981" }}>{totalUnits}</div>
        </div>
        <div style={{ flex: 1, background: "#1C1F26", borderRadius: 14, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#7C8595", fontWeight: 700, letterSpacing: 0.5 }}>UNIQUE CODES</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#6366F1" }}>{codes.length}</div>
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: "0 16px 10px", flexShrink: 0, position: "relative" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type or scan panel code…"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: "100%", padding: "16px 14px", borderRadius: 14,
            border: `2px solid ${exactMatch ? "#D97706" : "#2A2E38"}`,
            background: "#1C1F26", color: "#F1F5F9",
            fontSize: 18, fontWeight: 700, letterSpacing: 0.5,
            outline: "none", boxSizing: "border-box",
          }}
        />

        {exactMatch && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "#D97706" }}>
            ALREADY HAVE ×{exactMatch.count}
          </div>
        )}

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div style={{
            marginTop: 8, background: "#1C1F26", borderRadius: 14,
            border: "1px solid #2A2E38", overflow: "hidden",
          }}>
            {suggestions.map(s => (
              <button key={s.code} type="button"
                onClick={() => { setInput(s.code); inputRef.current?.focus(); }}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "11px 14px", background: "transparent", border: "none",
                  borderBottom: "1px solid #2A2E38", color: "#F1F5F9",
                  fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}>
                <span>{s.code}</span>
                <span style={{ color: "#7C8595", fontSize: 12 }}>×{s.count}</span>
              </button>
            ))}
          </div>
        )}

        <button type="submit"
          disabled={!normalizedInput}
          style={{
            width: "100%", marginTop: 10, padding: "15px 0", borderRadius: 14,
            border: "none", fontSize: 16, fontWeight: 800, cursor: normalizedInput ? "pointer" : "not-allowed",
            background: !normalizedInput ? "#23262E" : exactMatch ? "#D97706" : "#6366F1",
            color: !normalizedInput ? "#5B6472" : "#fff",
          }}>
          {exactMatch ? "Add another (+1)" : "Add"}
        </button>
      </form>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px" }}>
        {sortedCodes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#5B6472" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🖥️</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>No codes logged yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Start typing a panel code above</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedCodes.map(c => (
              <div key={c.code} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#1C1F26", borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#F1F5F9" }}>{c.code}</div>
                  <div style={{ fontSize: 11, color: "#7C8595", marginTop: 1 }}>×{c.count}</div>
                </div>
                <button onClick={() => decrement(c.code)}
                  style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "#2A2E38", color: "#F1F5F9", fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  −1
                </button>
                <button onClick={() => removeRow(c.code)}
                  style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "#3A1F22", color: "#EF4444", fontSize: 16, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 10, padding: "12px 16px 18px", borderTop: "1px solid #23262E", flexShrink: 0 }}>
        <button onClick={handleClear}
          style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1.5px solid #3A1F22", background: "transparent", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Clear
        </button>
        <button onClick={handleCopy}
          style={{ flex: 2, padding: "13px 0", borderRadius: 12, border: "none", background: "#10B981", color: "#0F1115", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          📋 Copy list
        </button>
      </div>
    </div>
  );
}

export default ownerOnly(ScreenTallyTab);
