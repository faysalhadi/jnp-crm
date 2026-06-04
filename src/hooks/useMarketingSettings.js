import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

// Keys we sync to Supabase
const SYNC_KEYS = [
  "jnp_strategy_notes",
  "jnp_content_library",
  "jnp_posted_dates",
  "jnp_weekly_plan",
  "jnp_post_feedback_history",
];

async function dbGet(key) {
  const { data } = await supabase
    .from("marketing_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

async function dbSet(key, value) {
  await supabase.from("marketing_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
}

// Load one key: Supabase first, fall back to localStorage
async function loadKey(key) {
  try {
    const remote = await dbGet(key);
    if (remote !== null) {
      // Keep localStorage in sync for offline fallback
      localStorage.setItem(key, remote);
      return remote;
    }
  } catch {}
  // Supabase unavailable — use localStorage
  return localStorage.getItem(key);
}

// Save one key: both Supabase and localStorage
async function saveKey(key, value) {
  localStorage.setItem(key, value);
  try { await dbSet(key, value); } catch {}
}

export function useMarketingSettings() {
  const [ready, setReady] = useState(false);
  const [strategyNotes, _setStrategyNotes]     = useState("");
  const [library, _setLibrary]                 = useState([]);
  const [postedDates, _setPostedDates]         = useState({});
  const [weeklyPlan, _setWeeklyPlan]           = useState(null);
  const [postFeedbackHistory, _setFeedbackHistory] = useState({});

  // Load all keys on mount
  useEffect(() => {
    (async () => {
      const [notes, lib, dates, plan, fbHist] = await Promise.all([
        loadKey("jnp_strategy_notes"),
        loadKey("jnp_content_library"),
        loadKey("jnp_posted_dates"),
        loadKey("jnp_weekly_plan"),
        loadKey("jnp_post_feedback_history"),
      ]);

      if (notes)   _setStrategyNotes(notes);
      if (lib)     { try { _setLibrary(JSON.parse(lib)); } catch {} }
      if (dates)   { try { _setPostedDates(JSON.parse(dates)); } catch {} }
      if (plan)    {
        try {
          const p = JSON.parse(plan);
          const todayKey = new Date().toISOString().slice(0, 7);
          if (p?.weekKey === todayKey) _setWeeklyPlan(p);
        } catch {}
      }
      if (fbHist)  { try { _setFeedbackHistory(JSON.parse(fbHist)); } catch {} }
      setReady(true);
    })();
  }, []);

  const setStrategyNotes = useCallback((val) => {
    _setStrategyNotes(val);
    saveKey("jnp_strategy_notes", val);
  }, []);

  const setLibrary = useCallback((val) => {
    _setLibrary(val);
    saveKey("jnp_content_library", JSON.stringify(val));
  }, []);

  const setPostedDates = useCallback((val) => {
    _setPostedDates(val);
    saveKey("jnp_posted_dates", JSON.stringify(val));
  }, []);

  const setWeeklyPlan = useCallback((val) => {
    _setWeeklyPlan(val);
    saveKey("jnp_weekly_plan", val ? JSON.stringify(val) : "");
  }, []);

  const setPostFeedbackHistory = useCallback((val) => {
    _setFeedbackHistory(val);
    saveKey("jnp_post_feedback_history", JSON.stringify(val));
  }, []);

  return {
    ready,
    strategyNotes, setStrategyNotes,
    library, setLibrary,
    postedDates, setPostedDates,
    weeklyPlan, setWeeklyPlan,
    postFeedbackHistory, setPostFeedbackHistory,
  };
}

export { SYNC_KEYS, loadKey, saveKey };
