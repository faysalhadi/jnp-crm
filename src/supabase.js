import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    }
  }
);

// Isolated client for creating new users — does not affect the main session.
// Gets its own storageKey so it's never counted as a duplicate instance of
// the main `supabase` client (avoids the "Multiple GoTrueClient instances"
// console warning); it never persists a session either way.
export const signupSupabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  {
    auth: {
      storageKey: 'sb-signup-isolated-auth-token',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    }
  }
);
