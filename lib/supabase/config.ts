export function getSupabaseConfig() {
  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawSupabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!rawSupabaseUrl || !rawSupabasePublishableKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return {
    supabaseUrl: normalizeSupabaseUrl(rawSupabaseUrl),
    supabasePublishableKey: normalizeSupabasePublishableKey(rawSupabasePublishableKey)
  };
}

function normalizeSupabaseUrl(value: string) {
  const trimmed = cleanEnvironmentValue(value, "NEXT_PUBLIC_SUPABASE_URL");

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return validateSupabaseUrl(trimmed);
  }

  return validateSupabaseUrl(`https://${trimmed}.supabase.co`);
}

function normalizeSupabasePublishableKey(value: string) {
  const trimmed = cleanEnvironmentValue(value, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!trimmed || /[\r\n\t]/.test(trimmed)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains an invalid value.");
  }

  return trimmed;
}

function cleanEnvironmentValue(value: string, variableName: string) {
  const lines = value
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matchingLine = lines.find((line) => line.startsWith(`${variableName}=`));
  const selectedLine = matchingLine ?? lines[0] ?? "";
  const rawValue = selectedLine.startsWith(`${variableName}=`)
    ? selectedLine.slice(variableName.length + 1)
    : selectedLine;

  return rawValue.trim().replace(/^['"]|['"]$/g, "");
}

function validateSupabaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL.");
  }

  const isLocalSupabase = ["localhost", "127.0.0.1"].includes(url.hostname);
  const isHostedSupabase = url.hostname.endsWith(".supabase.co");

  if (!isLocalSupabase && !isHostedSupabase) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must end with .supabase.co.");
  }

  return url.origin;
}
