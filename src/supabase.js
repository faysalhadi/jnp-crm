import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    }
  }
);

// Manually restore session from localStorage on every page load
const stored = localStorage.getItem('jnp_session');
if (stored) {
  try {
    const session = JSON.parse(stored);
    if (session?.access_token) {
      supabase.rest.headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {}
}

// Helper to get auth headers using stored session
export function getAuthHeaders() {
  const stored = localStorage.getItem('jnp_session');
  if (stored) {
    try {
      const session = JSON.parse(stored);
      if (session?.access_token) {
        return { Authorization: `Bearer ${session.access_token}` };
      }
    } catch {}
  }
  return {};
}
