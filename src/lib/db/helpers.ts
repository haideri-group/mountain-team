import { resolveAvatarUrl } from "@/lib/r2/client";

/**
 * Resolve avatarUrl for a member record.
 * If the URL is an R2 path (not a full URL), prepends the R2 public base URL.
 * Apply this after every DB query that returns team_members with avatarUrl.
 */
export function withResolvedAvatar<T extends { avatarUrl: string | null }>(
  member: T,
): T {
  return { ...member, avatarUrl: resolveAvatarUrl(member.avatarUrl) };
}

/**
 * Batch version — resolve avatarUrl for an array of member records.
 */
export function withResolvedAvatars<T extends { avatarUrl: string | null }>(
  members: T[],
): T[] {
  return members.map(withResolvedAvatar);
}
