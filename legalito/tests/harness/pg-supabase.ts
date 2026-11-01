/**
 * DOBLE DE PRUEBAS: cliente compatible con el subconjunto de supabase-js que usa
 * Legalito, ejecutado sobre PostgreSQL real.
 *
 *  - Cada consulta se ejecuta con `set local role` (anon / authenticated /
 *    service_role) y los claims JWT en `request.jwt.claims`, de modo que las
 *    políticas RLS, los privilegios por columna, los disparadores y las
 *    funciones SQL se comportan como en Supabase.
 *  - Reproduce la semántica de PostgREST relevante: incrustaciones `rel(cols)` y
 *    `rel!fk(cols)`, error de relación ambigua, `.single()` / `.maybeSingle()`,
 *    `upsert` con `onConflict` / `ignoreDuplicates`, RPC escalar o de conjunto.
 *  - Storage en memoria y Auth mínima sobre `auth.users`.
 * Solo para pruebas: no se usa en la aplicación.
 */
import pg from "pg";

pg.types.setTypeParser(1184, (v) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString()); // timestamptz
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(20, (v) => Number(v)); // int8

type Role = "anon" | "authenticated" | "service_role";
type Row = Record<string, unknown>;
interface PgError {
  message: string;
  code?: string;
  details?: string;
}
interface Result<T = unknown> {
  data: T;
  error: PgError | null;
}

interface Fk {
  name: string;
  table: string;
  cols: string[];
  refTable: string;
  refCols: string[];
}
interface Meta {
  fks: Fk[];
  colTypes: Map<string, Map<string, string>>; // tabla → columna → tipo
  pks: Map<string, string[]>;
  fns: Map<string, { retset: boolean; scalar: boolean }>;
}

const metaCache = new WeakMap<pg.Pool, Promise<Meta>>();

async function loadMeta(pool: pg.Pool): Promise<Meta> {
  const fkRows = await pool.query(`
    select c.conname as name, tc.relname as table, rc.relname as ref_table,
           array(select a.attname from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)::text[] as cols,
           array(select a.attname from unnest(c.confkey) k join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k)::text[] as ref_cols
      from pg_constraint c
      join pg_class tc on tc.oid = c.conrelid join pg_namespace n on n.oid = tc.relnamespace
      join pg_class rc on rc.oid = c.confrelid
     where c.contype = 'f' and n.nspname = 'public'`);
  const colRows = await pool.query(
    `select table_name, column_name, data_type, udt_name from information_schema.columns where table_schema = 'public'`,
  );
  const pkRows = await pool.query(`
    select tc.relname as table, array(select a.attname from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)::text[] as cols
      from pg_constraint c join pg_class tc on tc.oid = c.conrelid join pg_namespace n on n.oid = tc.relnamespace
     where c.contype = 'p' and n.nspname = 'public'`);
  const fnRows = await pool.query(`
    select p.proname, p.proretset, t.typtype from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
     where n.nspname = 'public'`);
  const colTypes = new Map<string, Map<string, string>>();
  for (const r of colRows.rows) {
    if (!colTypes.has(r.table_name)) colTypes.set(r.table_name, new Map());
    colTypes.get(r.table_name)!.set(r.column_name, r.data_type === "ARRAY" ? `${r.udt_name}` : r.data_type);
  }
  return {
    fks: fkRows.rows.map((r) => ({ name: r.name, table: r.table, cols: r.cols, refTable: r.ref_table, refCols: r.ref_cols })),
    colTypes,
    pks: new Map(pkRows.rows.map((r) => [r.table as string, r.cols as string[]])),
    fns: new Map(fnRows.rows.map((r) => [r.proname as string, { retset: r.proretset as boolean, scalar: !r.proretset && r.typtype !== "c" }])),
  };
}

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`Identificador no válido: ${s}`);
  return `"${s}"`;
};

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

class Ambiguous extends Error {}

/** Traduce una lista de columnas estilo PostgREST a SQL (con incrustaciones como JSON). */
function selectSql(meta: Meta, table: string, alias: string, columns: string, depth = 0): string {
  const parts = splitTopLevel(columns || "*");
  return parts
    .map((p) => {
      const m = /^(?:(\w+):)?(\w+)(?:!(\w+))?\(([\s\S]*)\)$/.exec(p);
      if (!m) return p === "*" ? `${alias}.*` : `${alias}.${ident(p)}`;
      const [, as, rel, hint, inner] = m;
      let cands = meta.fks.filter(
        (f) => (f.table === table && f.refTable === rel) || (f.table === rel && f.refTable === table),
      );
      if (hint) cands = cands.filter((f) => f.name === hint || f.cols.includes(hint));
      if (cands.length === 0) throw new Error(`Sin relación entre ${table} y ${rel}`);
      if (cands.length > 1) {
        throw new Ambiguous(
          `Could not embed because more than one relationship was found for '${table}' and '${rel}' (${cands.map((c) => c.name).join(", ")})`,
        );
      }
      const fk = cands[0];
      const ra = `e${depth}_${rel}`;
      const innerSql = selectSql(meta, rel, ra, inner, depth + 1);
      const name = ident(as ?? rel);
      if (fk.table === table) {
        // muchos-a-uno → objeto
        const on = fk.cols.map((c, i) => `${ra}.${ident(fk.refCols[i])} = ${alias}.${ident(c)}`).join(" and ");
        return `(select row_to_json(x) from (select ${innerSql} from public.${ident(rel)} ${ra} where ${on}) x) as ${name}`;
      }
      // uno-a-muchos → array
      const on = fk.cols.map((c, i) => `${ra}.${ident(c)} = ${alias}.${ident(fk.refCols[i])}`).join(" and ");
      return `coalesce((select json_agg(row_to_json(x)) from (select ${innerSql} from public.${ident(rel)} ${ra} where ${on}) x), '[]'::json) as ${name}`;
    })
    .join(", ");
}

export interface MemoryStorage {
  files: Map<string, { body: Buffer; contentType?: string }>;
}

export interface HarnessUser {
  id: string;
  email: string;
}

export interface PgSupabaseOptions {
  role: Role;
  userId?: () => string | null;
  storage?: MemoryStorage;
}

async function run(pool: pg.Pool, role: Role, sub: string | null, sql: string, params: unknown[]): Promise<pg.QueryResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(sub ? { sub, role } : { role })]);
    const r = await client.query(sql, params);
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const toError = (e: unknown): PgError => {
  const err = e as { message?: string; code?: string; detail?: string };
  return { message: err.message ?? String(e), code: err.code, details: err.detail };
};

type Filter = { col: string; op: string; val: unknown };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private mode: "single" | "maybe" | null = null;
  private values: Row[] = [];
  private conflict: { cols?: string; ignore?: boolean } = {};

  constructor(
    private pool: pg.Pool,
    private opts: PgSupabaseOptions,
    private table: string,
  ) {}

  select(cols = "*") {
    if (this.op === "select") this.columns = cols;
    else this.returning = cols;
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = "insert";
    this.values = Array.isArray(v) ? v : [v];
    return this;
  }
  update(v: Row) {
    this.op = "update";
    this.values = [v];
    return this;
  }
  upsert(v: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.values = Array.isArray(v) ? v : [v];
    this.conflict = { cols: o.onConflict, ignore: o.ignoreDuplicates };
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "=", val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ col, op: "<>", val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ col, op: ">", val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ col, op: ">=", val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ col, op: "<", val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ col, op: "<=", val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  is(col: string, val: null | boolean) {
    this.filters.push({ col, op: "is", val });
    return this;
  }
  like(col: string, val: string) {
    this.filters.push({ col, op: "like", val });
    return this;
  }
  ilike(col: string, val: string) {
    this.filters.push({ col, op: "ilike", val });
    return this;
  }
  order(col: string, o: { ascending?: boolean } = {}) {
    this.orders.push({ col, asc: o.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.execute().then(ok, ko);
  }

  private where(params: unknown[], alias: string): string {
    if (this.filters.length === 0) return "";
    const parts = this.filters.map((f) => {
      const c = `${alias}.${ident(f.col)}`;
      if (f.op === "is") return `${c} is ${f.val === null ? "null" : f.val ? "true" : "false"}`;
      if (f.op === "in") {
        params.push(f.val);
        return `${c} = any($${params.length})`;
      }
      if (f.op === "like" || f.op === "ilike") {
        params.push(String(f.val).replace(/\*/g, "%"));
        return `${c} ${f.op} $${params.length}`;
      }
      params.push(f.val);
      return `${c} ${f.op} $${params.length}`;
    });
    return ` where ${parts.join(" and ")}`;
  }

  private encode(meta: Meta, col: string, v: unknown): unknown {
    const type = meta.colTypes.get(this.table)?.get(col);
    if ((type === "jsonb" || type === "json") && v !== null && v !== undefined) return JSON.stringify(v);
    return v;
  }

  private async execute(): Promise<Result> {
    const meta = await (metaCache.get(this.pool) ?? (metaCache.set(this.pool, loadMeta(this.pool)), metaCache.get(this.pool)!));
    const sub = this.opts.userId?.() ?? null;
    const params: unknown[] = [];
    const t = `public.${ident(this.table)}`;
    let sql: string;
    try {
      if (this.op === "select") {
        sql = `select ${selectSql(meta, this.table, "t", this.columns)} from ${t} t${this.where(params, "t")}`;
        if (this.orders.length) sql += ` order by ${this.orders.map((o) => `t.${ident(o.col)} ${o.asc ? "asc" : "desc"}`).join(", ")}`;
        if (this.limitN !== null) sql += ` limit ${Number(this.limitN)}`;
      } else if (this.op === "insert" || this.op === "upsert") {
        const cols = Array.from(new Set(this.values.flatMap((v) => Object.keys(v))));
        const rows = this.values.map(
          (v) =>
            `(${cols
              .map((c) => {
                if (!(c in v)) return "default";
                params.push(this.encode(meta, c, v[c]));
                return `$${params.length}`;
              })
              .join(", ")})`,
        );
        sql = `insert into ${t} as t (${cols.map(ident).join(", ")}) values ${rows.join(", ")}`;
        if (this.op === "upsert") {
          const target = (this.conflict.cols?.split(",").map((s) => s.trim()) ?? meta.pks.get(this.table) ?? []).map(ident).join(", ");
          sql += this.conflict.ignore
            ? ` on conflict (${target}) do nothing`
            : ` on conflict (${target}) do update set ${cols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
        }
        sql = `with w as (${sql} returning *) select ${this.returning ? selectSql(meta, this.table, "w", this.returning).replace(/\bw\./g, "w.") : "w.*"} from w`;
      } else if (this.op === "update") {
        const sets = Object.entries(this.values[0]).map(([c, v]) => {
          params.push(this.encode(meta, c, v));
          return `${ident(c)} = $${params.length}`;
        });
        sql = `with w as (update ${t} t set ${sets.join(", ")}${this.where(params, "t")} returning t.*) select ${this.returning ? selectSql(meta, this.table, "w", this.returning) : "w.*"} from w`;
      } else {
        sql = `with w as (delete from ${t} t${this.where(params, "t")} returning t.*) select w.* from w`;
      }
    } catch (e) {
      return { data: null, error: { message: (e as Error).message, code: e instanceof Ambiguous ? "PGRST201" : "PGRST100" } };
    }

    try {
      const r = await run(this.pool, this.opts.role, sub, sql, params);
      const rows = r.rows;
      const isMutation = this.op !== "select";
      if (isMutation && this.returning === null && this.mode === null) return { data: null, error: null };
      if (this.mode === "single") {
        if (rows.length !== 1) return { data: null, error: { message: `JSON object requested, multiple (or no) rows returned (${rows.length})`, code: "PGRST116" } };
        return { data: rows[0], error: null };
      }
      if (this.mode === "maybe") {
        if (rows.length > 1) return { data: null, error: { message: "Multiple rows returned", code: "PGRST116" } };
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }
}

class RpcCall implements PromiseLike<Result> {
  private mode: "single" | "maybe" | null = null;
  constructor(
    private pool: pg.Pool,
    private opts: PgSupabaseOptions,
    private fn: string,
    private args: Record<string, unknown>,
  ) {}
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.execute().then(ok, ko);
  }
  private async execute(): Promise<Result> {
    const meta = await (metaCache.get(this.pool) ?? (metaCache.set(this.pool, loadMeta(this.pool)), metaCache.get(this.pool)!));
    const info = meta.fns.get(this.fn);
    if (!info) return { data: null, error: { message: `Función desconocida ${this.fn}`, code: "PGRST202" } };
    const params: unknown[] = [];
    const named = Object.entries(this.args).map(([k, v]) => {
      params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
      return `${ident(k)} => $${params.length}`;
    });
    const call = `public.${ident(this.fn)}(${named.join(", ")})`;
    const sql = info.scalar ? `select ${call} as r` : `select * from ${call}`;
    try {
      const r = await run(this.pool, this.opts.role, this.opts.userId?.() ?? null, sql, params);
      let data: unknown = info.scalar ? (r.rows[0]?.r ?? null) : r.rows;
      if (this.mode && Array.isArray(data)) data = data[0] ?? null;
      return { data, error: null };
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }
}

export function createMemoryStorage(): MemoryStorage {
  return { files: new Map() };
}

export function createPgSupabase(pool: pg.Pool, opts: PgSupabaseOptions) {
  const storage = opts.storage ?? createMemoryStorage();
  return {
    from: (table: string) => new Query(pool, opts, table),
    rpc: (fn: string, args: Record<string, unknown> = {}) => new RpcCall(pool, opts, fn, args),
    storage: {
      from: (bucket: string) => ({
        async upload(path: string, body: Blob | Buffer | string, o: { contentType?: string; upsert?: boolean } = {}) {
          const key = `${bucket}/${path}`;
          if (storage.files.has(key) && !o.upsert) return { data: null, error: { message: "The resource already exists" } };
          const buf = body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body as Buffer);
          storage.files.set(key, { body: buf, contentType: o.contentType });
          return { data: { path }, error: null };
        },
        async remove(paths: string[]) {
          for (const p of paths) storage.files.delete(`${bucket}/${p}`);
          return { data: paths, error: null };
        },
        async download(path: string) {
          const f = storage.files.get(`${bucket}/${path}`);
          if (!f) return { data: null, error: { message: "Object not found" } };
          return { data: new Blob([new Uint8Array(f.body)], { type: f.contentType }), error: null };
        },
        async createSignedUrl(path: string, ttl: number, o: { download?: string } = {}) {
          if (!storage.files.has(`${bucket}/${path}`)) return { data: null, error: { message: "Object not found" } };
          return { data: { signedUrl: `https://storage.test/${bucket}/${path}?ttl=${ttl}&download=${o.download ?? ""}` }, error: null };
        },
      }),
    },
    auth: {
      async getUser() {
        const id = opts.userId?.();
        if (!id) return { data: { user: null }, error: { message: "Auth session missing!" } };
        const r = await pool.query("select id, email, email_confirmed_at, raw_user_meta_data from auth.users where id = $1", [id]);
        const u = r.rows[0];
        if (!u) return { data: { user: null }, error: { message: "User not found" } };
        return { data: { user: { id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at, user_metadata: u.raw_user_meta_data } }, error: null };
      },
    },
    _storage: storage,
  };
}

export type PgSupabase = ReturnType<typeof createPgSupabase>;
