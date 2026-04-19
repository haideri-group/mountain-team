import { auth } from "@/auth";
import { getClientIp } from "./resolve";
import { isIpAllowed } from "./match";
import { getAllowlist } from "./allowlist-cache";

/**
 * Gate for public GET APIs (/api/overview, /api/issues/*, /api/calendar).
 *
 * Allow if EITHER:
 *   - the user has a session (any logged-in user can read)
 *   - OR the request comes from an allowlisted IP (guest read access)
 *
 * Otherwise return unauthorized. Callers translate that to a 401 response.
 * Fails closed when the IP can't be determined.
 */
export async function requirePublicOrSession(
  request: Request,
): Promise<{ allowed: true } | { allowed: false; reason: "unauthorized" }> {
  const session = await auth();
  if (session?.user) return { allowed: true };

  const ip = getClientIp(request);
  if (!ip) return { allowed: false, reason: "unauthorized" };

  const allowlist = await getAllowlist();
  if (isIpAllowed(ip, allowlist)) return { allowed: true };

  return { allowed: false, reason: "unauthorized" };
}
