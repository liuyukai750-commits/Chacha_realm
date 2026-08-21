import "server-only";

import type { QueryResultRow } from "pg";

import type {
  ConsumedLocalSession,
  LocalSessionRepository,
} from "@/server/auth/local-session";
import { postgresQuery, withPostgresTransaction } from "@/server/postgres/client";
import type { SessionProfile } from "@/server/supabase/session";

interface SessionRow extends QueryResultRow {
  id: string;
  profile_id: string;
  family_id: string;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
  account_status: "active" | "banned";
}

export const postgresLocalSessionRepository: LocalSessionRepository = {
  async consume(input): Promise<ConsumedLocalSession | null> {
    return withPostgresTransaction(async (client) => {
      const result = await client.query<SessionRow>(
        `select s.id, s.profile_id, s.family_id, s.last_seen_at,
                s.idle_expires_at, s.absolute_expires_at, s.revoked_at,
                s.revocation_reason, p.account_status
           from public.local_auth_sessions s
           join public.profiles p on p.id = s.profile_id
          where s.token_digest = $1
          for update of s`,
        [input.tokenDigest],
      );
      const session = result.rows[0];
      if (!session) return null;

      if (session.revoked_at) {
        if (session.revocation_reason === "rotation") {
          // A browser can issue several requests with the same cookie at once.
          // Let requests already in flight finish briefly after rotation instead
          // of treating normal parallel page loading as token theft.
          if (session.last_seen_at >= input.rotationGraceAfter) {
            return {
              profileId: session.profile_id,
              accountStatus: session.account_status,
              rotated: false,
            };
          }
          await client.query(
            `update public.local_auth_sessions
                set revoked_at = coalesce(revoked_at, $2),
                    revocation_reason = case
                      when revoked_at is null then 'suspected_reuse'
                      else revocation_reason
                    end
              where family_id = $1`,
            [session.family_id, input.now],
          );
          await client.query(
            `insert into public.local_auth_security_events (profile_id, event_type, created_at)
             values ($1, 'suspected_reuse', $2)`,
            [session.profile_id, input.now],
          );
        }
        return null;
      }

      if (session.idle_expires_at <= input.now || session.absolute_expires_at <= input.now) {
        return null;
      }

      const nextIdle = input.nextIdleExpiresAt < session.absolute_expires_at
        ? input.nextIdleExpiresAt
        : session.absolute_expires_at;
      if (input.allowRotation && session.last_seen_at <= input.rotateBefore) {
        await client.query(
          `update public.local_auth_sessions
              set revoked_at = $2, revocation_reason = 'rotation', last_seen_at = $2
            where id = $1`,
          [session.id, input.now],
        );
        await client.query(
          `insert into public.local_auth_sessions (
             profile_id, family_id, token_digest, rotated_from, created_at,
             last_seen_at, idle_expires_at, absolute_expires_at
           ) values ($1, $2, $3, $4, $5, $5, $6, $7)`,
          [
            session.profile_id,
            session.family_id,
            input.nextTokenDigest,
            session.id,
            input.now,
            nextIdle,
            session.absolute_expires_at,
          ],
        );
        await client.query(
          `insert into public.local_auth_security_events (profile_id, event_type, created_at)
           values ($1, 'session_rotated', $2)`,
          [session.profile_id, input.now],
        );
        return {
          profileId: session.profile_id,
          accountStatus: session.account_status,
          rotated: true,
        };
      }

      await client.query(
        `update public.local_auth_sessions
            set last_seen_at = $2, idle_expires_at = $3
          where id = $1`,
        [session.id, input.now, nextIdle],
      );
      return {
        profileId: session.profile_id,
        accountStatus: session.account_status,
        rotated: false,
      };
    });
  },

  async issue(input) {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `insert into public.local_auth_sessions (
           profile_id, family_id, token_digest, created_at, last_seen_at,
           idle_expires_at, absolute_expires_at
         ) values ($1, $2, $3, $4, $4, $5, $6)`,
        [
          input.profileId,
          input.familyId,
          input.tokenDigest,
          input.now,
          input.idleExpiresAt,
          input.absoluteExpiresAt,
        ],
      );
      await client.query(
        `insert into public.local_auth_security_events (profile_id, event_type, created_at)
         values ($1, 'login_success', $2)`,
        [input.profileId, input.now],
      );
    });
  },

  async revoke(tokenDigest, reason) {
    await postgresQuery(
      `update public.local_auth_sessions
          set revoked_at = statement_timestamp(), revocation_reason = $2
        where token_digest = $1 and revoked_at is null`,
      [tokenDigest, reason],
    );
  },

  async profileFor(profileId) {
    const result = await postgresQuery<{ value: SessionProfile | null }>(
      "select public.get_profile_for_actor(p_actor_id => $1, p_is_anonymous => false) as value",
      [profileId],
    );
    return result.rows[0]?.value ?? null;
  },
};
