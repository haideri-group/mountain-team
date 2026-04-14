import { createHash } from "crypto";
import { uploadToR2, getR2PublicUrl } from "./client";

interface CacheResult {
  r2UrlSmall: string;
  r2UrlLarge: string;
  sourceUrl: string;
  hash: string;
}

/**
 * Modify an avatar source URL to request a specific size.
 * Handles Gravatar (?s=SIZE) and Google (=sSIZE) URL patterns.
 */
function getSourceUrlAtSize(sourceUrl: string, size: number): string {
  // Gravatar: secure.gravatar.com/avatar/hash?d=...&s=48 → change s param
  if (sourceUrl.includes("gravatar.com")) {
    const url = new URL(sourceUrl);
    url.searchParams.set("s", String(size));
    return url.toString();
  }

  // Google: lh3.googleusercontent.com/...=s100 → change =sXXX suffix
  if (sourceUrl.includes("googleusercontent.com")) {
    return sourceUrl.replace(/=s\d+/, `=s${size}`);
  }

  // Atlassian default avatars: ...?size=48 or /48x48 path
  if (sourceUrl.includes("atlassian") || sourceUrl.includes("atl-paas.net")) {
    // Try query param first
    try {
      const url = new URL(sourceUrl);
      if (url.searchParams.has("size")) {
        url.searchParams.set("size", String(size));
        return url.toString();
      }
    } catch { /* not a valid URL, return as-is */ }
    // Try path-based size
    return sourceUrl.replace(/\/\d+x\d+/, `/${size}x${size}`);
  }

  return sourceUrl;
}

/**
 * Detect content type from response headers or URL.
 */
function detectContentType(
  headers: Headers,
  url: string,
): { contentType: string; ext: string } {
  const ct = headers.get("content-type") || "";

  if (ct.includes("png")) return { contentType: "image/png", ext: "png" };
  if (ct.includes("gif")) return { contentType: "image/gif", ext: "gif" };
  if (ct.includes("webp")) return { contentType: "image/webp", ext: "webp" };
  if (ct.includes("svg")) return { contentType: "image/svg+xml", ext: "svg" };
  if (ct.includes("jpeg") || ct.includes("jpg")) return { contentType: "image/jpeg", ext: "jpg" };

  // Fallback: check URL extension
  if (url.includes(".png")) return { contentType: "image/png", ext: "png" };
  if (url.includes(".gif")) return { contentType: "image/gif", ext: "gif" };
  if (url.includes(".webp")) return { contentType: "image/webp", ext: "webp" };

  return { contentType: "image/jpeg", ext: "jpg" };
}

/**
 * Download an image from a URL with timeout.
 */
async function downloadImage(
  url: string,
  timeoutMs = 10000,
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TeamFlow/1.0" },
      redirect: "follow",
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`Avatar download failed (${res.status}): ${url.substring(0, 80)}`);
      return null;
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) {
      console.warn(`Avatar URL returned non-image content-type: ${ct}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const { contentType, ext } = detectContentType(res.headers, url);

    return { buffer, contentType, ext };
  } catch (err) {
    console.warn(`Avatar download error: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

/**
 * Cache a single member's avatar to R2 (both small + large sizes).
 */
export async function cacheAvatar(
  memberId: string,
  sourceUrl: string,
  existingSourceUrl: string | null,
  existingHash: string | null,
): Promise<CacheResult | null> {
  // Skip if source URL hasn't changed
  if (sourceUrl === existingSourceUrl && existingHash) return null;

  // Download small version (96x96)
  const smallUrl = getSourceUrlAtSize(sourceUrl, 96);
  const small = await downloadImage(smallUrl);
  if (!small) return null;

  // Compute hash of small image for change detection
  const hash = createHash("md5").update(small.buffer).digest("hex");

  // Skip if content hasn't changed (same hash)
  if (hash === existingHash) return null;

  // Download large version (256x256)
  const largeUrl = getSourceUrlAtSize(sourceUrl, 256);
  const large = await downloadImage(largeUrl);

  // Upload small to R2 (returns path only, e.g. "avatars/{id}/sm.png")
  const keySmall = `avatars/${memberId}/sm.${small.ext}`;
  const pathSmall = await uploadToR2(keySmall, small.buffer, small.contentType);

  // Upload large to R2 (fallback to small if large download failed)
  const keyLarge = `avatars/${memberId}/lg.${(large || small).ext}`;
  const pathLarge = await uploadToR2(
    keyLarge,
    (large || small).buffer,
    (large || small).contentType,
  );

  // Add cache-bust param to path
  const v = Date.now();

  return {
    r2UrlSmall: `${pathSmall}?v=${v}`,
    r2UrlLarge: `${pathLarge}?v=${v}`,
    sourceUrl,
    hash,
  };
}

/**
 * Cache avatars for a batch of team members.
 * Processes sequentially with small delay to avoid rate-limiting at source.
 */
export async function cacheAvatarsForTeam(
  members: Array<{
    id: string;
    sourceUrl: string;
    existingSourceUrl: string | null;
    existingHash: string | null;
  }>,
): Promise<Map<string, CacheResult>> {
  const results = new Map<string, CacheResult>();

  for (const member of members) {
    try {
      const result = await cacheAvatar(
        member.id,
        member.sourceUrl,
        member.existingSourceUrl,
        member.existingHash,
      );
      if (result) {
        results.set(member.id, result);
      }
    } catch (err) {
      console.error(
        `Failed to cache avatar for ${member.id}:`,
        err instanceof Error ? err.message : err,
      );
    }

    // Small delay between downloads to avoid rate-limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Sync a single member's avatar: Google Directory lookup → download → R2 cache → DB update.
 * Used after email change and can be reused by team sync for individual members.
 */
export async function syncSingleMemberAvatar(
  memberId: string,
  email: string,
  googleAccessToken?: string,
): Promise<boolean> {
  try {
    if (!googleAccessToken || !email) return false;

    const { findPhotoByEmail } = await import("@/lib/google/directory");
    const photoUrl = await findPhotoByEmail(googleAccessToken, email);
    if (!photoUrl) return false;

    const { db } = await import("@/lib/db");
    const { team_members } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { isR2Configured } = await import("@/lib/r2/client");

    // Update sourceAvatarUrl
    await db
      .update(team_members)
      .set({ sourceAvatarUrl: photoUrl, avatarHash: null })
      .where(eq(team_members.id, memberId));

    // Cache to R2 if configured
    if (isR2Configured()) {
      const result = await cacheAvatar(memberId, photoUrl, null, null);
      if (result) {
        await db
          .update(team_members)
          .set({
            avatarUrl: result.r2UrlSmall,
            sourceAvatarUrl: result.sourceUrl,
            avatarHash: result.hash,
          })
          .where(eq(team_members.id, memberId));
      }
    }

    return true;
  } catch (err) {
    console.warn(`Failed to sync avatar for member ${memberId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}
