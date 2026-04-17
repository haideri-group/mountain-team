/**
 * Maps JIRA Brand names to deployment site codes.
 *
 * JIRA issues have a "Brands" field (comma-separated) that determines
 * which production sites need the deployment. Site codes match the
 * siteName values in github_branch_mappings.
 *
 * Two repos use different codes for the same brand:
 *   Frontend (tile-mountain-sdk): tilemtn, bathmtn, wallsandfloors, etc.
 *   Backend (tilemountain2): tm, bm, waf, etc.
 * Both are included so deployment matching works across repos.
 */

/**
 * Maps JIRA brand names to production site codes.
 *
 * IMPORTANT: This map and SITE_LABELS below must be updated together
 * when brands or sites change. Duplicate entries (e.g., "Bathroom Mountain"
 * and "Bath Mountain") exist because JIRA uses inconsistent naming.
 */
const BRAND_SITE_MAP: Record<string, string[]> = {
  "Tile Mountain": ["tilemtn", "tm"],
  "Bathroom Mountain": ["bathmtn", "bm"],
  "Bath Mountain": ["bathmtn", "bm"],
  "Walls and Floors": ["wallsandfloors", "waf"],
  "Tile Mountain AE": ["tilemtnae", "tmdubai"],
  "TM Dubai": ["tilemtnae", "tmdubai"],
  "Trade by Walls and Floors": ["waftrd"],
  "WAF Trade": ["waftrd"],
  "Splendour": ["splendourtiles"],
  "Splendour Tiles": ["splendourtiles"],
  "Wholesale": [],
};

/**
 * Parse the comma-separated brands string into individual brand names.
 */
function parseBrands(brandsStr: string): string[] {
  return brandsStr
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Returns the list of production site codes that a task should be deployed to
 * based on its JIRA Brands field.
 *
 * @param brandsStr - Comma-separated brand names from issues.brands
 * @param allProductionSites - All configured production site codes (for "All Brands")
 * @returns Site codes array, or null if brands is not set (unknown scope)
 */
export function getExpectedSites(
  brandsStr: string | null,
  allProductionSites: string[],
): string[] | null {
  if (!brandsStr) return null;

  const brands = parseBrands(brandsStr);
  if (brands.length === 0) return null;

  // "All Brands" means every configured production site
  if (brands.some((b) => b.toLowerCase() === "all brands")) {
    return allProductionSites;
  }

  const sites = new Set<string>();
  for (const brand of brands) {
    const mapped = BRAND_SITE_MAP[brand];
    if (mapped) {
      for (const s of mapped) sites.add(s);
    }
  }

  return sites.size > 0 ? [...sites].sort() : null;
}

/**
 * Compares expected deployment sites (from brands) against actual deployed sites.
 *
 * @returns Completeness info, or null if brands is not set
 */
export function getDeploymentCompleteness(
  brandsStr: string | null,
  deployedSiteNames: string[],
  allProductionSites: string[],
): {
  expected: string[];
  deployed: string[];
  missing: string[];
  complete: boolean;
  percentage: number;
} | null {
  const expected = getExpectedSites(brandsStr, allProductionSites);
  if (!expected || expected.length === 0) return null;

  const deployedSet = new Set(deployedSiteNames);
  const deployed = expected.filter((s) => deployedSet.has(s));
  const missing = expected.filter((s) => !deployedSet.has(s));

  return {
    expected,
    deployed,
    missing,
    complete: missing.length === 0,
    percentage: Math.round((deployed.length / expected.length) * 100),
  };
}

/**
 * Maps site codes to human-readable labels for UI display.
 * Must be kept in sync with BRAND_SITE_MAP above.
 */
const SITE_LABELS: Record<string, string> = {
  tilemtn: "Tile Mountain",
  tm: "Tile Mountain",
  bathmtn: "Bath Mountain",
  bm: "Bath Mountain",
  wallsandfloors: "Walls and Floors",
  waf: "Walls and Floors",
  tilemtnae: "TM Dubai",
  tmdubai: "TM Dubai",
  waftrd: "WAF Trade",
  splendourtiles: "Splendour Tiles",
};

/**
 * Maps brand names to their primary website URLs.
 * Derived from actual JIRA issue data (brands + website fields).
 * Must be kept in sync with BRAND_SITE_MAP above.
 */
const BRAND_WEBSITES: Record<string, string> = {
  "Tile Mountain": "www.tilemountain.co.uk",
  "Bathroom Mountain": "bathroommountain.co.uk",
  "Bath Mountain": "bathroommountain.co.uk",
  "Walls and Floors": "www.wallsandfloors.co.uk",
  "Tile Mountain AE": "www.tilemountain.ae",
  "TM Dubai": "www.tilemountain.ae",
  "Trade by Walls and Floors": "trade.wallsandfloors.co.uk",
  "WAF Trade": "trade.wallsandfloors.co.uk",
  "Splendour": "www.splendourtiles.co.uk",
  "Splendour Tiles": "www.splendourtiles.co.uk",
};

/**
 * Returns the website URL for a brand name, or null if unknown.
 */
export function getBrandWebsite(brand: string): string | null {
  return BRAND_WEBSITES[brand] || null;
}

export function getSiteLabel(siteName: string): string {
  return SITE_LABELS[siteName] || siteName;
}
