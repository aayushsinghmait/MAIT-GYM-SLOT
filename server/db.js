// server/db.js — SQLite database using sql.js (pure JavaScript, no native build needed)
'use strict';

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'gym.db');

let _wrapper   = null;
let _initPromise = null;

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let fileBuffer = null;
  if (fs.existsSync(DB_PATH)) {
    fileBuffer = fs.readFileSync(DB_PATH);
  }

  const rawDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  rawDb.run("PRAGMA foreign_keys = ON;");

  // ─── Schema ────────────────────────────────────────────────────────────────
  rawDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'member',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT    NOT NULL,
      start_hour   INTEGER NOT NULL,
      capacity     INTEGER NOT NULL DEFAULT 20,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_date, start_hour)
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL,
      user_id      INTEGER NOT NULL,
      checkin_code TEXT    NOT NULL UNIQUE,
      status       TEXT    NOT NULL DEFAULT 'confirmed',
      attended     INTEGER NOT NULL DEFAULT 0,
      attended_at  TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS waitlist (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'waiting',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, user_id)
    );
  `);

  // ─── Save helper ───────────────────────────────────────────────────────────
  function save() {
    const data = rawDb.export();
    const buf  = Buffer.from(data);
    const dir  = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, buf);
  }

  // ─── Low-level helpers (no auto-save) ─────────────────────────────────────
  function _get(sql, params) {
    const stmt = rawDb.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  function _all(sql, params) {
    const stmt = rawDb.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function _run(sql, params) {
    rawDb.run(sql, params);
    const row = _get('SELECT last_insert_rowid() as id', []);
    return { lastInsertRowid: row ? Number(row.id) : null };
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  _wrapper = {
    /** Normalise variadic args → flat array */
    _params(args) {
      return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    },

    get(sql, ...args) {
      return _get(sql, this._params(args));
    },

    all(sql, ...args) {
      return _all(sql, this._params(args));
    },

    run(sql, ...args) {
      const result = _run(sql, this._params(args));
      save();
      return result;
    },

    prepare(sql) {
      const self = this;
      return {
        get(...args)  { return self.get(sql, ...args); },
        all(...args)  { return self.all(sql, ...args); },
        run(...args)  { return self.run(sql, ...args); }
      };
    },

    /**
     * transaction(fn) — BEGIN/COMMIT wrapper.
     * Inside fn, use the inner `txDb` which does NOT auto-save after each run.
     * One save() happens after COMMIT.
     */
    transaction(fn) {
      // Build a version of the wrapper that skips save() on .run()
      const txDb = {
        _params(args) {
          return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        },
        get(sql, ...args) { return _get(sql, txDb._params(args)); },
        all(sql, ...args) { return _all(sql, txDb._params(args)); },
        run(sql, ...args) { return _run(sql, txDb._params(args)); },
        prepare(sql) {
          return {
            get(...args)  { return txDb.get(sql, ...args); },
            all(...args)  { return txDb.all(sql, ...args); },
            run(...args)  { return txDb.run(sql, ...args); }
          };
        }
      };

      return function(...outerArgs) {
        rawDb.run('BEGIN');
        try {
          const result = fn.call(null, txDb, ...outerArgs);
          rawDb.run('COMMIT');
          save();
          return result;
        } catch (err) {
          try { rawDb.run('ROLLBACK'); } catch (_) { /* ignore rollback error */ }
          throw err;
        }
      };
    }
  };

  return _wrapper;
}

function getDb() {
  if (!_initPromise) _initPromise = initDb();
  return _initPromise;
}

module.exports = { getDb };
