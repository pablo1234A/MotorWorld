/**
 * BACKEND DE PRUEBAS PARA LA APLICACIÓN COMPLETA (solo con LEGALITO_TEST_BACKEND=1).
 *
 * next.config.ts redirige `@supabase/supabase-js` y `@supabase/ssr` a este
 * módulo, de modo que el servidor Next real funciona contra PostgreSQL local con
 * RLS real, sin servicios externos. La sesión se guarda en la cookie
 * `sb-qa-auth-token` (id del usuario). Contraseña única de pruebas: QA_PASSWORD.
 * Nunca se activa en producción.
 */
import pg from "pg";
import { createPgSupabase, createMemoryStorage } from "./pg-supabase";

if (process.env.APP_ENV === "production") {
  throw new Error("El backend de pruebas no puede usarse en producción.");
}

export const QA_PASSWORD = "Legalito-QA-2026";
const COOKIE = "sb-qa-auth-token";

const g = globalThis as unknown as { __qaPool?: pg.Pool; __qaStorage?: ReturnType<typeof createMemoryStorage> };
const pool = () => (g.__qaPool ??= new pg.Pool({ connectionString: process.env.TEST_BACKEND_DATABASE_URL, max: 8 }));
const storage = () => (g.__qaStorage ??= createMemoryStorage());

/** Equivalente a createClient de supabase-js: anon o service_role según la clave. */
export function createClient(_url: string, key: string) {
  const role = key === process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon";
  return createPgSupabase(pool(), { role, storage: storage() });
}

type CookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll?: (c: { name: string; value: string; options: Record<string, unknown> }[]) => void;
};

/** Equivalente a createServerClient de @supabase/ssr con sesión basada en cookie. */
export function createServerClient(_url: string, _key: string, opts: { cookies: CookieMethods }) {
  let uid = opts.cookies.getAll().find((c) => c.name === COOKIE)?.value ?? null;
  const base = createPgSupabase(pool(), { role: "authenticated", userId: () => uid, storage: storage() });
  const setSession = (id: string | null) => {
    uid = id;
    opts.cookies.setAll?.([{ name: COOKIE, value: id ?? "", options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: id ? 3600 : 0 } }]);
  };
  const userBy = async (email: string) => (await pool().query("select id, email, email_confirmed_at from auth.users where email = $1", [email])).rows[0];
  return {
    ...base,
    auth: {
      ...base.auth,
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const u = await userBy(email);
        if (!u || password !== QA_PASSWORD) return { data: { user: null }, error: { message: "Invalid login credentials" } };
        if (!u.email_confirmed_at) return { data: { user: null }, error: { message: "Email not confirmed" } };
        setSession(u.id);
        return { data: { user: { id: u.id, email: u.email } }, error: null };
      },
      async signUp({ email, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
        if (await userBy(email)) return { data: { user: null }, error: { message: "User already registered" } };
        await pool().query("insert into auth.users (email, raw_user_meta_data) values ($1, $2)", [email, JSON.stringify(options?.data ?? {})]);
        return { data: { user: null }, error: null };
      },
      async signOut() {
        setSession(null);
        return { error: null };
      },
      async resend() {
        return { data: {}, error: null };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
      async updateUser() {
        return { data: {}, error: null };
      },
      async verifyOtp() {
        return { data: {}, error: { message: "No disponible en el backend de pruebas" } };
      },
      async exchangeCodeForSession() {
        return { data: {}, error: { message: "No disponible en el backend de pruebas" } };
      },
    },
  };
}

export type SupabaseClient = ReturnType<typeof createPgSupabase>;
export type EmailOtpType = string;
