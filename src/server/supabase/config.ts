import "server-only";

export interface SupabaseServerConfig {
  url: string;
  anonKey: string;
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
