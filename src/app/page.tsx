import { AuthGate } from "@/components/auth-gate";
import { ChachaIsland } from "@/components/chacha-island";

export default function Home() {
  const authGateRequired = process.env.AUTH_GATE_ENABLED === "true";
  const app = <ChachaIsland />;
  if (!authGateRequired) return app;
  return <AuthGate required>{app}</AuthGate>;
}
