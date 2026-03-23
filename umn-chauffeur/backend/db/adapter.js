// backend/db/adapter.js
// Wraps sql.js (pure-JS WASM SQLite) with a better-sqlite3-compatible
// synchronous API so the rest of the codebase is unchanged.

const fs = require('fs');
const path = require('path');

// DB_PATH can be overridden via env var (used in Docker to point at a named volume).
// Default: same directory as this file (works for local dev).
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'chauffeur.sqlite');

let _db = null; // singleton SqlJsDb instance

// ── Statement wrapper ─────────────────────────────────────────────────────────
class SqlJsStatement {
  constructor(dbWrapper, sql) {
    this._w  = dbWrapper;   // SqlJsDb
    this._sql = sql;
  }

  // Prepare a fresh stmt each call (sql.js stmts can only be used once per bind)
  _fresh() {
    return this._w._sqlDb.prepare(this._sql);
  }

  _flatParams(args) {
    // accept (v1, v2, ...) or ([v1, v2]) or ({$k: v})
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object') return args[0]; // named
    return args;
  }

  // Return single row as plain object, or undefined
  get(...args) {
    const stmt = this._fresh();
    const params = this._flatParams(args);
    try {
      if (params && (Array.isArray(params) ? params.length : Object.keys(params).length)) {
        stmt.bind(params);
      }
      return stmt.step() ? this._rowToObj(stmt) : undefined;
    } finally {
      stmt.free();
    }
  }

  // Return all rows as array of plain objects
  all(...args) {
    const stmt = this._fresh();
    const params = this._flatParams(args);
    try {
      if (params && (Array.isArray(params) ? params.length : Object.keys(params).length)) {
        stmt.bind(params);
      }
      const rows = [];
      while (stmt.step()) rows.push(this._rowToObj(stmt));
      return rows;
    } finally {
      stmt.free();
    }
  }

  // Execute DML; return { changes, lastInsertRowid }
  run(...args) {
    const stmt = this._fresh();
    const params = this._flatParams(args);
    try {
      if (params && (Array.isArray(params) ? params.length : Object.keys(params).length)) {
        stmt.bind(params);
      }
      stmt.step();
      const changes = this._w._sqlDb.getRowsModified();
      const ridRows = this._w._sqlDb.exec('SELECT last_insert_rowid()');
      const lastInsertRowid = ridRows[0]?.values[0][0] ?? 0;
      if (!this._w._inTransaction) this._w._save();
      return { changes, lastInsertRowid };
    } finally {
      stmt.free();
    }
  }

  _rowToObj(stmt) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const obj = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return obj;
  }
}

// ── Database wrapper ──────────────────────────────────────────────────────────
class SqlJsDb {
  constructor(sqlDb, dbPath) {
    this._sqlDb = sqlDb;
    this._path  = dbPath;
    this._inTransaction = false;
  }

  prepare(sql) {
    return new SqlJsStatement(this, sql);
  }

  // Execute raw SQL string (may contain multiple semicolon-separated statements)
  exec(sql) {
    this._sqlDb.run(sql);   // sql.js run() handles one stmt; for multi-stmt DDL use the loop below
    return this;
  }

  // Multi-statement exec (used by schema DDL)
  execMulti(sql) {
    // Split on semicolons, skip empty parts
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const s of stmts) {
      this._sqlDb.run(s);
    }
    this._save();
    return this;
  }

  // Wrap a function in a BEGIN/COMMIT transaction
  transaction(fn) {
    return (...args) => {
      this._inTransaction = true;
      this._sqlDb.run('BEGIN');
      try {
        const result = fn(...args);
        this._sqlDb.run('COMMIT');
        this._save();
        return result;
      } catch (e) {
        this._sqlDb.run('ROLLBACK');
        throw e;
      } finally {
        this._inTransaction = false;
      }
    };
  }

  _save() {
    const data = this._sqlDb.export();
    fs.writeFileSync(this._path, Buffer.from(data));
  }
}

// ── Module-level initialiser (call once at server start) ──────────────────────
async function initAdapter() {
  if (_db) return _db;

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buf);
  } else {
    sqlDb = new SQL.Database();
  }

  _db = new SqlJsDb(sqlDb, DB_PATH);
  return _db;
}

function getDb() {
  if (!_db) throw new Error('[DB] Database not initialised yet. Await initAdapter() first.');
  return _db;
}

module.exports = { initAdapter, getDb, DB_PATH };
