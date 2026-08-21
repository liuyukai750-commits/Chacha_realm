import "server-only";

import type { QueryResultRow } from "pg";

import { ApiProblem } from "@/server/api";
import { postgresQuery, withPostgresTransaction } from "@/server/postgres/client";

export interface LocalPasswordCredential {
  userId: string;
  publicId: string;
  accountStatus: "active" | "banned";
  passwordDigest: string;
  passwordAlgorithm: "bcrypt" | "argon2id";
}

interface CredentialRow extends QueryResultRow {
  user_id: string;
  public_id: string;
  account_status: "active" | "banned";
  password_digest: string;
  password_algorithm: "bcrypt" | "argon2id";
}

interface RecoveryRow extends QueryResultRow {
  user_id: string;
  account_status: "active" | "banned";
}

export interface LocalPasswordRepository {
  credentialForPublicId(publicId: string): Promise<LocalPasswordCredential | null>;
  credentialForUserId(userId: string): Promise<LocalPasswordCredential | null>;
  createAccount(input: {
    userId: string;
    loginEmail: string;
    passwordDigest: string;
    displayName: string;
    animal: string;
  }): Promise<string>;
  saveRecoverySecret(userId: string, recoveryDigest: string): Promise<void>;
  deleteAccount(userId: string): Promise<void>;
  upgradeAccount(input: {
    userId: string;
    loginEmail: string;
    passwordDigest: string;
    recoveryDigest: string;
  }): Promise<void>;
  recoverAccount(input: {
    publicId: string;
    currentRecoveryDigest: string;
    nextRecoveryDigest: string;
    passwordDigest: string;
  }): Promise<string | null>;
}

function credential(row: CredentialRow | undefined): LocalPasswordCredential | null {
  return row ? {
    userId: row.user_id,
    publicId: row.public_id,
    accountStatus: row.account_status,
    passwordDigest: row.password_digest,
    passwordAlgorithm: row.password_algorithm,
  } : null;
}

export const postgresLocalPasswordRepository: LocalPasswordRepository = {
  async credentialForPublicId(publicId) {
    const result = await postgresQuery<CredentialRow>(
      `select p.id as user_id, p.public_id, p.account_status,
              c.password_digest, c.password_algorithm
         from public.profiles p
         join public.local_auth_credentials c on c.profile_id = p.id
        where p.public_id = upper(btrim($1))`,
      [publicId],
    );
    return credential(result.rows[0]);
  },

  async credentialForUserId(userId) {
    const result = await postgresQuery<CredentialRow>(
      `select p.id as user_id, p.public_id, p.account_status,
              c.password_digest, c.password_algorithm
         from public.profiles p
         join public.local_auth_credentials c on c.profile_id = p.id
        where p.id = $1`,
      [userId],
    );
    return credential(result.rows[0]);
  },

  async createAccount(input) {
    return withPostgresTransaction(async (client) => {
      await client.query(
        `insert into auth.users (
           id, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, created_at, updated_at
         ) values ($1, $2, null, statement_timestamp(),
           jsonb_build_object('chacha_auth_kind', 'password'),
           statement_timestamp(), statement_timestamp())`,
        [input.userId, input.loginEmail],
      );
      await client.query(
        `insert into public.account_login_credentials (profile_id, login_email)
         values ($1, $2)`,
        [input.userId, input.loginEmail],
      );
      await client.query(
        `insert into public.local_auth_credentials (
           profile_id, password_digest, password_algorithm,
           password_changed_at, source_user_updated_at
         ) values ($1, $2, 'bcrypt', statement_timestamp(), null)`,
        [input.userId, input.passwordDigest],
      );
      await client.query(
        `select public.complete_profile_for_actor(
           p_actor_id => $1,
           p_display_name => $2,
           p_animal => $3
         )`,
        [input.userId, input.displayName, input.animal],
      );
      const profile = await client.query<{ public_id: string }>(
        "select public_id from public.profiles where id = $1",
        [input.userId],
      );
      const publicId = profile.rows[0]?.public_id;
      if (!publicId) throw new Error("profile_not_found");
      return publicId;
    });
  },

  async saveRecoverySecret(userId, recoveryDigest) {
    await postgresQuery(
      `insert into public.account_recovery_credentials (profile_id, secret_digest)
       values ($1, $2)
       on conflict (profile_id) do update
       set secret_digest = excluded.secret_digest,
           version = public.account_recovery_credentials.version + 1,
           updated_at = statement_timestamp()`,
      [userId, recoveryDigest],
    );
  },

  async deleteAccount(userId) {
    await withPostgresTransaction(async (client) => {
      await client.query("delete from public.profiles where id = $1", [userId]);
      await client.query("delete from auth.users where id = $1", [userId]);
    });
  },

  async upgradeAccount(input) {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `update auth.users
            set email = $2,
                raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                  || jsonb_build_object('chacha_auth_kind', 'password'),
                updated_at = statement_timestamp()
          where id = $1`,
        [input.userId, input.loginEmail],
      );
      await client.query(
        `insert into public.account_login_credentials (profile_id, login_email)
         values ($1, $2)
         on conflict (profile_id) do update set login_email = excluded.login_email`,
        [input.userId, input.loginEmail],
      );
      await client.query(
        `insert into public.local_auth_credentials (
           profile_id, password_digest, password_algorithm,
           password_changed_at, source_user_updated_at
         ) values ($1, $2, 'bcrypt', statement_timestamp(), null)
         on conflict (profile_id) do update
         set password_digest = excluded.password_digest,
             password_algorithm = excluded.password_algorithm,
             password_changed_at = excluded.password_changed_at,
             source_user_updated_at = null,
             credential_version = public.local_auth_credentials.credential_version + 1,
             must_rotate = false,
             updated_at = statement_timestamp()`,
        [input.userId, input.passwordDigest],
      );
      await client.query(
        `insert into public.account_recovery_credentials (profile_id, secret_digest)
         values ($1, $2)
         on conflict (profile_id) do update
         set secret_digest = excluded.secret_digest,
             version = public.account_recovery_credentials.version + 1,
             updated_at = statement_timestamp()`,
        [input.userId, input.recoveryDigest],
      );
    });
  },

  async recoverAccount(input) {
    return withPostgresTransaction(async (client) => {
      const result = await client.query<RecoveryRow>(
        `select p.id as user_id, p.account_status
           from public.profiles p
           join public.account_recovery_credentials r on r.profile_id = p.id
          where p.public_id = upper(btrim($1))
            and r.secret_digest = $2
          for update of r`,
        [input.publicId, input.currentRecoveryDigest],
      );
      const target = result.rows[0];
      if (!target) return null;
      if (target.account_status !== "active") {
        throw new ApiProblem(403, "account_banned", "该账号已被暂停使用。");
      }

      await client.query(
        `update public.account_recovery_credentials
            set secret_digest = $2, version = version + 1,
                updated_at = statement_timestamp()
          where profile_id = $1`,
        [target.user_id, input.nextRecoveryDigest],
      );
      await client.query(
        `update public.local_auth_credentials
            set password_digest = $2,
                password_algorithm = 'bcrypt',
                password_changed_at = statement_timestamp(),
                source_user_updated_at = null,
                credential_version = credential_version + 1,
                must_rotate = false,
                updated_at = statement_timestamp()
          where profile_id = $1`,
        [target.user_id, input.passwordDigest],
      );
      await client.query(
        `update public.local_auth_sessions
            set revoked_at = statement_timestamp(), revocation_reason = 'recovery'
          where profile_id = $1 and revoked_at is null`,
        [target.user_id],
      );
      await client.query(
        `insert into public.local_auth_security_events (profile_id, event_type)
         values ($1, 'password_changed')`,
        [target.user_id],
      );
      return target.user_id;
    });
  },
};
