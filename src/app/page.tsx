import { AuthGate } from "@/components/auth-gate";
import { ChachaIsland } from "@/components/chacha-island";

export default function Home() {
  const app = <ChachaIsland />;
  if (process.env.AUTH_GATE_ENABLED === "false") return app;
  return <AuthGate required>{app}</AuthGate>;
}
