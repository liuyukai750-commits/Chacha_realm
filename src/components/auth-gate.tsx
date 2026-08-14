"use client";

import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import styles from "./auth-gate.module.css";

type AnimalCode = "猹" | "水豚" | "狐狸" | "熊猫" | "青蛙" | "仓鼠";
type AuthStep = "phone" | "otp" | "profile" | "reveal";

interface AuthProfile {
  displayName: string;
  publicId: string;
  animal: AnimalCode;
  maskedPhone?: string;
  accountStatus?: "active" | "banned";
}

interface AuthState {
  authenticated: boolean;
  anonymous: boolean;
  needsProfile: boolean;
  required?: boolean;
  profile?: AuthProfile;
}

interface ApiFailure {
  error?: { code?: string; message?: string } | string;
  message?: string;
}

interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
    theme: "light";
    size: "flexible";
  }): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const animals: Array<{ code: AnimalCode; image: string; note: string; colors: [string, string] }> = [
  { code: "猹", image: "/animals/cha.webp", note: "爱逛也爱讲", colors: ["#eef4d7", "#7fa776"] },
  { code: "水豚", image: "/animals/capybara.webp", note: "慢慢听完", colors: ["#f6edda", "#8da27c"] },
  { code: "狐狸", image: "/animals/fox.webp", note: "眼神很灵", colors: ["#ffe3da", "#d78372"] },
  { code: "熊猫", image: "/animals/panda.webp", note: "稳稳围观", colors: ["#f8f1df", "#718b82"] },
  { code: "青蛙", image: "/animals/frog.webp", note: "蹲到后续", colors: ["#e0efcf", "#72a17d"] },
  { code: "仓鼠", image: "/animals/hamster.webp", note: "收藏小事", colors: ["#f7ead4", "#a58c6d"] },
];

function visibleLength(value: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(value)).length;
  }
  return Array.from(value).length;
}

function trimToVisibleLength(value: string, maximum: number): string {
  const normalized = value.normalize("NFKC");
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(normalized))
      .slice(0, maximum)
      .map((item) => item.segment)
      .join("");
  }
  return Array.from(normalized).slice(0, maximum).join("");
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

function apiMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const failure = payload as ApiFailure;
  if (typeof failure.error === "string") return failure.error;
  if (failure.error && typeof failure.error.message === "string") return failure.error.message;
  return typeof failure.message === "string" ? failure.message : fallback;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) return (payload as { data: T }).data;
  return payload as T;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiMessage(payload, "连接没有成功，请稍后重试。"));
  return unwrap<T>(payload);
}

function normalizeSession(payload: unknown): AuthState {
  const value = unwrap<Record<string, unknown>>(payload);
  if (value?.session && typeof value.session === "object") {
    const nested = normalizeSession(value.session);
    return {
      ...nested,
      needsProfile: value.needsProfile === true || nested.needsProfile,
      anonymous: value.status === "anonymous" || nested.anonymous,
      required: value.required === true || value.status === "required" || value.status === "anonymous" || nested.required,
    };
  }
  const nestedProfile = value?.profile as Partial<AuthProfile> | undefined;
  const profileValue: Partial<AuthProfile> | undefined = nestedProfile ?? (value?.publicId ? {
    displayName: String(value.displayName ?? "匿名小猹"),
    publicId: String(value.publicId),
    animal: value.animal as AnimalCode,
    maskedPhone: value.maskedPhone ? String(value.maskedPhone) : undefined,
    accountStatus: value.accountStatus as AuthProfile["accountStatus"],
  } : undefined);
  const animal = animals.some((item) => item.code === profileValue?.animal) ? profileValue?.animal as AnimalCode : "猹";
  const profile = profileValue?.publicId ? {
    displayName: String(profileValue.displayName ?? "匿名小猹"),
    publicId: String(profileValue.publicId),
    animal,
    maskedPhone: profileValue.maskedPhone ? String(profileValue.maskedPhone) : undefined,
    accountStatus: profileValue.accountStatus === "banned" ? "banned" as const : "active" as const,
  } : undefined;
  const authenticated = value?.authenticated === true || value?.status === "authenticated" || value?.authKind === "phone" || Boolean(profile);
  const anonymous = value?.anonymous === true || value?.status === "anonymous" || value?.authKind === "anonymous";
  return {
    authenticated,
    anonymous,
    needsProfile: value?.needsProfile === true || value?.onboardingComplete === false || (authenticated && !profile),
    required: value?.required === true || value?.status === "required",
    profile,
  };
}

export function AnimalAvatar({ animal, size = "medium" }: { animal: AnimalCode; size?: "small" | "medium" | "large" }) {
  const item = animals.find((candidate) => candidate.code === animal) ?? animals[0];
  return (
    <span
      className={`${styles.animalAvatar} ${styles[`avatar${size[0].toUpperCase()}${size.slice(1)}`]}`}
      style={{ "--avatar-light": item.colors[0], "--avatar-dark": item.colors[1] } as CSSProperties}
      aria-hidden="true"
    >
      <Image src={item.image} width={152} height={152} sizes={size === "large" ? "76px" : size === "small" ? "38px" : "48px"} alt="" unoptimized />
      <i />
    </span>
  );
}

export function AuthGate({ children, required = false }: { children: ReactNode; required?: boolean }) {
  const [checking, setChecking] = useState(required);
  const [session, setSession] = useState<AuthState | null>(null);
  const [step, setStep] = useState<AuthStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [animal, setAnimal] = useState<AnimalCode>("猹");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [authFlow, setAuthFlow] = useState<"sign_in" | "upgrade">("sign_in");
  const [accountConflict, setAccountConflict] = useState(false);
  const [switchProfile, setSwitchProfile] = useState<Partial<AuthProfile> | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEpoch, setCaptchaEpoch] = useState(0);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const isPermanent = session?.authenticated === true && !session.anonymous;
  const isReady = isPermanent && session.needsProfile === false && Boolean(session.profile);
  const needsOnboarding = isPermanent && session?.needsProfile === true;

  useEffect(() => {
    if (!required) return;
    let active = true;
    requestJson<unknown>("/api/auth/session")
      .then((payload) => {
        if (!active) return;
        const next = normalizeSession(payload);
        setSession(next);
        if (next.authenticated && next.needsProfile) setStep("profile");
      })
      .catch(() => {
        if (active) setSession({ authenticated: false, anonymous: false, needsProfile: false });
      })
      .finally(() => active && setChecking(false));
    return () => { active = false; };
  }, [required]);

  useEffect(() => {
    if (!secondsLeft) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const progress = useMemo(() => step === "phone" ? 1 : step === "otp" ? 2 : 3, [step]);

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^1\d{10}$/.test(phone)) return setError("请输入正确的 11 位手机号。" );
    if (!accepted) return setError("请先阅读并同意用户协议和隐私政策。" );
    if (turnstileSiteKey && !captchaToken) return setError("请先完成安全验证。" );
    setBusy(true);
    try {
      const result = await requestJson<{ sent: true; retryAfterSeconds: number; flow: "sign_in" | "upgrade" }>("/api/auth/phone/request", {
        method: "POST",
        body: JSON.stringify({ phone: `+86${phone}`, acceptedTerms: true, captchaToken: captchaToken || undefined }),
      });
      setAuthFlow(result.flow);
      setResendAt(Date.now() + Math.max(1, result.retryAfterSeconds) * 1_000);
      setNow(Date.now());
      setStep("otp");
      setCaptchaToken("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "验证码没有发出，请重试。" );
    } finally {
      if (turnstileSiteKey) setCaptchaEpoch((value) => value + 1);
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("请输入短信里的 6 位验证码。" );
    setBusy(true);
    try {
      const result = await requestJson<{ session?: unknown; needsProfile: boolean; conflict?: boolean; requiresAccountSwitchConfirmation?: boolean; switchProfile?: Partial<AuthProfile> }>("/api/auth/phone/verify", {
        method: "POST",
        body: JSON.stringify({ phone: `+86${phone}`, code, flow: authFlow }),
      });
      if (result.conflict === true || result.requiresAccountSwitchConfirmation === true) {
        setAccountConflict(true);
        setSwitchProfile(result.switchProfile ?? null);
        return;
      }
      const next = normalizeSession(result.session);
      setSession(next);
      if (result.needsProfile || next.needsProfile || !next.profile) setStep("profile");
      else window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "验证码验证失败，请重试。" );
    } finally {
      setBusy(false);
    }
  };

  const confirmAccountSwitch = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ session: unknown; needsProfile: boolean }>("/api/auth/phone/confirm", {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      const next = normalizeSession(result.session);
      setSession(next);
      setAccountConflict(false);
      setSwitchProfile(null);
      if (result.needsProfile || next.needsProfile || !next.profile) setStep("profile");
      else window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "原来的瓜田没有恢复成功，请重试。" );
    } finally {
      setBusy(false);
    }
  };

  const cancelAccountSwitch = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ session: unknown }>("/api/auth/phone/confirm", {
        method: "POST",
        body: JSON.stringify({ confirm: false }),
      });
      setSession(normalizeSession(result.session));
      setAccountConflict(false);
      setSwitchProfile(null);
      setCode("");
      setStep("phone");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法保留当前瓜田，请重试。" );
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const nickname = displayName.normalize("NFKC");
    if (!nickname || visibleLength(nickname) > 6) return setError("昵称请控制在 1—6 个字。" );
    if (!/^[\p{Script=Han}A-Za-z0-9]+$/u.test(nickname)) return setError("昵称只能使用汉字、英文字母和数字。" );
    setBusy(true);
    try {
      const result = await requestJson<unknown>("/api/auth/profile", {
        method: "POST",
        body: JSON.stringify({ animal, displayName: nickname }),
      });
      const next = normalizeSession(result);
      if (!next.profile) throw new Error("猹号没有生成成功，请重试。" );
      setSession(next);
      setStep("reveal");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "身份没有保存成功，请重试。" );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "退出失败，请重试。" );
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/auth/account/delete", { method: "POST", body: JSON.stringify({ confirmation: "DELETE" }) });
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "注销没有完成，请重试。" );
      setBusy(false);
    }
  };

  if (checking && required) return <AuthLoading />;

  if (checking) return <>{children}</>;

  if (step === "reveal" || (!isReady && (required || needsOnboarding))) {
    return (
      <main className={styles.authShell}>
        <div className={styles.skyDetails} aria-hidden="true"><i /><i /><i /></div>
        <section className={styles.authCard} aria-labelledby="auth-title">
          <header className={styles.authHeader}>
            <div className={styles.streetMark}><span>猹</span><i>CHACHA STREET</i></div>
            <div className={styles.stepRail} aria-label={`登录进度，第 ${progress} 步，共 3 步`}>
              {[1, 2, 3].map((item) => <i key={item} className={item <= progress ? styles.stepDone : ""} />)}
            </div>
          </header>

          {session?.anonymous && step === "phone" && (
            <div className={styles.legacyNotice} role="note">
              <span aria-hidden="true">🌱</span>
              <div><strong>把现在的瓜田带走</strong><p>绑定手机号后，你已经埋下的瓜、瓜籽和经验都会留在原地。</p></div>
            </div>
          )}

          {step === "phone" && (
            <form className={styles.authForm} onSubmit={requestCode}>
              <div className={styles.authTitle}>
                <p>先领一张匿名街牌</p>
                <h1 id="auth-title">进街逛逛，<em>真名留在门外。</em></h1>
              </div>
              <label className={styles.fieldLabel}>
                <span>手机号</span>
                <div className={styles.phoneField}><b>+86</b><input type="tel" inputMode="numeric" autoComplete="tel-national" enterKeyHint="send" value={phone} onChange={(event) => setPhone(normalizePhone(event.target.value))} placeholder="请输入 11 位手机号" aria-describedby="phone-help" /></div>
              </label>
              <p id="phone-help" className={styles.fieldHelp}>只用于登录和找回瓜田，不会展示给其他人。</p>
              <label className={styles.agreement}>
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                <span>我已阅读并同意 <a href="/terms" target="_blank">用户协议</a> 和 <a href="/privacy" target="_blank">隐私政策</a></span>
              </label>
              {turnstileSiteKey && <TurnstileWidget key={captchaEpoch} siteKey={turnstileSiteKey} onToken={setCaptchaToken} />}
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button className={styles.primaryAction} disabled={busy || Boolean(turnstileSiteKey && !captchaToken)} type="submit">{busy ? "正在发送…" : turnstileSiteKey && !captchaToken ? "请先完成安全验证" : "获取验证码"}</button>
            </form>
          )}

          {step === "otp" && (
            <form className={styles.authForm} onSubmit={verifyCode}>
              <button type="button" className={styles.backAction} onClick={() => { setStep("phone"); setError(""); }}>← 换个手机号</button>
              <div className={styles.authTitle}>
                <p>街口确认</p>
                <h1 id="auth-title">短信到了，<em>填下六位数字。</em></h1>
              </div>
              <label className={styles.fieldLabel}>
                <span>发送至 +86 {phone.slice(0, 3)}****{phone.slice(-4)}</span>
                <input className={styles.otpField} type="text" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoFocus />
              </label>
              {accountConflict ? (
                <div className={styles.accountConflict} role="alert">
                  <div className={styles.conflictIdentity}>
                    <AnimalAvatar animal={animals.some((item) => item.code === switchProfile?.animal) ? switchProfile?.animal as AnimalCode : "猹"} />
                    <div><strong>这个手机号已有一片瓜田</strong><p>{switchProfile?.displayName ? `${switchProfile.displayName} · ${switchProfile.publicId ?? "原猹号"}` : "验证通过后，可以回到原来的瓜田。"}</p></div>
                  </div>
                  <p>切换前不会覆盖当前匿名瓜田；两个账号不会自动合并。</p>
                  {error && <p className={styles.formError} role="alert">{error}</p>}
                  <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => void confirmAccountSwitch()}>{busy ? "正在恢复…" : "进入原来的瓜田"}</button>
                  <button type="button" className={styles.textAction} disabled={busy} onClick={() => void cancelAccountSwitch()}>{busy ? "正在保留当前瓜田…" : "暂不切换"}</button>
                </div>
              ) : (
                <>
                  {error && <p className={styles.formError} role="alert">{error}</p>}
                  <button className={styles.primaryAction} disabled={busy} type="submit">{busy ? "正在确认…" : authFlow === "upgrade" ? "绑定并保留这片瓜田" : "验证并继续"}</button>
                  <button
                    className={styles.textAction}
                    type="button"
                    disabled={busy || secondsLeft > 0}
                    onClick={(event) => {
                      if (turnstileSiteKey) {
                        setCode("");
                        setError("");
                        setStep("phone");
                      } else {
                        void requestCode(event as unknown as FormEvent);
                      }
                    }}
                  >
                    {secondsLeft > 0 ? `${secondsLeft} 秒后可重新发送` : turnstileSiteKey ? "返回安全验证并重新发送" : "重新发送验证码"}
                  </button>
                </>
              )}
            </form>
          )}

          {step === "profile" && (
            <form className={styles.authForm} onSubmit={saveProfile}>
              <div className={styles.authTitle}>
                <p>最后一步 · 完全匿名</p>
                <h1 id="auth-title">选一只动物，<em>取个街坊名。</em></h1>
              </div>
              <fieldset className={styles.animalPicker}>
                <legend>我的动物身份</legend>
                <div>
                  {animals.map((item) => (
                    <button type="button" key={item.code} className={animal === item.code ? styles.animalSelected : ""} aria-pressed={animal === item.code} onClick={() => setAnimal(item.code)}>
                      <AnimalAvatar animal={item.code} />
                      <span><strong>{item.code}</strong><small>{item.note}</small></span>
                    </button>
                  ))}
                </div>
                <button type="button" className={styles.randomAnimal} onClick={() => setAnimal(animals[Math.floor(Math.random() * animals.length)].code)}>🎲 随机一只</button>
              </fieldset>
              <label className={styles.fieldLabel}>
                <span>匿名昵称 <b>{visibleLength(displayName)}/6</b></span>
                <input type="text" autoComplete="nickname" enterKeyHint="done" value={displayName} onChange={(event) => setDisplayName(trimToVisibleLength(event.target.value, 6))} placeholder="例如：晚风小猹" />
              </label>
              <p className={styles.fieldHelp}>请勿使用真实姓名、联系方式或冒充官方身份。</p>
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button className={styles.primaryAction} disabled={busy} type="submit">{busy ? "正在生成街牌…" : "生成我的猹号"}</button>
            </form>
          )}

          {step === "reveal" && session?.profile && (
            <div className={styles.reveal} role="status" aria-live="polite">
              <p>你的匿名街牌</p>
              <AnimalAvatar animal={session.profile.animal} size="large" />
              <h1 id="auth-title">{session.profile.displayName}</h1>
              <strong>{session.profile.publicId}</strong>
              <small>猹号不可修改，截图留一下。它不会暴露你的手机号。</small>
              <button className={styles.primaryAction} onClick={() => window.location.reload()}>进入猹猹街</button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <>
      {children}
      {isPermanent && session?.profile && (
        <>
          <button className={styles.accountFab} aria-label="打开我的账号" onClick={() => setAccountOpen(true)}>
            <AnimalAvatar animal={session.profile.animal} size="small" />
          </button>
          {accountOpen && (
            <div className={styles.accountBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}>
              <section className={styles.accountSheet} role="dialog" aria-modal="true" aria-labelledby="account-title">
                <div className={styles.sheetHandle} aria-hidden="true" />
                <button className={styles.closeAccount} aria-label="关闭账号面板" onClick={() => setAccountOpen(false)}>×</button>
                <header>
                  <AnimalAvatar animal={session.profile.animal} size="large" />
                  <div><p>我的匿名街牌</p><h2 id="account-title">{session.profile.displayName}</h2><strong>{session.profile.publicId}</strong></div>
                </header>
                <dl>
                  <div><dt>动物身份</dt><dd>{session.profile.animal}</dd></div>
                  <div><dt>登录手机</dt><dd>{session.profile.maskedPhone ?? "已安全绑定"}</dd></div>
                  <div><dt>账号状态</dt><dd>{session.profile.accountStatus === "banned" ? "只读" : "正常"}</dd></div>
                </dl>
                {error && <p className={styles.formError} role="alert">{error}</p>}
                <button className={styles.logoutAction} disabled={busy} onClick={() => void logout()}>退出登录</button>
                {!deleteConfirm ? <button className={styles.deleteAction} onClick={() => setDeleteConfirm(true)}>注销账号</button> : (
                  <div className={styles.deleteConfirm} role="alert">
                    <p>注销后瓜田、帖子和互动数据将进入删除流程，无法靠重新登录恢复。</p>
                    <button disabled={busy} onClick={() => void deleteAccount()}>{busy ? "正在注销…" : "确认注销账号"}</button>
                    <button disabled={busy} onClick={() => setDeleteConfirm(false)}>取消</button>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}

function AuthLoading() {
  return <main className={styles.authShell}><div className={styles.authLoading} role="status"><span>猹</span><p>正在认路…</p></div></main>;
}

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const render = () => {
      if (!active || !containerRef.current || !window.turnstile || widgetRef.current) return;
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => { setFailed(false); onToken(token); },
        "expired-callback": () => onToken(""),
        "error-callback": () => { setFailed(true); onToken(""); },
        theme: "light",
        size: "flexible",
      });
    };
    if (window.turnstile) render();
    else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-chacha-turnstile]");
      const script = existing ?? document.createElement("script");
      script.addEventListener("load", render);
      script.addEventListener("error", () => active && setFailed(true));
      if (!existing) {
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.chachaTurnstile = "true";
        document.head.appendChild(script);
      }
      return () => {
        active = false;
        script.removeEventListener("load", render);
        if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      };
    }
    return () => {
      active = false;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
    };
  }, [onToken, siteKey]);

  return <div className={styles.captchaBox}><div ref={containerRef} />{failed && <p role="alert">安全验证没有加载成功，请检查网络后刷新。</p>}</div>;
}
