import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env.');
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Disable the navigator lock used to coordinate token refresh across tabs.
    // When the same app is open in multiple tabs, tabs race to acquire the lock
    // and a losing tab's init throws an uncaught "lock stolen" exception,
    // leaving the auth client in an uninitialized state forever. Since this app
    // is single-user-per-session, we don't need cross-tab refresh coordination.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
});
