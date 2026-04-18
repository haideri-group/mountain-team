import { ImageResponse } from "next/og";

// iOS Home Screen icon (180x180). iOS applies its own rounded-corner mask,
// so we render a full-bleed gradient square with the TF monogram centered.
//
// Note: `ImageResponse` renders via Satori, which cannot resolve OS font stacks
// like `ui-sans-serif` / `system-ui` — it only uses fonts registered in the
// `fonts` option (default: bundled Geist Regular, weight 400 only). Setting
// fontFamily/fontWeight here would be a silent no-op, so we rely on the
// default and compensate visually with a larger glyph.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #944a00 0%, #ff8400 100%)",
          color: "#ffffff",
          fontSize: 112,
          letterSpacing: "-0.05em",
        }}
      >
        TF
      </div>
    ),
    size,
  );
}
