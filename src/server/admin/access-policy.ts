export interface AdminIdentitySnapshot {
  authKind?: "anonymous" | "password" | "phone";
  publicId?: string;
  onboardingComplete?: boolean;
  accountStatus?: "active" | "banned";
}

const PUBLIC_ID_PATTERN = /^CC-[0-9A-HJKMNP-TV-Z]{8}$/;

export function parseAdminPublicIds(rawValue: string | undefined): ReadonlySet<string> {
  if (!rawValue) return new Set();
  return new Set(
    rawValue
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => PUBLIC_ID_PATTERN.test(value)),
  );
}

export function isAllowedAdminIdentity(
  identity: AdminIdentitySnapshot,
  allowlist: ReadonlySet<string>,
): boolean {
  const publicId = identity.publicId?.trim().toUpperCase();
  const hasPermanentAuth = identity.authKind === "password" || identity.authKind === "phone";
  return hasPermanentAuth
    && identity.onboardingComplete === true
    && identity.accountStatus === "active"
    && publicId !== undefined
    && allowlist.has(publicId);
}
