"use client";

import Image from "next/image";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

import styles from "./auth-gate.module.css";
import { IdentityBadge } from "./identity-badge";

type AnimalCode = "猹" | "水豚" | "狐狸" | "熊猫" | "青蛙" | "仓鼠";
type AuthStep = "welcome" | "register" | "login" | "recover" | "reveal";

interface AuthProfile {
  displayName: string;
  publicId: string;
  animal: AnimalCode;
  accountStatus?: "active" | "banned";
  identityBadge?: "steward";
}

interface AuthState {
  authenticated: boolean;
  anonymous: boolean;
  needsProfile: boolean;
  required?: boolean;
  authKind?: "anonymous" | "password" | "phone";
  profile?: AuthProfile;
}

interface ProvisionResult {
  session: unknown;
  recoveryCode: string;
  existingDataPreserved: boolean;
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

declare global { interface Window { turnstile?: TurnstileApi } }

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
      .slice(0, maximum).map((item) => item.segment).join("");
  }
  return Array.from(normalized).slice(0, maximum).join("");
}

function normalizePublicId(value: string): string {
  const compact = value.normalize("NFKC").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10);
  const body = compact.startsWith("CC") ? compact.slice(2) : compact;
  return body ? `CC-${body.slice(0, 8)}` : "";
}

function normalizeRecoveryCode(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16)
    .replace(/(.{4})(?=.)/g, "$1-");
}

function apiMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const failure = payload as ApiFailure;
  if (typeof failure.error === "string") return failure.error;
  if (failure.error && typeof failure.error.message === "string") return failure.error.message;
  return typeof failure.message === "string" ? failure.message : fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiMessage(payload, "连接没有成功，请稍后重试。"));
  return payload as T;
}

function normalizeSession(payload: unknown): AuthState {
  const value = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (value.session && typeof value.session === "object") {
    const nested = normalizeSession(value.session);
    return { ...nested, needsProfile: value.needsProfile === true || nested.needsProfile };
  }
  const profile = value.publicId ? {
    displayName: String(value.displayName ?? "匿名小猹"),
    publicId: String(value.publicId),
    animal: animals.some((item) => item.code === value.animal) ? value.animal as AnimalCode : "猹" as const,
    accountStatus: value.accountStatus === "banned" ? "banned" as const : "active" as const,
    identityBadge: value.identityBadge === "steward" ? "steward" as const : undefined,
  } : undefined;
  const authKind = value.authKind as AuthState["authKind"];
  const authenticated = value.status === "authenticated" || authKind === "password" || authKind === "phone" || Boolean(profile);
  const anonymous = value.status === "anonymous" || authKind === "anonymous";
  return {
    authenticated,
    anonymous,
    authKind,
    needsProfile: value.needsProfile === true || value.onboardingComplete === false || (authenticated && !profile),
    required: value.required === true || value.status === "required",
    profile,
  };
}

export function AnimalAvatar({ animal, size = "medium" }: { animal: AnimalCode; size?: "small" | "medium" | "large" }) {
  const item = animals.find((candidate) => candidate.code === animal) ?? animals[0];
  return (
    <span className={`${styles.animalAvatar} ${styles[`avatar${size[0].toUpperCase()}${size.slice(1)}`]}`}
      style={{ "--avatar-light": item.colors[0], "--avatar-dark": item.colors[1] } as CSSProperties} aria-hidden="true">
      <Image src={item.image} width={152} height={152} sizes={size === "large" ? "76px" : size === "small" ? "38px" : "48px"} alt="" unoptimized />
      <i />
    </span>
  );
}

export function AuthGate({ children, required = false }: { children: ReactNode; required?: boolean }) {
  const [checking, setChecking] = useState(required);
  const [session, setSession] = useState<AuthState | null>(null);
  const [step, setStep] = useState<AuthStep>("welcome");
  const [animal, setAnimal] = useState<AnimalCode>("猹");
  const [displayName, setDisplayName] = useState("");
  const composingDisplayName = useRef(false);
  const [publicId, setPublicId] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState("");
  const [savedRecovery, setSavedRecovery] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEpoch, setCaptchaEpoch] = useState(0);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const isPermanent = session?.authenticated === true && !session.anonymous;
  const isReady = isPermanent && session.needsProfile === false && Boolean(session.profile);

  useEffect(() => {
    if (!required) return;
    let active = true;
    requestJson<unknown>("/api/auth/session")
      .then((payload) => {
        if (!active) return;
        const next = normalizeSession(payload);
        setSession(next);
      })
      .catch(() => active && setSession({ authenticated: false, anonymous: false, needsProfile: false }))
      .finally(() => active && setChecking(false));
    return () => { active = false; };
  }, [required]);

  const resetCaptcha = () => {
    setCaptchaToken("");
    if (turnstileSiteKey) setCaptchaEpoch((value) => value + 1);
  };

  const openStep = (next: AuthStep) => {
    setStep(next); setError(""); setNotice(""); resetCaptcha();
  };

  const register = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    const nickname = displayName.normalize("NFKC");
    if (!nickname || visibleLength(nickname) > 12 || !/^[\p{Script=Han}A-Za-z0-9]+$/u.test(nickname)) {
      return setError("昵称需为 1—12 个汉字、英文字母或数字。");
    }
    if (password.length < 8) return setError("密码至少需要 8 个字符。");
    if (!accepted) return setError("请先阅读并同意用户协议和隐私政策。");
    if (turnstileSiteKey && !captchaToken) return setError("请先完成安全验证。");
    setBusy(true);
    try {
      const result = await requestJson<ProvisionResult>("/api/auth/account/register", {
        method: "POST",
        body: JSON.stringify({ password, animal, displayName: nickname, acceptedTerms: true, captchaToken: captchaToken || undefined }),
      });
      const next = normalizeSession(result.session);
      if (!next.profile) throw new Error("猹号没有生成成功，请重试。");
      setSession(next); setIssuedRecoveryCode(result.recoveryCode); setPublicId(next.profile.publicId); setSavedRecovery(false); setStep("reveal");
      setNotice(result.existingDataPreserved ? "原来的瓜田、瓜籽与互动数据已经保留。" : "新瓜田已经准备好了。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "猹号没有创建成功，请重试。"); resetCaptcha();
    } finally { setBusy(false); }
  };

  const login = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!/^CC-[0-9A-Z]{8}$/.test(publicId)) return setError("请输入完整的猹号。");
    if (password.length < 8) return setError("请输入密码。");
    if (turnstileSiteKey && !captchaToken) return setError("请先完成安全验证。");
    setBusy(true);
    try {
      const result = await requestJson<{ session: unknown }>("/api/auth/account/login", {
        method: "POST", body: JSON.stringify({ publicId, password, captchaToken: captchaToken || undefined }),
      });
      const next = normalizeSession(result.session); setSession(next);
      if (!next.profile) throw new Error("账号资料没有恢复成功，请重试。");
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请重试。"); resetCaptcha(); setBusy(false);
    }
  };

  const recover = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!/^CC-[0-9A-Z]{8}$/.test(publicId)) return setError("请输入完整的猹号。");
    if (recoveryCode.replace(/-/g, "").length !== 16) return setError("请输入完整的 16 位恢复码。");
    if (newPassword.length < 8) return setError("新密码至少需要 8 个字符。");
    if (turnstileSiteKey && !captchaToken) return setError("请先完成安全验证。");
    setBusy(true);
    try {
      const result = await requestJson<ProvisionResult>("/api/auth/account/recover", {
        method: "POST", body: JSON.stringify({ publicId, recoveryCode, newPassword, captchaToken: captchaToken || undefined }),
      });
      const next = normalizeSession(result.session);
      if (!next.profile) throw new Error("瓜田没有恢复成功，请重试。");
      setSession(next); setIssuedRecoveryCode(result.recoveryCode); setSavedRecovery(false); setStep("reveal");
      setNotice("密码已重置，旧恢复码已作废。请保存这枚新恢复码。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "账号没有恢复成功，请重试。"); resetCaptcha();
    } finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true); setError("");
    try { await requestJson("/api/auth/logout", { method: "POST", body: "{}" }); window.location.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "退出失败，请重试。"); setBusy(false); }
  };

  const deleteAccount = async () => {
    setBusy(true); setError("");
    try { await requestJson("/api/auth/account/delete", { method: "POST", body: JSON.stringify({ confirmation: "DELETE" }) }); window.location.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "注销没有完成，请重试。"); setBusy(false); }
  };

  if (checking && required) return <AuthLoading />;
  if (!required) return <>{children}</>;

  if (!isReady || step === "reveal") {
    return (
      <main className={styles.authShell}>
        <div className={styles.skyDetails} aria-hidden="true"><i /><i /><i /></div>
        <section className={styles.authCard} aria-labelledby="auth-title">
          <header className={styles.authHeader}>
            <div className={styles.streetMark}><span>猹</span><i>CHACHA STREET</i></div>
            <span className={styles.passwordBadge}>猹号通行</span>
          </header>

          {session?.anonymous && step === "welcome" && (
            <div className={styles.legacyNotice} role="note"><span aria-hidden="true">🌱</span><div><strong>当前浏览器还有一片试玩瓜田</strong><p>创建新猹号会保留它；登录已有猹号会回到原瓜田，试玩数据不会自动合并。</p></div></div>
          )}

          {session?.anonymous && step === "register" && (
            <div className={styles.legacyNotice} role="note"><span aria-hidden="true">🌱</span><div><strong>保护并带走现在的瓜田</strong><p>创建猹号后，已经埋下的瓜、瓜籽、评论和蹲瓜都会保留。</p></div></div>
          )}

          {step === "welcome" && (
            <div className={styles.authForm}>
              <div className={styles.authTitle}><p>匿名街牌 · 永久瓜田</p><h1 id="auth-title">真名留在门外，<em>故事带进街里。</em></h1></div>
              <div className={styles.welcomeAnimals} aria-hidden="true">{animals.slice(0, 4).map((item) => <AnimalAvatar key={item.code} animal={item.code} />)}</div>
              <button className={styles.primaryAction} onClick={() => openStep("register")}>{session?.anonymous ? "创建猹号并保留试玩瓜田" : "创建我的猹号"}</button>
              <button className={styles.secondaryAction} onClick={() => openStep("login")}>已有猹号，直接登录</button>
              <button className={styles.textAction} onClick={() => openStep("recover")}>忘记密码 · 用恢复码找回</button>
              <p className={styles.privacyPromise}>手机号、微信、真实姓名都不是公开身份；社区只展示动物、昵称和猹号。</p>
            </div>
          )}

          {step === "register" && (
            <form className={styles.authForm} onSubmit={register}>
              <button type="button" className={styles.backAction} onClick={() => openStep("welcome")}>← 返回</button>
              <div className={styles.authTitle}><p>创建街牌</p><h1 id="auth-title">选一只动物，<em>认领一片瓜田。</em></h1></div>
              <fieldset className={styles.animalPicker}><legend>我的动物身份</legend><div>{animals.map((item) => (
                <button type="button" key={item.code} className={animal === item.code ? styles.animalSelected : ""} aria-pressed={animal === item.code} onClick={() => setAnimal(item.code)}>
                  <AnimalAvatar animal={item.code} /><span><strong>{item.code}</strong><small>{item.note}</small></span>
                </button>
              ))}</div><button type="button" className={styles.randomAnimal} onClick={() => setAnimal(animals[Math.floor(Math.random() * animals.length)].code)}>🎲 随机一只</button></fieldset>
              <label className={styles.fieldLabel}><span>匿名昵称 <b>{visibleLength(displayName)}/12</b></span><input type="text" autoComplete="nickname" value={displayName} onCompositionStart={() => { composingDisplayName.current = true; }} onCompositionEnd={(event) => { composingDisplayName.current = false; setDisplayName(trimToVisibleLength(event.currentTarget.value, 12)); }} onChange={(event) => setDisplayName(composingDisplayName.current ? event.target.value : trimToVisibleLength(event.target.value, 12))} placeholder="例如：晚风小猹" /></label>
              <p className={styles.fieldHelp}>请勿使用真实姓名、联系方式或冒充官方身份。</p>
              <label className={styles.fieldLabel}><span>设置密码</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 个字符" /></label>
              <p className={styles.fieldHelp}>密码只用于登录；我们不会把它展示给任何人。</p>
              <label className={styles.agreement}><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>我已阅读并同意 <a href="/terms" target="_blank">用户协议</a> 和 <a href="/privacy" target="_blank">隐私政策</a></span></label>
              {turnstileSiteKey && <TurnstileWidget key={captchaEpoch} siteKey={turnstileSiteKey} onToken={setCaptchaToken} />}
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button className={styles.primaryAction} disabled={busy || Boolean(turnstileSiteKey && !captchaToken)} type="submit">{busy ? "正在准备瓜田…" : session?.anonymous ? "创建猹号并保留瓜田" : "生成我的猹号"}</button>
            </form>
          )}

          {step === "login" && (
            <form className={styles.authForm} onSubmit={login}>
              <button type="button" className={styles.backAction} onClick={() => openStep("welcome")}>← 返回</button>
              <div className={styles.authTitle}><p>老街坊回来</p><h1 id="auth-title">输入猹号，<em>回到原来的瓜田。</em></h1></div>
              {session?.anonymous && <div className={styles.legacyNotice} role="note"><span aria-hidden="true">↩</span><div><strong>登录已有猹号</strong><p>登录后会回到原来的瓜田；当前试玩数据不会自动合并或转移。</p></div></div>}
              <label className={styles.fieldLabel}><span>猹号</span><input type="text" autoCapitalize="characters" autoComplete="username" value={publicId} onChange={(event) => setPublicId(normalizePublicId(event.target.value))} placeholder="CC-7K3M9Q2R" /></label>
              <label className={`${styles.fieldLabel} ${styles.spacedField}`}><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" /></label>
              {turnstileSiteKey && <TurnstileWidget key={captchaEpoch} siteKey={turnstileSiteKey} onToken={setCaptchaToken} />}
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button className={styles.primaryAction} disabled={busy || Boolean(turnstileSiteKey && !captchaToken)} type="submit">{busy ? "正在回街…" : "登录猹猹街"}</button>
              <button type="button" className={styles.textAction} onClick={() => openStep("recover")}>忘记密码？用恢复码找回</button>
            </form>
          )}

          {step === "recover" && (
            <form className={styles.authForm} onSubmit={recover}>
              <button type="button" className={styles.backAction} onClick={() => openStep("welcome")}>← 返回</button>
              <div className={styles.authTitle}><p>找回瓜田</p><h1 id="auth-title">拿出恢复码，<em>换一把新钥匙。</em></h1></div>
              <label className={styles.fieldLabel}><span>猹号</span><input type="text" autoCapitalize="characters" autoComplete="username" value={publicId} onChange={(event) => setPublicId(normalizePublicId(event.target.value))} placeholder="CC-7K3M9Q2R" /></label>
              <label className={`${styles.fieldLabel} ${styles.spacedField}`}><span>一次性恢复码</span><input className={styles.codeField} type="text" autoCapitalize="characters" autoComplete="off" value={recoveryCode} onChange={(event) => setRecoveryCode(normalizeRecoveryCode(event.target.value))} placeholder="ABCD-EFGH-JKLM-NPQR" /></label>
              <label className={`${styles.fieldLabel} ${styles.spacedField}`}><span>新密码</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 8 个字符" /></label>
              <p className={styles.fieldHelp}>重置成功后，旧恢复码会立即失效并换发新码。</p>
              {turnstileSiteKey && <TurnstileWidget key={captchaEpoch} siteKey={turnstileSiteKey} onToken={setCaptchaToken} />}
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button className={styles.primaryAction} disabled={busy || Boolean(turnstileSiteKey && !captchaToken)} type="submit">{busy ? "正在找回…" : "重置密码并回到瓜田"}</button>
            </form>
          )}

          {step === "reveal" && session?.profile && (
            <div className={styles.reveal} role="status" aria-live="polite">
              <p>你的匿名街牌</p><AnimalAvatar animal={session.profile.animal} size="large" />
              <h1 id="auth-title">{session.profile.displayName}</h1><IdentityBadge badge={session.profile.identityBadge} /><strong>{session.profile.publicId}</strong>
              {notice && <p className={styles.revealNotice}>{notice}</p>}
              <div className={styles.recoveryTicket}><span>只显示这一次 · 恢复码</span><b>{issuedRecoveryCode}</b><small>忘记密码时，它是找回瓜田的唯一凭证。请截图或离线保存，不要发给别人。</small></div>
              <label className={styles.savedCheck}><input type="checkbox" checked={savedRecovery} onChange={(event) => setSavedRecovery(event.target.checked)} /><span>我已经保存好猹号和恢复码</span></label>
              <button className={styles.primaryAction} disabled={!savedRecovery} onClick={() => window.location.reload()}>进入猹猹街</button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return <>{children}{isPermanent && session?.profile && <>
    <button className={styles.accountFab} aria-label="打开我的账号" onClick={() => setAccountOpen(true)}><AnimalAvatar animal={session.profile.animal} size="small" /></button>
    {accountOpen && <div className={styles.accountBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}>
      <section className={styles.accountSheet} role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className={styles.sheetHandle} aria-hidden="true" /><button className={styles.closeAccount} aria-label="关闭账号面板" onClick={() => setAccountOpen(false)}>×</button>
        <header><AnimalAvatar animal={session.profile.animal} size="large" /><div><p>我的匿名街牌</p><div className={styles.accountIdentity}><h2 id="account-title">{session.profile.displayName}</h2><IdentityBadge badge={session.profile.identityBadge} /></div><strong>{session.profile.publicId}</strong></div></header>
        <dl><div><dt>动物身份</dt><dd>{session.profile.animal}</dd></div><div><dt>登录方式</dt><dd>猹号 + 密码</dd></div><div><dt>账号状态</dt><dd>{session.profile.accountStatus === "banned" ? "只读" : "正常"}</dd></div></dl>
        {error && <p className={styles.formError} role="alert">{error}</p>}
        <button className={styles.logoutAction} disabled={busy} onClick={() => void logout()}>退出登录</button>
        {!deleteConfirm ? <button className={styles.deleteAction} onClick={() => setDeleteConfirm(true)}>注销账号</button> : <div className={styles.deleteConfirm} role="alert"><p>注销后瓜田、帖子和互动数据将进入删除流程，无法靠重新登录恢复。</p><button disabled={busy} onClick={() => void deleteAccount()}>{busy ? "正在注销…" : "确认注销账号"}</button><button disabled={busy} onClick={() => setDeleteConfirm(false)}>取消</button></div>}
      </section>
    </div>}
  </>}</>;
}

function AuthLoading() { return <main className={styles.authShell}><div className={styles.authLoading} role="status"><span>猹</span><p>正在认路…</p></div></main>; }

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null); const widgetRef = useRef<string | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const render = () => {
      if (!active || !containerRef.current || !window.turnstile || widgetRef.current) return;
      widgetRef.current = window.turnstile.render(containerRef.current, { sitekey: siteKey, callback: (token) => { setFailed(false); onToken(token); }, "expired-callback": () => onToken(""), "error-callback": () => { setFailed(true); onToken(""); }, theme: "light", size: "flexible" });
    };
    if (window.turnstile) render(); else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-chacha-turnstile]"); const script = existing ?? document.createElement("script");
      script.addEventListener("load", render); script.addEventListener("error", () => active && setFailed(true));
      if (!existing) { script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.defer = true; script.dataset.chachaTurnstile = "true"; document.head.appendChild(script); }
      return () => { active = false; script.removeEventListener("load", render); if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current); };
    }
    return () => { active = false; if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current); };
  }, [onToken, siteKey]);
  return <div className={styles.captchaBox}><div ref={containerRef} />{failed && <p role="alert">安全验证没有加载成功，请检查网络后刷新。</p>}</div>;
}
