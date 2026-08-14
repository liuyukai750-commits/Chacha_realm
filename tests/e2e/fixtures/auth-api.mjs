const permanentProfile = {
  displayName: "晚风小猹",
  publicId: "CC-7K3M9Q2R",
  animal: "猹",
  maskedPhone: "138****8000",
  accountStatus: "active",
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

export async function installAuthApi(page, options = {}) {
  const state = {
    session: structuredClone(options.session ?? {
      authenticated: false,
      anonymous: Boolean(options.anonymous),
      needsProfile: false,
      required: true,
    }),
    requestCalls: [],
    verifyCalls: [],
    profileCalls: [],
    confirmCalls: [],
    logoutCalls: [],
    deleteCalls: [],
    activeUserId: options.anonymous ? "anonymous-user-id" : "phone-user-id",
    profileFailuresRemaining: options.profileFailures ?? 0,
    verifyFailure: options.verifyFailure ?? null,
    confirmFailure: options.confirmFailure ?? null,
  };

  await page.route("**/api/auth/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    if (method === "GET" && path === "/api/auth/session") {
      if (!state.session.authenticated && !state.session.anonymous) {
        return json(route, { status: "required", needsProfile: true });
      }
      const profile = state.session.profile;
      const publicSession = profile
        ? { ...profile, authKind: "phone", onboardingComplete: true }
        : {
            alias: "旧设备小猹 101",
            animal: "猹",
            authKind: state.session.anonymous ? "anonymous" : "phone",
            onboardingComplete: !state.session.needsProfile,
          };
      return json(route, {
        status: state.session.anonymous ? "anonymous" : "authenticated",
        session: publicSession,
        needsProfile: state.session.needsProfile,
      });
    }
    if (method === "POST" && path === "/api/auth/phone/request") {
      state.requestCalls.push(body);
      return json(route, {
        sent: true,
        retryAfterSeconds: 60,
        flow: options.anonymous ? "upgrade" : "sign_in",
      });
    }
    if (method === "POST" && path === "/api/auth/phone/verify") {
      state.verifyCalls.push(body);
      if (state.verifyFailure) {
        return json(route, {
          error: {
            code: state.verifyFailure.code ?? "otp_invalid",
            message: state.verifyFailure.message ?? "验证码错误或已经过期，请重新输入。",
          },
        }, state.verifyFailure.status ?? 422);
      }
      if (options.accountConflict) {
        return json(route, {
          session: { alias: "旧设备小猹 101", animal: "猹", authKind: "anonymous", onboardingComplete: true },
          needsProfile: false,
          requiresAccountSwitchConfirmation: true,
          switchProfile: permanentProfile,
        });
      }
      state.session = { authenticated: true, anonymous: false, needsProfile: true, required: true };
      return json(route, {
        session: { authKind: "phone", onboardingComplete: false },
        needsProfile: true,
      });
    }
    if (method === "POST" && path === "/api/auth/phone/confirm") {
      state.confirmCalls.push(body);
      if (state.confirmFailure) {
        return json(route, {
          error: {
            code: state.confirmFailure.code ?? "phone_switch_expired",
            message: state.confirmFailure.message ?? "切换确认已过期，请重新获取验证码。",
          },
        }, state.confirmFailure.status ?? 409);
      }
      if (body?.confirm === false) {
        return json(route, {
          switched: false,
          session: { alias: "旧设备小猹 101", animal: "猹", authKind: "anonymous", onboardingComplete: true },
          needsProfile: false,
        });
      }
      state.activeUserId = "phone-user-id";
      state.session = { authenticated: true, anonymous: false, needsProfile: false, required: true, profile: permanentProfile };
      return json(route, {
        switched: true,
        session: { ...permanentProfile, authKind: "phone", onboardingComplete: true },
        needsProfile: false,
      });
    }
    if (method === "POST" && path === "/api/auth/profile") {
      state.profileCalls.push(body);
      if (state.profileFailuresRemaining > 0) {
        state.profileFailuresRemaining -= 1;
        return json(route, {
          error: { code: "profile_save_failed", message: "身份没有保存成功，请重试。" },
        }, 503);
      }
      const profile = { ...permanentProfile, animal: body.animal, displayName: body.displayName };
      state.session = { authenticated: true, anonymous: false, needsProfile: false, required: true, profile };
      return json(route, { session: { ...profile, authKind: "phone", onboardingComplete: true }, profile });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      state.logoutCalls.push(body);
      state.session = { authenticated: false, anonymous: false, needsProfile: false, required: true };
      return json(route, { loggedOut: true });
    }
    if (method === "POST" && path === "/api/auth/account/delete") {
      state.deleteCalls.push(body);
      return json(route, { accepted: true });
    }

    return json(route, { error: { code: "unmocked_auth", message: `${method} ${path}` } }, 501);
  });

  return state;
}

export { permanentProfile };
