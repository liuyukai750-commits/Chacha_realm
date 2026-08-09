import "server-only";

export interface SupabaseServerConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseAdminConfig extends SupabaseServerConfig {
  serviceRoleKey: string;
}

export function getSupabaseConfig(): SupabaseServerConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
    return { url: url.toString().replace(/\/$/, ""), anonKey };
  } catch {
    return null;
  }
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig | null {
  const config = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !serviceRoleKey) return null;
  return { ...config, serviceRoleKey };
}
