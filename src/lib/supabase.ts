import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Placeholder keeps the client constructable so a missing .env degrades to
// seed data instead of blanking the whole app at module load.
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const isSupabaseConfigured = isConfigured;

export const supabase = createClient(
  isConfigured ? supabaseUrl : 'http://localhost:54321',
  isConfigured ? supabaseAnonKey : 'unconfigured-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
