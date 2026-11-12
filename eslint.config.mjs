import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "legacy/**", "playwright-report/**", "test-results/**", "src/lib/supabase/database.types.ts", "next-env.d.ts"],
  },
];

export default config;
