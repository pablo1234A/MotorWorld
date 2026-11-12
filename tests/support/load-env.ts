import { config } from "dotenv";

// Las pruebas de integración usan la instancia local de Supabase (supabase start).
config({ path: ".env.test", quiet: true });
config({ path: ".env.local", quiet: true });
