import { ImageResponse } from "next/og";

// iOS Home Screen icon (180x180). iOS applies its own rounded-corner mask,
// so we render a full-bleed orange square with the TF monogram centered.
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
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontSize: 100,
          fontWeight: 800,
          letterSpacing: "-0.05em",
        }}
      >
        TF
      </div>
    ),
    size,
  );
}
