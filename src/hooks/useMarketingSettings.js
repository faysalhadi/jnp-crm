import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";

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

export async function loadKey(key) {
  try {
    const remote = await dbGet(key);
    if (remote !== null) {
      localStorage.setItem(key, remote);
      return remote;
    }
  } catch {}
  return localStorage.getItem(key);
}

export async function saveKey(key, value) {
  localStorage.setItem(key, value);
  try { await dbSet(key, value); } catch {}
}

// Apply a raw string value from Supabase into the correct state setter
function applyRemoteValue(key, raw, setters) {
  if (raw === null || raw === undefined) return;
  try {
    switch (key) {
      case "jnp_strategy_notes":
        setters.setStrategyNotes(raw);
        break;
      case "jnp_content_library":
        setters.setLibrary(JSON.parse(raw));
        break;
      case "jnp_posted_dates":
        setters.setPostedDates(JSON.parse(raw));
        break;
      case "jnp_weekly_plan": {
        const p = JSON.parse(raw);
        const monthKey = new Date().toISOString().slice(0, 7);
        if (p?.weekKey === monthKey) setters.setWeeklyPlan(p);
        break;
      }
      case "jnp_post_feedback_history":
        setters.setFeedbackHistory(JSON.parse(raw));
        break;
      default:
        break;
    }
  } catch {}
}

export function useMarketingSettings() {
  const [ready, setReady]                          = useState(false);
  const [strategyNotes, setStrategyNotes]          = useState("");
  const [library, setLibrary]                      = useState([]);
  const [postedDates, setPostedDates]              = useState({});
  const [weeklyPlan, setWeeklyPlan]                = useState(null);
  const [postFeedbackHistory, setFeedbackHistory]  = useState({});

  // Debounce timers per key
  const debounceRefs = useRef({});

  // Setters exposed to components — update state immediately, debounce Supabase write
  const makeSetter = useCallback((key, stateSetter, serialize = (v) => v) => {
    return (val) => {
      stateSetter(val);
      const serialized = serialize(val);
      localStorage.setItem(key, serialized);
      // Debounce Supabase write — 1.5s after last change
      clearTimeout(debounceRefs.current[key]);
      debounceRefs.current[key] = setTimeout(async () => {
        try { await dbSet(key, serialized); } catch {}
      }, 1500);
    };
  }, []);

  const setStrategyNotesSync    = useCallback(makeSetter("jnp_strategy_notes",        setStrategyNotes,   (v) => v),           [makeSetter]);
  const setLibrarySync          = useCallback(makeSetter("jnp_content_library",        setLibrary,         (v) => JSON.stringify(v)), [makeSetter]);
  const setPostedDatesSync      = useCallback(makeSetter("jnp_posted_dates",           setPostedDates,     (v) => JSON.stringify(v)), [makeSetter]);
  const setWeeklyPlanSync       = useCallback(makeSetter("jnp_weekly_plan",            setWeeklyPlan,      (v) => v ? JSON.stringify(v) : ""), [makeSetter]);
  const setFeedbackHistorySync  = useCallback(makeSetter("jnp_post_feedback_history",  setFeedbackHistory, (v) => JSON.stringify(v)), [makeSetter]);

  const setters = {
    setStrategyNotes, setLibrary, setPostedDates,
    setWeeklyPlan, setFeedbackHistory,
  };
  const settersRef = useRef(setters);
  useEffect(() => { settersRef.current = setters; }); // always fresh

  // Initial load from Supabase
  useEffect(() => {
    (async () => {
      const [notes, lib, dates, plan, fbHist] = await Promise.all(
        SYNC_KEYS.map(k => loadKey(k))
      );
      const raw = {
        jnp_strategy_notes: notes,
        jnp_content_library: lib,
        jnp_posted_dates: dates,
        jnp_weekly_plan: plan,
        jnp_post_feedback_history: fbHist,
      };
      SYNC_KEYS.forEach(k => applyRemoteValue(k, raw[k], settersRef.current));
      setReady(true);
    })();
  }, []); // eslint-disable-line

  // Realtime subscription — updates from other devices appear instantly
  useEffect(() => {
    const channel = supabase
      .channel("marketing_settings_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketing_settings" },
        (payload) => {
          const { key, value } = payload.new || {};
          if (!key || !SYNC_KEYS.includes(key)) return;
          // Don't apply if we just wrote this ourselves (debounce still pending)
          if (debounceRefs.current[key]) return;
          localStorage.setItem(key, value);
          applyRemoteValue(key, value, settersRef.current);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  return {
    ready,
    strategyNotes,    setStrategyNotes:   setStrategyNotesSync,
    library,          setLibrary:         setLibrarySync,
    postedDates,      setPostedDates:     setPostedDatesSync,
    weeklyPlan,       setWeeklyPlan:      setWeeklyPlanSync,
    postFeedbackHistory, setPostFeedbackHistory: setFeedbackHistorySync,
  };
}

export { SYNC_KEYS };
