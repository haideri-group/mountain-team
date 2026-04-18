import { ImageResponse } from "next/og";

// Browser tab + bookmark favicon. Next.js 16 auto-generates <link rel="icon">
// with sizes=32x32 for this route.
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
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "-0.04em",
        }}
      >
        TF
      </div>
    ),
    size,
  );
}
