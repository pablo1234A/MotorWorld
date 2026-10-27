declare module 'sql.js/dist/sql-wasm-inline.js' {
  import type { SqlJsStatic } from 'sql.js';
  const initSqlJs: () => Promise<SqlJsStatic>;
  export default initSqlJs;
}
