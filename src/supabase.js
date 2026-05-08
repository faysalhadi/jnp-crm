import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: (() => {
        try {
          const stored = localStorage.getItem('jnp_session');
          if (stored) {
            const session = JSON.parse(stored);
            if (session?.access_token) {
              return { Authorization: `Bearer ${session.access_token}` };
            }
          }
        } catch {}
        return {};
      })(),
    }
  }
);
