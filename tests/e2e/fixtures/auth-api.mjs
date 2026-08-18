const permanentProfile = {
  displayName: "晚风小猹",
  publicId: "CC-7K3M9Q2R",
  animal: "猹",
  accountStatus: "active",
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
}

function publicSession(profile = permanentProfile, authKind = "password") {
  return { ...profile, authKind, onboardingComplete: true };
}

export async function installAuthApi(page, options = {}) {
  const state = {
    session: structuredClone(options.session ?? { authenticated: false, anonymous: Boolean(options.anonymous), needsProfile: false }),
    registerCalls: [], loginCalls: [], recoverCalls: [], upgradeCalls: [], logoutCalls: [], deleteCalls: [],
    registerFailuresRemaining: options.registerFailures ?? 0,
  };

  await page.route("**/api/auth/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    if (method === "GET" && path === "/api/auth/session") {
      if (!state.session.authenticated && !state.session.anonymous) return json(route, { status: "required", required: true, needsProfile: true });
      if (state.session.anonymous) return json(route, { status: "anonymous", session: { alias: "旧设备小猹 101", animal: "猹", authKind: "anonymous", onboardingComplete: false }, needsProfile: true });
      return json(route, {
        status: "authenticated",
        session: publicSession(state.session.profile ?? permanentProfile, state.session.authKind ?? "password"),
        needsProfile: false,
      });
    }
    if (method === "POST" && path === "/api/auth/account/register") {
      state.registerCalls.push(body);
      if (state.registerFailuresRemaining > 0) {
        state.registerFailuresRemaining -= 1;
        return json(route, { error: { code: "register_failed", message: "猹号没有创建成功，请重试。" } }, 503);
      }
      const profile = { ...permanentProfile, animal: body.animal, displayName: body.displayName };
      state.session = { authenticated: true, anonymous: false, needsProfile: false, profile };
      return json(route, { session: publicSession(profile), recoveryCode: "ABCD-EFGH-JKLM-NPQR", existingDataPreserved: Boolean(options.anonymous) });
    }
    if (method === "POST" && path === "/api/auth/account/login") {
      state.loginCalls.push(body);
      if (options.loginFailure) return json(route, { error: options.loginFailure }, 401);
      state.session = { authenticated: true, anonymous: false, needsProfile: false, profile: permanentProfile };
      return json(route, { session: publicSession() });
    }
    if (method === "POST" && path === "/api/auth/account/recover") {
      state.recoverCalls.push(body);
      if (options.recoverFailure) return json(route, { error: options.recoverFailure }, 401);
      state.session = { authenticated: true, anonymous: false, needsProfile: false, profile: permanentProfile };
      return json(route, { session: publicSession(), recoveryCode: "WXYZ-2345-6789-ABCD", existingDataPreserved: true });
    }
    if (method === "POST" && path === "/api/auth/account/upgrade") {
      state.upgradeCalls.push(body);
      state.session = { authenticated: true, anonymous: false, authKind: "password", needsProfile: false, profile: permanentProfile };
      return json(route, { session: publicSession(), recoveryCode: "UPGD-2345-6789-ABCD", existingDataPreserved: true });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      state.logoutCalls.push(body); state.session = { authenticated: false, anonymous: false, needsProfile: false }; return json(route, { loggedOut: true });
    }
    if (method === "POST" && path === "/api/auth/account/delete") {
      state.deleteCalls.push(body); return json(route, { deleted: true });
    }
    return json(route, { error: { code: "unmocked_auth", message: `${method} ${path}` } }, 501);
  });
  return state;
}

export { permanentProfile };
