import React from "react";
import { useAuth } from "../../context/AuthContext";

export default function AuthScreen() {
  const {
    authMode, setAuthMode,
    authEmail, setAuthEmail,
    authPassword, setAuthPassword,
    authError, setAuthError,
    authBusy,
    handleAuth,
  } = useAuth();
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 24, padding: 32, boxShadow: "0 8px 40px rgba(99,102,241,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💻</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>Laptop for Less</div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>CRM — {authMode === "login" ? "Sign in to continue" : "Create your account"}</div>
        </div>

        {authError && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: authError.startsWith("✅") ? "#ECFDF5" : "#FEF2F2", color: authError.startsWith("✅") ? "#10B981" : "#EF4444", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
            {authError}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email address" type="email"
            style={{ padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
          <input value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password" type="password"
            onKeyDown={e => e.key === "Enter" && handleAuth()}
            style={{ padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
        </div>

        <button onClick={handleAuth} disabled={authBusy || !authEmail || !authPassword}
          style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: authBusy ? "#C7D2FE" : "#6366F1", color: "#fff", fontWeight: 800, fontSize: 15, cursor: authBusy ? "not-allowed" : "pointer", marginBottom: 12 }}>
          {authBusy ? "Please wait..." : authMode === "login" ? "Sign In →" : "Create Account →"}
        </button>

        <div style={{ textAlign: "center", fontSize: 13, color: "#94A3B8" }}>
          {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}
            style={{ color: "#6366F1", fontWeight: 700, cursor: "pointer" }}>
            {authMode === "login" ? "Sign up" : "Sign in"}
          </span>
        </div>
      </div>
    </div>
  );
}
