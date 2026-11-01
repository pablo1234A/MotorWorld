import { ImageResponse } from "next/og";

export const alt = "Legalito · Textos legales para tu web, adaptados a tu negocio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F4F1EA", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <path d="M8.5 2.5h10.75L26.5 9.75V27a2.5 2.5 0 0 1-2.5 2.5H8.5A2.5 2.5 0 0 1 6 27V5a2.5 2.5 0 0 1 2.5-2.5Z" fill="#1F3A5F" />
            <path d="M19.25 2.5v5.25a2 2 0 0 0 2 2h5.25Z" fill="#2F5D8C" />
            <path d="m11 17.25 3.5 3.5 6.75-7" fill="none" stroke="#F4F1EA" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 44, fontWeight: 700, color: "#1F3A5F" }}>Legalito</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 68, fontWeight: 700, color: "#0f1e33", lineHeight: 1.08, maxWidth: 980 }}>Los textos legales de tu web, adaptados a tu negocio</span>
          <span style={{ fontSize: 30, color: "#2F5D8C" }}>Aviso legal · Política de privacidad · Política de cookies</span>
        </div>
      </div>
    ),
    size,
  );
}
