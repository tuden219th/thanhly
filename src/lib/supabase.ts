
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local",
    );
  }

  client = createClient(supabaseUrl, supabaseKey);
  return client;
}

// Defer client creation until a browser action actually uses Supabase. This
// lets Next.js build pages when deployment credentials are not present locally.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const currentClient = getClient();
    const value = Reflect.get(currentClient, property, currentClient) as unknown;
    return typeof value === "function" ? value.bind(currentClient) : value;
  },
});
