import type { Config } from "tailwindcss";

// Identidad Reseñalo: crema cálido + tinta carbón (logotipo) + amarillo estrella como acento.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: "#FCF9F2", 50: "#FEFDF9", 100: "#FCF9F2", 200: "#F6F0E3", 300: "#EDE4D2" },
        ink: { DEFAULT: "#2E2A29", 900: "#1F1C1B", 800: "#2E2A29", 700: "#45403E", 600: "#5F5956", 500: "#7A736F", 400: "#A39C97", 300: "#CFC8C1", 200: "#E6E0D8", 100: "#F1ECE5" },
        star: { DEFAULT: "#F9C440", 50: "#FEF8E6", 100: "#FDEFC4", 200: "#FBE08A", 300: "#F9C440", 500: "#E0A615", 700: "#9A6F05", 800: "#7A5804" },
        ok: { 50: "#ECF7EF", 600: "#2E7D4F", 700: "#226240" },
        warn: { 50: "#FDF5E7", 600: "#B5700B", 700: "#8F5806" },
        bad: { 50: "#FBEDEC", 600: "#C2412D", 700: "#9C3021" },
        info: { 50: "#EDF3FA", 600: "#2F6AA8", 700: "#24548A" },
      },
      fontFamily: {
        display: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["'Inter Variable'", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { xl: "14px", lg: "10px", md: "8px" },
      boxShadow: {
        card: "0 1px 2px rgba(46,42,41,0.04), 0 1px 1px rgba(46,42,41,0.03)",
        pop: "0 10px 30px -12px rgba(46,42,41,0.25)",
      },
      maxWidth: { content: "1160px" },
    },
  },
  plugins: [],
} satisfies Config;
