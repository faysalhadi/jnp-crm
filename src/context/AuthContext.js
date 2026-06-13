import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabase";
import { getAnthropicKey, saveAnthropicKey } from "../utils/helpers";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState(getAnthropicKey);
  const [keyInput, setKeyInput] = useState("");

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('jnp_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.access_token) {
          // Restore session into supabase client
          supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token || '',
          }).then(({ data, error }) => {
            if (error || !data?.session) {
              // Token expired or invalid — clear it and force re-login
              localStorage.removeItem('jnp_session');
              setSession(null);
            } else {
              // Update stored session with refreshed tokens
              localStorage.setItem('jnp_session', JSON.stringify(data.session));
              setSession(data.session);
            }
            setAuthLoading(false);
          }).catch(() => {
            localStorage.removeItem('jnp_session');
            setSession(null);
            setAuthLoading(false);
          });
          return;
        }
      } catch {}
    }
    setSession(null);
    setAuthLoading(false);
  }, []);

  async function handleAuth() {
    setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword
        });
        if (error) { setAuthError(error.message); setAuthBusy(false); return; }
        if (data?.session) {
          // Store session in localStorage manually
          localStorage.setItem('jnp_session', JSON.stringify(data.session));
          setSession(data.session);
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword
        });
        if (error) { setAuthError(error.message); setAuthBusy(false); return; }
        setAuthError("✅ Account created! You can now sign in.");
        setAuthMode("login");
      }
    } catch (e) {
      setAuthError("Something went wrong. Please try again.");
    }
    setAuthBusy(false);
  }

  async function handleLogout() {
    localStorage.removeItem('jnp_session');
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{
      session, setSession,
      authLoading,
      authMode, setAuthMode,
      authEmail, setAuthEmail,
      authPassword, setAuthPassword,
      authError, setAuthError,
      authBusy,
      anthropicKey, setAnthropicKey,
      keyInput, setKeyInput,
      handleAuth, handleLogout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
