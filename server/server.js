/**
 * Lebak.market — Backend API
 * ---------------------------------------------------------------
 * Node.js + Express + SQLite (node:sqlite, bawaan Node 22+).
 *
 * Fitur:
 *  - Auth: register → OTP email → verify → JWT; login; password di-bcrypt
 *  - Produk: list (filter kategori/radius/cari, prioritas Lebak), posting
 *  - Order: rekber/driver/COD — biaya dihitung DI SERVER (anti manipulasi)
 *  - Pembayaran: endpoint webhook ala Midtrans (mode sandbox-sim);
 *    tinggal ganti modul `gateway` dengan midtrans-client saat punya key
 *  - Escrow: dana "ditahan", cair saat pembeli konfirmasi (komisi 3% dicatat)
 *  - Chat: kirim/terima pesan per penjual (balasan penjual disimulasikan)
 *  - Kuliner: direktori resto + menu
 *  - Revenue: buku kas pendapatan platform (biaya aplikasi, komisi, driver)
 *
 * Jalankan:  cd server && npm install && npm start
 * Frontend disajikan otomatis di http://localhost:3000
 */
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');
const { seedProducts, RESTOS } = require('./seed');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lebak-market-dev-secret-ganti-di-produksi';
const IS_DEV = process.env.NODE_ENV !== 'production';

seedProducts(db);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // sajikan index.html dari root repo

/* ================= KONSTANTA BISNIS (satu sumber kebenaran: server) ================= */
const APP_FEE = 1000;
const SELLER_COMMISSION = 0.03;
const DRIVER_COMMISSION = 0.10;
const FREESHIP_EXTRA = 0.04;
const COD_MAX_KM = 25, DRIVER_MAX_KM = 15;
const FREESHIP_CAP = 20000, FREESHIP_MIN = 100000;
const KECAMATAN = ['Rangkasbitung','Cibadak','Warunggunung','Kalanganyar','Cikulur','Cimarga','Maja','Sajira','Cileles','Leuwidamar','Malingping','Bayah'];
const CATS = ['jasa','makanan','elektronik','ikan','fashion','kriya'];

const driverFee = d => d <= 3 ? 10000 : 10000 + Math.ceil(d - 3) * 2500;
const shipCost = p => p.dist === 0 ? 0 : p.dist <= 25 ? 12000 : p.dist <= 100 ? 18000 : 38000;
function shipBreakdown(p, mode){
  if (mode === 'driver') return { base: driverFee(p.dist), seller: 0, subsidy: 0 };
  const base = shipCost(p);
  if (p.freeship) return { base, seller: base, subsidy: 0 };
  const subsidy = p.price >= FREESHIP_MIN ? Math.min(FREESHIP_CAP, base) : 0;
  return { base, seller: 0, subsidy };
}
const GATEWAY_FEES = {
  qris: { name:'QRIS',                 fee: s => Math.round(s * 0.007) },
  va:   { name:'Virtual Account Bank', fee: () => 4000 },
  ewal: { name:'E-Wallet',             fee: s => Math.round(s * 0.015) },
};

/* ================= GATEWAY PEMBAYARAN =================
 * Mode sekarang: "sandbox-sim" — QR/VA dibuat lokal, webhook dipanggil manual.
 * Integrasi Midtrans asli (saat sudah punya Server Key):
 *   const midtrans = require('midtrans-client');
 *   const snap = new midtrans.Snap({ isProduction:false, serverKey:process.env.MIDTRANS_SERVER_KEY });
 *   const tx = await snap.createTransaction({ transaction_details:{ order_id, gross_amount } });
 *   → kirim tx.token/redirect_url ke frontend; webhook Midtrans menembak /api/payments/webhook.
 */
const gateway = {
  create(order){
    return {
      va: '8808' + String(Math.floor(1e11 + Math.random() * 9e11)),
      qr_string: 'LEBAKMARKET|' + order.id + '|' + order.total,
      expires_at: Date.now() + 24 * 3600e3,
    };
  },
  verifySignature(req){
    // Midtrans asli: cek sha512(order_id+status_code+gross_amount+ServerKey)
    return IS_DEV || req.body.signature === process.env.WEBHOOK_SECRET;
  },
};

/* ================= HELPER ================= */
const now = () => Date.now();
const uid = () => 'INV-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
const bad = (res, code, msg) => res.status(code).json({ error: msg });

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
const BAD_DOMAINS = { 'gmail.con':'gmail.com','gmail.co':'gmail.com','gmial.com':'gmail.com','gnail.com':'gmail.com','gmai.com':'gmail.com','yahho.com':'yahoo.com','yaho.com':'yahoo.com','hotmial.com':'hotmail.com' };
const DISPOSABLE = ['mailinator.com','tempmail.com','temp-mail.org','guerrillamail.com','10minutemail.com','yopmail.com','sharklasers.com','trashmail.com'];
function emailProblem(email){
  if (!EMAIL_RE.test(email)) return 'Format email belum benar (cth: nama@gmail.com)';
  const domain = email.split('@')[1];
  if (BAD_DOMAINS[domain]) return `Mungkin maksudmu @${BAD_DOMAINS[domain]}? Cek lagi ya`;
  if (DISPOSABLE.includes(domain)) return 'Email sekali-pakai tidak diizinkan — pakai email aktifmu';
  return null;
}

function sendOtpEmail(email, code){
  // Produksi: kirim via nodemailer/Resend/Mailgun. Demo: log ke konsol server.
  console.log(`[email→${email}] Kode verifikasi Lebak.market: ${code}`);
}

function auth(req, res, next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return bad(res, 401, 'Perlu login dulu');
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = db.prepare('SELECT id, name, email, phone, kec FROM users WHERE id = ?').get(data.uid);
    if (!req.user) return bad(res, 401, 'Akun tidak ditemukan');
    next();
  } catch { return bad(res, 401, 'Sesi kedaluwarsa — login lagi ya'); }
}

function addEvent(orderId, status, note){
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
  db.prepare('INSERT INTO order_events (order_id, status, note, at) VALUES (?,?,?,?)').run(orderId, status, note, now());
}
function addRevenue(orderId, kind, amount){
  if (amount > 0) db.prepare('INSERT INTO revenue (order_id, kind, amount, at) VALUES (?,?,?,?)').run(orderId, kind, amount, now());
}

/* ================= CONFIG ================= */
app.get('/api/config', (req, res) => {
  res.json({
    kecamatan: KECAMATAN, cats: CATS,
    fees: { appFee: APP_FEE, sellerCommission: SELLER_COMMISSION, driverCommission: DRIVER_COMMISSION, freeshipExtra: FREESHIP_EXTRA },
    limits: { codMaxKm: COD_MAX_KM, driverMaxKm: DRIVER_MAX_KM, freeshipCap: FREESHIP_CAP, freeshipMin: FREESHIP_MIN },
  });
});

/* ================= AUTH ================= */
app.post('/api/auth/register', async (req, res) => {
  const { name = '', email = '', phone = '', kec = '', password = '' } = req.body;
  const em = String(email).trim().toLowerCase();
  if (!name.trim() || name.trim().length < 3) return bad(res, 400, 'Nama minimal 3 huruf');
  const ep = emailProblem(em);
  if (ep) return bad(res, 400, ep);
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(em)) return bad(res, 409, 'Email sudah terdaftar — coba masuk saja');
  if (!/^08\d{8,12}$/.test(phone)) return bad(res, 400, 'No. HP format 08xxxxxxxxxx');
  if (!KECAMATAN.includes(kec)) return bad(res, 400, 'Pilih kecamatan di Lebak');
  if (String(password).length < 6) return bad(res, 400, 'Password minimal 6 karakter');

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const pass_hash = await bcrypt.hash(password, 10);
  const payload = JSON.stringify({ name: name.trim(), phone, kec, pass_hash });
  db.prepare('INSERT OR REPLACE INTO otps (email, code, payload, expires_at, attempts) VALUES (?,?,?,?,0)')
    .run(em, code, payload, now() + 10 * 60e3);
  sendOtpEmail(em, code);
  res.json({ ok: true, message: 'Kode verifikasi dikirim ke ' + em, ...(IS_DEV ? { devCode: code } : {}) });
});

app.post('/api/auth/resend', (req, res) => {
  const em = String(req.body.email || '').trim().toLowerCase();
  const row = db.prepare('SELECT * FROM otps WHERE email = ?').get(em);
  if (!row) return bad(res, 404, 'Tidak ada pendaftaran menunggu untuk email ini');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare('UPDATE otps SET code = ?, expires_at = ?, attempts = 0 WHERE email = ?').run(code, now() + 10 * 60e3, em);
  sendOtpEmail(em, code);
  res.json({ ok: true, message: 'Kode baru dikirim', ...(IS_DEV ? { devCode: code } : {}) });
});

app.post('/api/auth/verify', (req, res) => {
  const em = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const row = db.prepare('SELECT * FROM otps WHERE email = ?').get(em);
  if (!row) return bad(res, 404, 'Tidak ada pendaftaran menunggu — daftar dulu ya');
  if (row.expires_at < now()) return bad(res, 410, 'Kode kedaluwarsa — kirim ulang ya');
  if (row.attempts >= 5) return bad(res, 429, 'Terlalu banyak percobaan — kirim ulang kode');
  if (row.code !== code) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ?').run(em);
    return bad(res, 400, 'Kode salah — cek lagi ya');
  }
  const p = JSON.parse(row.payload);
  const r = db.prepare('INSERT INTO users (name, email, phone, kec, pass_hash, verified, created_at) VALUES (?,?,?,?,?,1,?)')
    .run(p.name, em, p.phone, p.kec, p.pass_hash, now());
  db.prepare('DELETE FROM otps WHERE email = ?').run(em);
  const token = jwt.sign({ uid: Number(r.lastInsertRowid) }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token, user: { id: Number(r.lastInsertRowid), name: p.name, email: em, phone: p.phone, kec: p.kec } });
});

app.post('/api/auth/login', async (req, res) => {
  const em = String(req.body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (!u) return bad(res, 404, 'Email belum terdaftar — daftar dulu yuk');
  const ok = await bcrypt.compare(String(req.body.password || ''), u.pass_hash);
  if (!ok) return bad(res, 401, 'Password salah');
  const token = jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token, user: { id: u.id, name: u.name, email: u.email, phone: u.phone, kec: u.kec } });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

/* ================= PRODUK ================= */
app.get('/api/products', (req, res) => {
  const { cat, radius, q } = req.query;
  let rows = db.prepare('SELECT * FROM products ORDER BY lebak DESC, dist ASC, created_at DESC').all();
  if (cat && cat !== 'all') rows = rows.filter(p => p.cat === cat);
  const r = parseFloat(radius);
  if (!isNaN(r)) rows = rows.filter(p => p.dist <= r);
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter(p => p.name.toLowerCase().includes(s) || p.seller_name.toLowerCase().includes(s) || p.cat.includes(s));
  }
  res.json({ products: rows });
});

app.post('/api/products', auth, (req, res) => {
  const { name = '', cat, cond = 'baru', price, stock, emoji = '📦', descr = '', cod = true, freeship = false } = req.body;
  if (!name.trim()) return bad(res, 400, 'Nama produk wajib diisi');
  if (!CATS.includes(cat)) return bad(res, 400, 'Kategori tidak dikenal');
  const pr = parseInt(price, 10), st = parseInt(stock, 10);
  if (!pr || pr < 1000) return bad(res, 400, 'Harga minimal Rp1.000');
  if (!st || st < 1) return bad(res, 400, 'Stok minimal 1');
  const g = 'g-' + (1 + Math.floor(Math.random() * 6));
  const r = db.prepare(`INSERT INTO products
    (seller_id, seller_name, ava, ac, verified, cat, name, price, stock, cond, loc, dist, cod, freeship, lebak, emoji, g, likes, descr, created_at)
    VALUES (?,?,?,?,0,?,?,?,?,?,?,0.5,?,?,1,?,?,0,?,?)`)
    .run(req.user.id, req.user.name, '🙋', '#fff3c4', cat, name.trim(), pr, st,
         cond === 'bekas' ? 'bekas' : 'baru', req.user.kec + ', Lebak',
         cod ? 1 : 0, freeship ? 1 : 0, String(emoji).slice(0, 4) || '📦', g, String(descr).trim() || 'Tanpa deskripsi.', now());
  res.json({ ok: true, product: db.prepare('SELECT * FROM products WHERE id = ?').get(Number(r.lastInsertRowid)) });
});

/* ================= ORDER ================= */
app.post('/api/orders', auth, (req, res) => {
  const { productId, mode, payMethod, recvName, recvAddr, meetPoint, meetTime } = req.body;
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(productId, 10));
  if (!p) return bad(res, 404, 'Produk tidak ditemukan');
  if (p.stock < 1) return bad(res, 409, 'Stok habis');
  const isJasa = p.dist === 0;

  if (mode === 'cod') {
    if (!p.cod || isJasa || p.dist > COD_MAX_KM) return bad(res, 400, 'COD tidak tersedia untuk produk ini');
    if (!meetPoint || !meetTime) return bad(res, 400, 'Isi titik temu & waktu janjian');
    const id = uid();
    db.prepare(`INSERT INTO orders (id, buyer_id, product_id, mode, method, price, ship, app_fee, gateway_fee, total, status, meet_point, meet_time, created_at)
      VALUES (?,?,?,?,?,?,0,0,0,?,?,?,?,?)`)
      .run(id, req.user.id, p.id, 'cod', 'Bayar di tempat', p.price, p.price, 'Janjian COD', meetPoint, meetTime, now());
    addEvent(id, 'Janjian COD', `${meetPoint} · ${meetTime}. Atur detail lewat chat. Bayar HANYA setelah cek barang!`);
    db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(p.id);
    return res.json({ ok: true, order: getOrder(id, req.user.id) });
  }

  if (!['rekber', 'driver'].includes(mode)) return bad(res, 400, 'Mode transaksi tidak dikenal');
  if (mode === 'driver' && (isJasa || p.dist > DRIVER_MAX_KM)) return bad(res, 400, 'Driver hanya untuk penjual ≤ ' + DRIVER_MAX_KM + ' km');
  const gw = GATEWAY_FEES[payMethod];
  if (!gw) return bad(res, 400, 'Metode pembayaran tidak dikenal');
  if (!recvName || !recvAddr) return bad(res, 400, 'Isi nama & alamat/kontak penerima');

  const bd = isJasa ? { base: 0, seller: 0, subsidy: 0 } : shipBreakdown(p, mode);
  const ship = Math.max(0, bd.base - bd.seller - bd.subsidy);
  const gatewayFee = gw.fee(p.price + ship + APP_FEE);
  const total = p.price + ship + APP_FEE + gatewayFee;

  const id = uid();
  const pay = gateway.create({ id, total });
  db.prepare(`INSERT INTO orders (id, buyer_id, product_id, mode, method, method_id, price, ship, app_fee, gateway_fee, total, status, recv_name, recv_addr, va, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, p.id, mode, gw.name, payMethod, p.price, ship, APP_FEE, gatewayFee, total,
         'Menunggu Pembayaran', recvName, recvAddr, pay.va, now());
  addEvent(id, 'Menunggu Pembayaran', 'Invoice rekber diterbitkan — bayar sebelum 24 jam');
  res.json({ ok: true, order: getOrder(id, req.user.id), payment: pay,
    breakdown: { price: p.price, shipBase: bd.base, sellerCovers: bd.seller, subsidy: bd.subsidy, appFee: APP_FEE, gatewayFee, total } });
});

function getOrder(id, buyerId){
  const o = db.prepare(`SELECT o.*, p.name pname, p.emoji, p.g, p.seller_name, p.cond, p.dist
    FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = ?`).get(id);
  if (!o || (buyerId && o.buyer_id !== buyerId)) return null;
  o.events = db.prepare('SELECT status, note, at FROM order_events WHERE order_id = ? ORDER BY at').all(id);
  return o;
}

app.get('/api/orders', auth, (req, res) => {
  const ids = db.prepare('SELECT id FROM orders WHERE buyer_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ orders: ids.map(x => getOrder(x.id, req.user.id)) });
});

/* --- WEBHOOK PEMBAYARAN (ditembak gateway; di demo: tombol simulasi frontend) --- */
app.post('/api/payments/webhook', (req, res) => {
  if (!gateway.verifySignature(req)) return bad(res, 403, 'Signature tidak valid');
  const { order_id, transaction_status = 'settlement' } = req.body;
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!o) return bad(res, 404, 'Order tidak ditemukan');
  if (o.status !== 'Menunggu Pembayaran') return res.json({ ok: true, note: 'sudah diproses' });
  if (transaction_status !== 'settlement') return res.json({ ok: true, note: 'status diabaikan: ' + transaction_status });

  db.prepare('UPDATE products SET stock = MAX(0, stock - 1) WHERE id = ?').run(o.product_id);
  addEvent(o.id, 'Dana Ditahan (Rekber)', 'Webhook gateway diterima — dana aman di rekening bersama, penjual dinotifikasi otomatis 🔔');
  addRevenue(o.id, 'app_fee', o.app_fee);

  // Simulasi perjalanan pesanan (produksi: aksi penjual/kurir yang menggerakkan status)
  const p = db.prepare('SELECT dist FROM products WHERE id = ?').get(o.product_id);
  const isJasa = p.dist === 0;
  if (o.mode === 'driver') {
    setTimeout(() => addEvent(o.id, 'Driver Menjemput', 'Driver Lebak menuju lokasi penjual untuk ambil barang 🛵'), 5000);
    setTimeout(() => addEvent(o.id, 'Diantar Driver', 'Barang di tangan driver, menuju alamatmu — live tracking'), 11000);
    setTimeout(() => addEvent(o.id, 'Tiba — Cek Barang', 'Barang sampai! Cek kondisi & kelengkapan, lalu konfirmasi agar dana cair'), 17000);
  } else if (isJasa) {
    setTimeout(() => addEvent(o.id, 'Dikerjakan', 'Penjual mulai mengerjakan pesananmu 🎨'), 5000);
    setTimeout(() => addEvent(o.id, 'Tiba — Cek Barang', 'Hasil kerja dikirim! Review, minta revisi bila perlu, lalu konfirmasi'), 13000);
  } else {
    setTimeout(() => addEvent(o.id, 'Dikirim', 'Penjual menyerahkan paket ke ekspedisi — resi otomatis terbit 📦'), 5000);
    setTimeout(() => addEvent(o.id, 'Tiba — Cek Barang', 'Paket sampai! Cek kondisi & kelengkapan, lalu konfirmasi agar dana cair'), 14000);
  }
  res.json({ ok: true });
});

/* --- Konfirmasi pembeli → dana cair (escrow release) --- */
app.post('/api/orders/:id/confirm', auth, (req, res) => {
  const o = getOrder(req.params.id, req.user.id);
  if (!o) return bad(res, 404, 'Order tidak ditemukan');
  if (o.mode === 'cod') {
    if (o.status !== 'Janjian COD') return bad(res, 409, 'Status tidak bisa dikonfirmasi');
    addEvent(o.id, 'Selesai', 'Ketemuan sukses — barang oke, bayar di tempat. Win-win! 🎉');
    return res.json({ ok: true, order: getOrder(o.id, req.user.id) });
  }
  if (o.status !== 'Tiba — Cek Barang') return bad(res, 409, 'Barang belum tiba / sudah selesai');
  const commission = Math.round(o.price * SELLER_COMMISSION);
  const extra = db.prepare('SELECT freeship FROM products WHERE id = ?').get(o.product_id).freeship
    ? Math.round(o.price * FREESHIP_EXTRA) : 0;
  const driverCut = o.mode === 'driver' ? Math.round(o.ship * DRIVER_COMMISSION) : 0;
  const net = o.price - commission - extra;
  addRevenue(o.id, 'commission', commission);
  addRevenue(o.id, 'freeship_extra', extra);
  addRevenue(o.id, 'driver_cut', driverCut);
  addEvent(o.id, 'Selesai — Dana Cair',
    `Kamu konfirmasi sesuai → dana otomatis diteruskan ke penjual: Rp${net.toLocaleString('id-ID')} (komisi platform 3%${extra ? ' + program gratis ongkir 4%' : ''} dipotong) 💸`);
  res.json({ ok: true, order: getOrder(o.id, req.user.id), payout: { net, commission, extra, driverCut } });
});

app.post('/api/orders/:id/complain', auth, (req, res) => {
  const o = getOrder(req.params.id, req.user.id);
  if (!o) return bad(res, 404, 'Order tidak ditemukan');
  if (o.status !== 'Tiba — Cek Barang') return bad(res, 409, 'Komplain hanya saat barang tiba');
  addEvent(o.id, 'Komplain — Ditinjau', 'Komplain dibuka: dana tetap ditahan, CS menengahi dengan bukti foto/video ⚖️');
  res.json({ ok: true, order: getOrder(o.id, req.user.id) });
});

/* ================= CHAT ================= */
const CHAT_REPLIES = [
  'Halo kak! 👋 Masih ready, silakan langsung diorder ya 😊',
  'Boleh kak, mau COD atau lewat rekber aja biar aman?',
  'Siap kak, barang aman & sesuai deskripsi. Bisa cek dulu pas ketemuan 👌',
  'Nego tipis boleh kak, yang penting sama-sama enak 😄',
  'Kalau lewat driver bisa sampai hari ini juga lho kak 🛵',
];
app.get('/api/chats', auth, (req, res) => {
  const rows = db.prepare(`SELECT peer, MAX(at) last_at,
      SUM(CASE WHEN from_me = 0 AND read = 0 THEN 1 ELSE 0 END) unread
    FROM messages WHERE user_id = ? GROUP BY peer ORDER BY last_at DESC`).all(req.user.id);
  const chats = rows.map(r => ({
    peer: r.peer, unread: r.unread,
    last: db.prepare('SELECT from_me, text, at FROM messages WHERE user_id = ? AND peer = ? ORDER BY at DESC LIMIT 1').get(req.user.id, r.peer),
  }));
  res.json({ chats });
});
app.get('/api/chats/:peer', auth, (req, res) => {
  db.prepare('UPDATE messages SET read = 1 WHERE user_id = ? AND peer = ?').run(req.user.id, req.params.peer);
  const msgs = db.prepare('SELECT from_me, text, at FROM messages WHERE user_id = ? AND peer = ? ORDER BY at').all(req.user.id, req.params.peer);
  res.json({ messages: msgs });
});
app.post('/api/chats/:peer', auth, (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) return bad(res, 400, 'Pesan kosong');
  const peer = req.params.peer;
  db.prepare('INSERT INTO messages (user_id, peer, from_me, text, read, at) VALUES (?,?,1,?,1,?)').run(req.user.id, peer, text, now());
  // Balasan penjual disimulasikan (produksi: pesan diteruskan ke akun penjual via WebSocket)
  const uidCopy = req.user.id;
  setTimeout(() => {
    const reply = CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)];
    db.prepare('INSERT INTO messages (user_id, peer, from_me, text, read, at) VALUES (?,?,0,?,0,?)').run(uidCopy, peer, reply, now());
  }, 1500 + Math.random() * 2000);
  res.json({ ok: true });
});

/* ================= KULINER & REVENUE ================= */
app.get('/api/restos', (req, res) => res.json({ restos: [...RESTOS].sort((a, b) => a.dist - b.dist) }));

app.get('/api/revenue', (req, res) => {
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM revenue').get().t;
  const byKind = db.prepare('SELECT kind, SUM(amount) amount, COUNT(*) n FROM revenue GROUP BY kind').all();
  res.json({ total, byKind });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🌾 Lebak.market API + frontend siap di http://localhost:${PORT}`);
  console.log(`   Mode: ${IS_DEV ? 'DEV (OTP dibalas di respons API)' : 'PRODUKSI'}`);
});
