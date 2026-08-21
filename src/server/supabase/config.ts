import "server-only";

export interface SupabaseServerConfig {
  url: string;
  publishableKey: string;
}

export interface SupabaseAdminConfig extends SupabaseServerConfig {
  secretKey: string;
  secretKeySource: "secret" | "legacy_service_role";
}

export function getSupabaseConfig(): SupabaseServerConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
    ?? process.env.SUPABASE_ANON_KEY?.trim()
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !publishableKey) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
    return { url: url.toString().replace(/\/$/, ""), publishableKey };
  } catch {
    return null;
  }
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig | null {
  const config = getSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (config && secretKey) return { ...config, secretKey, secretKeySource: "secret" };
  const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !legacyServiceRoleKey) return null;
  return { ...config, secretKey: legacyServiceRoleKey, secretKeySource: "legacy_service_role" };
}
