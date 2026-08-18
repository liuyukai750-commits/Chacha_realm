import "server-only";

import { serviceRpc } from "@/server/supabase/http";

export type PasswordAuthAction = "register" | "login" | "recover";

export interface PasswordAccountTarget {
  userId: string;
  publicId: string;
  accountStatus: "active" | "banned";
  loginEmail?: string | null;
}

export interface RotatedRecoveryTarget {
  userId: string;
  loginEmail?: string | null;
}

/**
 * Persistent account metadata used by the password-auth service.
 *
 * Supabase is the current adapter. Keeping provider calls behind this boundary
 * lets the production PostgreSQL adapter use local_auth_credentials,
 * local_auth_sessions and local_auth_security_events without changing routes
 * or exposing credential material to the UI.
 */
export interface PasswordAuthRepository {
  reserveAttempt(input: {
    identityDigest: string;
    ipDigest: string;
    action: PasswordAuthAction;
  }): Promise<void>;
  findTargetByPublicId(publicId: string): Promise<PasswordAccountTarget | null>;
  findTargetByUserId(userId: string): Promise<PasswordAccountTarget | null>;
  saveLoginCredential(userId: string, loginEmail: string): Promise<void>;
  saveRecoverySecret(userId: string, secretDigest: string): Promise<void>;
  rotateRecoverySecret(input: {
    p_public_id: string;
    p_current_digest: string;
    p_new_digest: string;
  }): Promise<RotatedRecoveryTarget | null>;
}

export const passwordAuthRepository: PasswordAuthRepository = {
  async reserveAttempt(input) {
    await serviceRpc("reserve_account_auth_attempt", {
      p_identity_digest: input.identityDigest,
      p_ip_digest: input.ipDigest,
      p_action: input.action,
    });
  },
  findTargetByPublicId(publicId) {
    return serviceRpc<PasswordAccountTarget | null>("account_auth_target", {
      p_public_id: publicId,
    });
  },
  findTargetByUserId(userId) {
    return serviceRpc<PasswordAccountTarget | null>("account_auth_target_by_user", {
      p_user_id: userId,
    });
  },
  async saveLoginCredential(userId, loginEmail) {
    await serviceRpc("set_account_login_credential", {
      p_actor_id: userId,
      p_login_email: loginEmail,
    });
  },
  async saveRecoverySecret(userId, secretDigest) {
    await serviceRpc("set_account_recovery_secret", {
      p_actor_id: userId,
      p_secret_digest: secretDigest,
    });
  },
  rotateRecoverySecret(input) {
    return serviceRpc<RotatedRecoveryTarget | null>("rotate_account_recovery_secret", {
      p_public_id: input.p_public_id,
      p_current_digest: input.p_current_digest,
      p_new_digest: input.p_new_digest,
    });
  },
};
