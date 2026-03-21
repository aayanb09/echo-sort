import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const isBrowser = typeof window !== 'undefined';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const missingSupabaseConfigMessage =
  'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = isSupabaseConfigured
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: isBrowser ? window.localStorage : undefined,
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
      },
    })
  : null;

export const getSupabaseClient = () => {
  if (!supabase) {
    throw new Error(missingSupabaseConfigMessage);
  }

  return supabase;
};
