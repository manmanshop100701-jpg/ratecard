/**
 * Lapisan database Lebak.market — SQLite bawaan Node (node:sqlite).
 * File DB dibuat otomatis di server/data.db; hapus file itu untuk reset total.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'data.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    kec TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otps (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    payload TEXT NOT NULL,      -- data registrasi yang menunggu verifikasi (JSON)
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER,          -- NULL untuk data seed
    seller_name TEXT NOT NULL,
    ava TEXT NOT NULL DEFAULT '🙋',
    ac TEXT NOT NULL DEFAULT '#fff3c4',
    verified INTEGER NOT NULL DEFAULT 0,
    cat TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    cond TEXT NOT NULL DEFAULT 'baru',
    loc TEXT NOT NULL,
    dist REAL NOT NULL,         -- km dari pusat (demo; produksi: koordinat + Haversine)
    cod INTEGER NOT NULL DEFAULT 1,
    freeship INTEGER NOT NULL DEFAULT 0,
    lebak INTEGER NOT NULL DEFAULT 0,
    emoji TEXT NOT NULL DEFAULT '📦',
    g TEXT NOT NULL DEFAULT 'g-1',
    likes INTEGER NOT NULL DEFAULT 0,
    descr TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    buyer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    mode TEXT NOT NULL,          -- rekber | driver | cod
    method TEXT,                 -- QRIS | VA | E-Wallet | Bayar di tempat
    method_id TEXT,
    price INTEGER NOT NULL,
    ship INTEGER NOT NULL DEFAULT 0,
    app_fee INTEGER NOT NULL DEFAULT 0,
    gateway_fee INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    recv_name TEXT,
    recv_addr TEXT,
    meet_point TEXT,
    meet_time TEXT,
    va TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT NOT NULL,
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,   -- pemilik percakapan (pembeli di demo)
    peer TEXT NOT NULL,         -- nama penjual lawan bicara
    from_me INTEGER NOT NULL,   -- 1 = user, 0 = penjual
    text TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    kind TEXT NOT NULL,          -- app_fee | commission | driver_cut | freeship_extra
    amount INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
`);

module.exports = db;
