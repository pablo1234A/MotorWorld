import type { Database as SqlJsDatabase, SqlJsStatic, SqlValue } from 'sql.js';

/** node:sqlite (DatabaseSync) implemented over sql.js (SQLite compiled to WebAssembly). */
let SQL: SqlJsStatic | null = null;
let initial: Uint8Array | null = null;
let onDirty: (db: DatabaseSync) => void = () => {};

export function __configure(sql: SqlJsStatic, data: Uint8Array | null, dirty: (db: DatabaseSync) => void) {
  SQL = sql;
  initial = data;
  onDirty = dirty;
}

export type SQLInputValue = null | number | bigint | string | Uint8Array;

const norm = (params: SQLInputValue[]): SqlValue[] => params.map((v) => (typeof v === 'bigint' ? Number(v) : v)) as SqlValue[];

export class DatabaseSync {
  readonly db: SqlJsDatabase;

  constructor(_file: string) {
    if (!SQL) throw new Error('sql.js not initialised');
    this.db = initial ? new SQL.Database(initial) : new SQL.Database();
    initial = null;
  }

  exec(sql: string) {
    this.db.exec(sql);
    if (!/^\s*(BEGIN|COMMIT|ROLLBACK|PRAGMA)/i.test(sql)) onDirty(this);
    else if (/^\s*COMMIT/i.test(sql)) onDirty(this);
  }

  prepare(sql: string) {
    const db = this.db;
    const self = this;
    return {
      run(...params: SQLInputValue[]) {
        const st = db.prepare(sql);
        try {
          st.run(norm(params));
        } finally {
          st.free();
        }
        const changes = db.getRowsModified();
        const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0;
        onDirty(self);
        return { lastInsertRowid: Number(id), changes };
      },
      get(...params: SQLInputValue[]) {
        const st = db.prepare(sql);
        try {
          st.bind(norm(params));
          return st.step() ? (st.getAsObject() as Record<string, unknown>) : undefined;
        } finally {
          st.free();
        }
      },
      all(...params: SQLInputValue[]) {
        const st = db.prepare(sql);
        const rows: Record<string, unknown>[] = [];
        try {
          st.bind(norm(params));
          while (st.step()) rows.push(st.getAsObject() as Record<string, unknown>);
        } finally {
          st.free();
        }
        return rows;
      },
    };
  }

  /** Snapshot for persistence (sql.js resets pragmas on export, so restore them). */
  export(): Uint8Array {
    const data = this.db.export();
    this.db.exec('PRAGMA foreign_keys = ON;');
    return data;
  }

  close() {
    this.db.close();
  }
}

export default { DatabaseSync };
