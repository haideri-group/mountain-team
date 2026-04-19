---
name: ImageResponse / Satori font limits in Next.js 16
description: next/og's ImageResponse (Satori + Geist-Regular bundled) can't resolve OS font stacks or non-400 weights; fontFamily/fontWeight often silently no-op.
type: project
---

`next/og`'s `ImageResponse` renders via Satori with a bundled default font: `Geist-Regular.ttf` (weight 400, style normal). Verified at `mountain-team/node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf` and the init block `var fonts = [{ name: "geist", data, weight: 400, style: "normal" }]` in `index.node.js`.

Implications we keep hitting in reviews:

- `fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"` is a silent no-op. Satori cannot access the OS font library — these CSS keywords don't resolve. Output falls back to the bundled Geist. Drop the declaration rather than misleading readers.
- `fontWeight: 700/800/etc.` is also a silent no-op unless a matching weight is provided via the `fonts` option. Geist is only registered at 400.
- Only `ttf`, `otf`, `woff` font files work if supplying custom fonts. Bundle inside `assets/` and read with `node:fs/promises` at request time (docs example).
- Advanced CSS like `display: grid` is not supported. Only flexbox + a subset.
- 500KB total bundle limit (JSX + CSS + fonts + images).
- Icon routes (`icon.tsx`, `apple-icon.tsx`) are **statically prerendered** by default unless they use request-time APIs. Verified in build output (`○ /icon`, `○ /apple-icon`).

**Why:** Came up reviewing PR #41 (custom favicon). The original `icon.tsx`/`apple-icon.tsx` set a system font stack + `fontWeight: 800` which both look intentional but do nothing — the rendered glyph uses Geist-Regular. Easy miss because there's no warning, just a visual discrepancy from what the JSX implies.

**How to apply:** When reviewing any `ImageResponse` usage in this repo — `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`, or `/api/*` routes — strip no-op `fontFamily`/`fontWeight` values or require a bundled font file via the `fonts` option. Satori-supported CSS is the Satori README, not Tailwind docs.
