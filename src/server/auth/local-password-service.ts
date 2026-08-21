import "server-only";

import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import type { AnimalIdentity, AnonymousSession } from "@/contracts";
import { ApiProblem, unavailable } from "@/server/api";
import { recoverySecretDigest } from "@/server/auth/security";
import {
  postgresLocalPasswordRepository,
  type LocalPasswordCredential,
  type LocalPasswordRepository,
} from "@/server/postgres/local-password-repository";
import {
  createLocalPasswordSession,
  publicSessionFor,
} from "@/server/supabase/session";

const BCRYPT_COST = 12;
const DUMMY_BCRYPT_DIGEST = "$2b$12$PcUEGAUO1112F.MEm0M5tuSslLYkFIRax3Xajc/EcheoLNA9IuFf2";

async function verifyArgon2Digest(digest: string, password: string): Promise<boolean> {
  const { verify } = await import("@node-rs/argon2");
  return verify(digest, password);
}

function loginEmail(userId: string): string {
  return `${userId}@accounts.chachajie.invalid`;
}

async function requireMatchingPassword(
  target: LocalPasswordCredential | null,
  password: string,
): Promise<LocalPasswordCredential> {
  let matches = false;
  if (!target) {
    await bcrypt.compare(password, DUMMY_BCRYPT_DIGEST);
  } else if (target.passwordAlgorithm === "bcrypt") {
    matches = await bcrypt.compare(password, target.passwordDigest);
  } else {
    try {
      matches = await verifyArgon2Digest(target.passwordDigest, password);
    } catch {
      matches = false;
    }
  }
  if (!target || !matches) {
    throw new ApiProblem(401, "invalid_credentials", "猹号或密码不正确。");
  }
  if (target.accountStatus !== "active") {
    throw new ApiProblem(403, "account_banned", "该账号已被暂停使用。");
  }
  return target;
}

async function publicSession(userId: string): Promise<AnonymousSession> {
  const session = await createLocalPasswordSession(userId);
  return publicSessionFor(session);
}

export function createLocalPasswordService(
  repository: LocalPasswordRepository = postgresLocalPasswordRepository,
) {
  return {
    async register(input: {
      password: string;
      animal: AnimalIdentity;
      displayName: string;
      recoveryCode: string;
    }): Promise<AnonymousSession> {
      const userId = randomUUID();
      try {
        const publicId = await repository.createAccount({
          userId,
          loginEmail: loginEmail(userId),
          passwordDigest: await bcrypt.hash(input.password, BCRYPT_COST),
          displayName: input.displayName,
          animal: input.animal,
        });
        await repository.saveRecoverySecret(
          userId,
          recoverySecretDigest(publicId, input.recoveryCode),
        );
      } catch (error) {
        try {
          await repository.deleteAccount(userId);
        } catch {
          // Cleanup is best effort; the incomplete account has no session.
        }
        throw error;
      }
      return publicSession(userId);
    },

    async login(publicId: string, password: string): Promise<AnonymousSession> {
      const target = await requireMatchingPassword(
        await repository.credentialForPublicId(publicId),
        password,
      );
      return publicSession(target.userId);
    },

    async recover(input: {
      publicId: string;
      currentRecoveryDigest: string;
      nextRecoveryDigest: string;
      newPassword: string;
    }): Promise<AnonymousSession> {
      const userId = await repository.recoverAccount({
        publicId: input.publicId,
        currentRecoveryDigest: input.currentRecoveryDigest,
        nextRecoveryDigest: input.nextRecoveryDigest,
        passwordDigest: await bcrypt.hash(input.newPassword, BCRYPT_COST),
      });
      if (!userId) {
        throw new ApiProblem(401, "invalid_recovery_code", "猹号或恢复码不正确。");
      }
      return publicSession(userId);
    },

    async upgrade(input: {
      userId: string;
      publicId: string;
      password: string;
      recoveryCode: string;
    }): Promise<AnonymousSession> {
      const target = await repository.credentialForUserId(input.userId);
      if (target) {
        throw new ApiProblem(409, "password_already_set", "这个猹号已经设置过密码，请直接登录。");
      }
      try {
        await repository.upgradeAccount({
          userId: input.userId,
          loginEmail: loginEmail(input.userId),
          passwordDigest: await bcrypt.hash(input.password, BCRYPT_COST),
          recoveryDigest: recoverySecretDigest(input.publicId, input.recoveryCode),
        });
      } catch {
        throw unavailable();
      }
      return publicSession(input.userId);
    },
  };
}

export const localPasswordService = createLocalPasswordService();
