import "server-only";

export type BackendProvider = "supabase" | "postgres";

export function getBackendProvider(): BackendProvider {
  const value = process.env.CHACHA_BACKEND_PROVIDER?.trim().toLowerCase() || "supabase";
  if (value === "supabase" || value === "postgres") return value;
  throw new Error("CHACHA_BACKEND_PROVIDER must be 'supabase' or 'postgres'");
}
