import { createSign } from "crypto";

/**
 * GitHub App authentication — server-to-server.
 *
 * Self-contained JWT signer + installation-token exchanger. No external
 * dep needed (Node's `crypto` handles RS256 signing). Caches the
 * installation token in memory until ~55 minutes in — token validity is
 * 60 minutes, we refresh at 55 to leave a safety margin.
 *
 * Environment (all three required for App auth to be active):
 *   GITHUB_APP_ID                 — numeric app ID
 *   GITHUB_APP_INSTALLATION_ID    — numeric installation ID
 *   GITHUB_APP_PRIVATE_KEY        — PEM-encoded RSA private key, with
 *                                   the `-----BEGIN/END-----` lines intact
 *
 * If any env var is missing or malformed, `getInstallationToken()` throws
 * and the caller (`auth-mode.ts`) falls back to PAT.
 */

interface CachedToken {
  token: string;
  expiresAt: Date;
}

let cached: CachedToken | null = null;
let inFlight: Promise<CachedToken> | null = null;

/** True if all three App env vars are present. Does NOT validate the key
 *  contents — `getInstallationToken()` surfaces malformed keys at use time. */
export function isAppAuthConfigured(): boolean {
  return (
    !!process.env.GITHUB_APP_ID &&
    !!process.env.GITHUB_APP_INSTALLATION_ID &&
    !!process.env.GITHUB_APP_PRIVATE_KEY
  );
}

/** Sign a JWT for GitHub App auth. iat = now - 60 (skew safety), exp = now + 600. */
function signAppJwt(appId: string, privateKey: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 60, exp: now + 600, iss: appId };

  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer
    .sign(privateKey)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signingInput}.${signature}`;
}

async function fetchInstallationToken(): Promise<CachedToken> {
  if (!isAppAuthConfigured()) {
    throw new Error("GitHub App env vars not fully configured");
  }
  const appId = process.env.GITHUB_APP_ID!;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID!;
  // Railway stores the key with literal `\n` escapes if pasted as a single
  // line; convert back to real newlines. Pasting a true multi-line value
  // works too — this is idempotent.
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  const jwt = signAppJwt(appId, privateKey);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GitHub App installation-token exchange failed ${res.status}: ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { token: string; expires_at: string };
  const expiresAt = new Date(data.expires_at);
  // Refresh 5 minutes before the real expiry.
  const effectiveExpiry = new Date(expiresAt.getTime() - 5 * 60 * 1000);
  return { token: data.token, expiresAt: effectiveExpiry };
}

/**
 * Returns a valid installation token. Uses the cached token if it's still
 * in the refresh window; otherwise exchanges a new one. Multiple concurrent
 * callers coalesce onto a single exchange via the `inFlight` promise.
 */
export async function getInstallationToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt.getTime() > now) return cached.token;
  if (inFlight) return (await inFlight).token;

  inFlight = (async () => {
    try {
      cached = await fetchInstallationToken();
      return cached;
    } finally {
      inFlight = null;
    }
  })();

  return (await inFlight).token;
}

/** For diagnostics / admin UI. Does not force a refresh. */
export function getCachedInstallationTokenExpiry(): Date | null {
  return cached ? new Date(cached.expiresAt) : null;
}

/** Clears the cached installation token. Useful after rotating the App key. */
export function clearInstallationTokenCache(): void {
  cached = null;
}
