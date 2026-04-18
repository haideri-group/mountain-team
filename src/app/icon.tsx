import { ImageResponse } from "next/og";

// Browser tab + bookmark favicon. Next.js 16 auto-generates <link rel="icon">
// with sizes=32x32 for this route.
//
// Note: `ImageResponse` renders via Satori, which cannot resolve OS font stacks
// like `ui-sans-serif` / `system-ui` — it only uses fonts registered in the
// `fonts` option (default: bundled Geist Regular, weight 400 only). Setting
// fontFamily/fontWeight here would be a silent no-op, so we rely on the
// default and compensate visually with a slightly larger glyph.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ff8400",
          borderRadius: 6,
          color: "#ffffff",
          fontSize: 20,
          letterSpacing: "-0.04em",
        }}
      >
        TF
      </div>
    ),
    size,
  );
}
