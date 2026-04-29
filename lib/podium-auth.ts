// Server-side Podium session management.
// Production (Cloudflare Pages): stores session cookie in KV namespace PODIUM_SESSION.
// Local dev: falls back to module-level memory cache.

const KV_KEY = "podium_session";
const KV_TTL = 72_000; // 20 hours — Podium sessions last ~24h

// In-memory fallback for local dev (not shared across edge invocations)
let localCache: string | null = null;

type Kv = { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void>; delete(k: string): Promise<void> };

async function getKv(): Promise<Kv | null> {
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const env = getRequestContext().env as Record<string, unknown>;
    return (env.PODIUM_SESSION as Kv) ?? null;
  } catch {
    return null;
  }
}

async function fetchCsrfAndCookie(): Promise<{ csrf: string; loginCookie: string }> {
  const res = await fetch("https://podium.live/users/sign_in", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15_000),
  });
  const html = await res.text();
  const m = html.match(/name="authenticity_token"[^>]*value="([^"]+)"/);
  const csrf = m?.[1] ?? "";
  const setCookie = res.headers.get("set-cookie") ?? "";
  const sm = setCookie.match(/_rclive_session_=([^;]+)/);
  return { csrf, loginCookie: sm ? `_rclive_session_=${sm[1]}` : "" };
}

async function doLogin(): Promise<string> {
  const email = process.env.PODIUM_EMAIL;
  const password = process.env.PODIUM_PASSWORD;
  if (!email || !password) throw new Error("PODIUM_EMAIL / PODIUM_PASSWORD not set");

  const { csrf, loginCookie } = await fetchCsrfAndCookie();

  const body = new URLSearchParams({
    "user[email]": email,
    "user[password]": password,
    authenticity_token: csrf,
  });

  const res = await fetch("https://podium.live/users/sign_in", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: loginCookie,
      "User-Agent": "Mozilla/5.0",
    },
    body: body.toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });

  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/_rclive_session_=([^;]+)/);
  if (!m) throw new Error(`Podium login failed (status ${res.status})`);
  return `_rclive_session_=${m[1]}`;
}

export async function getPodiumCookie(): Promise<string> {
  const kv = await getKv();

  if (kv) {
    const cached = await kv.get(KV_KEY);
    if (cached) return cached;
  } else if (localCache) {
    return localCache;
  }

  const cookie = await doLogin();

  if (kv) {
    await kv.put(KV_KEY, cookie, { expirationTtl: KV_TTL });
  } else {
    localCache = cookie;
  }

  return cookie;
}

export async function invalidatePodiumCookie(): Promise<void> {
  const kv = await getKv();
  if (kv) {
    await kv.delete(KV_KEY);
  } else {
    localCache = null;
  }
}
