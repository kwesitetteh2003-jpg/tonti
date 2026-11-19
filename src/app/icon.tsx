import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1c140e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f3eee4",
          fontSize: 42,
          fontWeight: 600,
          fontFamily: "serif",
        }}
      >
        T
      </div>
    ),
    size
  );
}
