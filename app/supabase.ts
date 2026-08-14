import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase is not configured for this environment.");
  }

  browserClient ??= createClient(supabaseUrl, supabasePublishableKey);
  return browserClient;
}

export async function daymarkFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");

  if (isSupabaseConfigured) {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    if (data.session?.access_token) headers.set("authorization", `Bearer ${data.session.access_token}`);
  }

  return fetch(input, { ...init, headers });
}
