/**
 * Lapisan database Lebak.market — SQLite bawaan Node (node:sqlite).
 * File DB dibuat otomatis di server/data.db; hapus file itu untuk reset total.
 * Catatan: TIDAK ada data produk contoh — semua postingan berasal dari
 * pengguna asli yang terdaftar (100% real).
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
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL REFERENCES users(id),
    cat TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    cond TEXT NOT NULL DEFAULT 'baru',
    loc TEXT NOT NULL,
    dist REAL NOT NULL,          -- km dari pusat (demo; produksi: koordinat + Haversine)
    cod INTEGER NOT NULL DEFAULT 1,
    freeship INTEGER NOT NULL DEFAULT 0,
    lebak INTEGER NOT NULL DEFAULT 1,
    emoji TEXT NOT NULL DEFAULT '📦',
    g TEXT NOT NULL DEFAULT 'g-1',
    img TEXT,                    -- path foto produk (/uploads/xxx.jpg), NULL = tanpa foto
    descr TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    mode TEXT NOT NULL,           -- rekber | driver | cod
    method TEXT,
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
    sender_id INTEGER NOT NULL REFERENCES users(id),
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
`);

// Migrasi ringan untuk database lama (sebelum kolom img ada)
try { db.exec('ALTER TABLE products ADD COLUMN img TEXT'); } catch {}

module.exports = db;
