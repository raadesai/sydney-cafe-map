import { createClient } from "@supabase/supabase-js";

// The secret key bypasses RLS, so this client must only be used behind the
// shared-password check in the API routes.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars are not configured");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
