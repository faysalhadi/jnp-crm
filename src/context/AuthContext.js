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

  // Use Supabase native session management — no manual localStorage
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
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
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{
      session, setSession,
      user: session?.user || null,
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
