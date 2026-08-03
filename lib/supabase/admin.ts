import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function createOptionalSupabaseAdminClient() {
  const serviceRoleKey = normalizeServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!serviceRoleKey) {
    return null;
  }

  const { supabaseUrl } = getSupabaseConfig();

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function normalizeServiceRoleKey(value: string | undefined) {
  if (!value) {
    return "";
  }

  const lines = value
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matchingLine = lines.find((line) => line.startsWith("SUPABASE_SERVICE_ROLE_KEY="));
  const selectedLine = matchingLine ?? lines[0] ?? "";
  const rawValue = selectedLine.startsWith("SUPABASE_SERVICE_ROLE_KEY=")
    ? selectedLine.slice("SUPABASE_SERVICE_ROLE_KEY=".length)
    : selectedLine;

  return rawValue.trim().replace(/^['"]|['"]$/g, "");
}
