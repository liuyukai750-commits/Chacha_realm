import type { IdentityBadge as IdentityBadgeCode } from "@/contracts";

export function IdentityBadge({ badge }: { badge?: IdentityBadgeCode }) {
  if (badge !== "steward") return null;

  return (
    <span className="identity-badge" aria-label="猹猹街主理人">
      <i aria-hidden="true" />
      主理人
    </span>
  );
}
