/**
 * Lapisan database Lebak.market — SQLite bawaan Node (node:sqlite).
 * File DB dibuat otomatis di server/data.db; hapus file itu untuk reset total.
 * Catatan: TIDAK ada data produk contoh — semua postingan berasal dari
 * pengguna asli yang terdaftar (100% real).
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

/* Lokasi DB: env DB_PATH > volume /data (Railway/Render) > folder server.
 * PENTING utk produksi: pasang Volume di Railway (mount path /data) agar
 * database TIDAK hilang setiap deploy — tanpa volume, filesystem di-reset. */
const DB_PATH = process.env.DB_PATH
  || (fs.existsSync('/data') ? '/data/data.db' : path.join(__dirname, 'data.db'));
console.log('🗄️  Database:', DB_PATH, DB_PATH.startsWith('/data') ? '(volume persisten ✓)' : '(EPHEMERAL — pasang Volume /data di Railway agar data awet!)');
const db = new DatabaseSync(DB_PATH);

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
    dist REAL NOT NULL,          -- warisan lama; kini jarak dihitung live via Haversine dari lat/lng
    lat REAL,                    -- posisi GPS penjual saat posting (fallback: titik pusat kecamatan)
    lng REAL,
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

  CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallet_txns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,          -- escrow_in | withdraw | purchase
    amount INTEGER NOT NULL,     -- + masuk, - keluar
    note TEXT NOT NULL DEFAULT '',
    order_id TEXT,
    at INTEGER NOT NULL
  );
`);

// Migrasi ringan untuk database lama (sebelum kolom img/lat/lng/dst ada)
try { db.exec('ALTER TABLE products ADD COLUMN img TEXT'); } catch {}
try { db.exec('ALTER TABLE products ADD COLUMN lat REAL'); } catch {}
try { db.exec('ALTER TABLE products ADD COLUMN lng REAL'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN cod_debt INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN balance INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN snap_token TEXT'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN pay_url TEXT'); } catch {}
try { db.exec('ALTER TABLE products ADD COLUMN ship_cost INTEGER'); } catch {} // ongkir tetap dari penjual (peternakan dll.)
try { db.exec("UPDATE products SET cat = 'ternak' WHERE cat = 'ikan'"); } catch {} // Ikan Hias → Peternakan
try { db.exec('ALTER TABLE orders ADD COLUMN pay_proof TEXT'); } catch {} // bukti transfer (pembayaran manual)

module.exports = db;
