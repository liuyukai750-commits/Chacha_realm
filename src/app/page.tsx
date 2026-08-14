import { AuthGate } from "@/components/auth-gate";
import { ChachaIsland } from "@/components/chacha-island";

export default function Home() {
  const authGateRequired = process.env.AUTH_GATE_ENABLED === "true";
  if (!authGateRequired) return <ChachaIsland />;
  return <AuthGate required={authGateRequired}><ChachaIsland /></AuthGate>;
}
