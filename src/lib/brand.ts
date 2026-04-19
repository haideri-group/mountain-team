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
 * The Summit Logic primary CTA gradient. Use in `style` props where Tailwind
 * gradient utilities can't express a diagonal stop pair cleanly.
 *
 *   <button style={{ background: BRAND_GRADIENT }}>...</button>
 */
export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary})`;
