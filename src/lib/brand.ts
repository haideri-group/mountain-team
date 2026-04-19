/**
 * Brand color constants — mirrors the design tokens in `globals.css`:
 *   --primary              (#ff8400)
 *   --primary-foreground   (#ffffff)
 *   --chart-2              (#944a00 — used as the dark end of the CTA gradient)
 *
 * Use this module in contexts where CSS custom properties can't be resolved,
 * e.g. `next/og` `ImageResponse` (which renders via Satori without a DOM, so
 * `var(--primary)` and Tailwind classes don't apply).
 *
 * If the brand palette changes, update `globals.css` AND this file together.
 */
export const BRAND = {
  primary: "#ff8400",
  primaryDark: "#944a00",
  onPrimary: "#ffffff",
} as const;

/**
 * Canonical Summit Logic primary CTA gradient. Prefer this over inlining the
 * `linear-gradient(135deg, #944a00, #ff8400)` literal so a single palette
 * change flows through every callsite.
 *
 * Usage: `style={{ background: BRAND_GRADIENT }}`. Tailwind's gradient
 * utilities can't cleanly express the diagonal two-stop form, so most
 * CTA buttons use this constant via `style`.
 */
export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary})`;
