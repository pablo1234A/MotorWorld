import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Tras iniciar/cerrar sesión se hace una navegación completa a propósito, para que el
      // servidor reciba las cookies nuevas y no quede estado de cliente de la sesión anterior.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "legacy/**", "playwright-report/**", "test-results/**", "src/lib/supabase/database.types.ts", "next-env.d.ts"],
  },
];

export default config;
