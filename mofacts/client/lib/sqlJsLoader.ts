const initSqlJs: any = require('sql.js');

const SQL_WASM_URL = '/vendor/sql.js/1.13.0/sql-wasm.wasm';

let sqlLoadPromise: Promise<any> | null = null;

export function ensureSqlJs(): Promise<any> {
  const existingLoadPromise = sqlLoadPromise;
  if (existingLoadPromise) {
    return existingLoadPromise;
  }

    const nextLoadPromise = initSqlJs({
      locateFile: () => SQL_WASM_URL
    }).catch((error: unknown) => {
      sqlLoadPromise = null;
      throw error;
    });
    sqlLoadPromise = nextLoadPromise;

  return nextLoadPromise;
}
