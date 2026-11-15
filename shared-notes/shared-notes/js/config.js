// ─────────────────────────────────────────────────────────────
//  The only file you need to edit.
//  Paste your Supabase Project URL and publishable (or "anon") key.
//  Find both in Supabase → Project Settings → API Keys / Data API.
//
//  These are meant to be public: who can do what is controlled by the
//  rules in supabase/schema.sql, not by hiding this key.
//  NEVER put the "secret" or "service_role" key here.
//
//  Leave them empty to run in demo mode (notes stay in this browser only).
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  supabaseUrl: 'https://vtjtrraeisutqsdeebyz.supabase.co', 
  supabaseKey: 'sb_publishable_6BLGkS7sbXbsoG_rnkUMNA_rxLTX8mX',   
  table: 'notes',

  appName: 'Notes',
  autosaveDelayMs: 700,
};
