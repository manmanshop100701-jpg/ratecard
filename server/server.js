/**
 * Lebak.market — Backend API (v2: 100% real & realtime)
 * ---------------------------------------------------------------
 * Node.js + Express + SQLite (node:sqlite, bawaan Node 22+).
 *
 *  - Feed 100% postingan pengguna asli (tanpa seed, tanpa bot)
 *  - Chat NYATA antar akun (pembeli ↔ penjual sungguhan)
 *  - Status pesanan digerakkan aksi penjual asli (tanpa timer palsu)
 *  - REALTIME via Server-Sent Events (/api/events): pesan masuk,
 *    perubahan status pesanan, dan jualan baru terdorong seketika
 *  - Auth OTP email, JWT, bcrypt; semua biaya dihitung server
 *  - Pembayaran: Transfer/QRIS manual (verifikasi admin) + saldo internal
 *
 * Jalankan:  cd server && npm install && npm start
 */
/* Muat server/.env bila ada (KEY=VALUE per baris) — untuk kredensial
   lokal seperti GMAIL_APP_PASSWORD tanpa memasukkannya ke git. */
try {
  require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8')
    .split('\n').forEach(line => {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    });
} catch {}

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lebak-market-dev-secret-ganti-di-produksi';
const IS_DEV = process.env.NODE_ENV !== 'production';

/* ---- Email OTP sungguhan ----
 * Cara termudah (Gmail): set env GMAIL_USER + GMAIL_APP_PASSWORD
 *   (buat App Password di myaccount.google.com/apppasswords — wajib 2FA aktif)
 * Atau SMTP umum (Brevo/Mailgun/dll): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * Selama belum diisi → mode pilot: kode OTP ikut dibalas di respons API
 * agar pendaftaran tetap bisa jalan. */
const SMTP_READY = !!(process.env.GMAIL_USER || process.env.SMTP_HOST || process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
const OTP_IN_RESPONSE = process.env.OTP_IN_RESPONSE ? process.env.OTP_IN_RESPONSE !== '0' : !SMTP_READY;
let mailer = null;
if (SMTP_READY) {
  const nodemailer = require('nodemailer');
  const tuning = { connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 };
  mailer = process.env.GMAIL_USER
    ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }, ...tuning })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587),
        secure: +(process.env.SMTP_PORT || 587) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        ...tuning,
      });
}

/* ---- Penyimpanan foto produk ---- */
const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (fs.existsSync('/data') ? '/data/uploads' : path.join(__dirname, 'uploads')); // ikut volume persisten bila ada
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' })); // foto dikirim sebagai data URL terkompresi
app.use(express.urlencoded({ extended: false })); // callback Duitku berbentuk form-urlencoded
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, '..')));

/* ================= KONSTANTA BISNIS ================= */
const APP_FEE = 1000;
const SELLER_COMMISSION = 0.015; // 1,5% per transaksi sukses
const DRIVER_COMMISSION = 0.10;
const FREESHIP_EXTRA = 0.04;
/* Komisi COD: transaksi COD tidak lewat rekber, jadi komisi penjual
 * dicatat sebagai TAGIHAN (users.cod_debt) dan dipotong otomatis dari
 * pencairan rekber berikutnya — platform tetap dapat bagian. */
const COD_FEE_RATE = 0.015, COD_FEE_MIN = 500;
const codFee = price => Math.max(COD_FEE_MIN, Math.round(price * COD_FEE_RATE));
const COD_MAX_KM = 25, DRIVER_MAX_KM = 15;
const FREESHIP_CAP = 20000, FREESHIP_MIN = 100000;
const KECAMATAN = ['Rangkasbitung','Cibadak','Warunggunung','Kalanganyar','Cikulur','Cimarga','Maja','Sajira','Cileles','Leuwidamar','Malingping','Bayah'];
const CATS = ['jasa','makanan','elektronik','ternak','fashion','kriya'];
const MIN_WITHDRAW = 10000;

/* ---- Lokasi live ----
 * Produk menyimpan koordinat GPS penjual saat posting. Jarak SELALU
 * dihitung ulang dengan Haversine terhadap posisi live si penonton
 * (dikirim frontend dari navigator.geolocation). Bila GPS tidak ada,
 * fallback ke titik pusat kecamatan domisili (koordinat asli, bukan acak). */
const KEC_COORDS = {
  Rangkasbitung: { lat:-6.3592, lng:106.2494 },
  Cibadak:       { lat:-6.3942, lng:106.2318 },
  Warunggunung:  { lat:-6.4032, lng:106.1795 },
  Kalanganyar:   { lat:-6.3628, lng:106.2856 },
  Cikulur:       { lat:-6.4400, lng:106.1682 },
  Cimarga:       { lat:-6.4270, lng:106.2725 },
  Maja:          { lat:-6.3320, lng:106.3960 },
  Sajira:        { lat:-6.4447, lng:106.3768 },
  Cileles:       { lat:-6.5310, lng:106.1230 },
  Leuwidamar:    { lat:-6.5406, lng:106.2565 },
  Malingping:    { lat:-6.7644, lng:106.0128 },
  Bayah:         { lat:-6.9236, lng:106.2743 },
};
function havKm(a, b){
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// koordinat valid dalam kotak Indonesia; selain itu dianggap tidak ada
function parseCoords(lat, lng){
  const la = parseFloat(lat), ln = parseFloat(lng);
  if (isNaN(la) || isNaN(ln) || la < -11 || la > 6 || ln < 95 || ln > 141) return null;
  return { lat: la, lng: ln };
}
const prodCoords = p => (p.lat != null && p.lng != null)
  ? { lat: p.lat, lng: p.lng }
  : (KEC_COORDS[p.seller_kec] || KEC_COORDS.Rangkasbitung);

const driverFee = d => d <= 3 ? 10000 : 10000 + Math.ceil(d - 3) * 2500;
const shipCost = p => p.dist === 0 ? 0 : p.dist <= 25 ? 12000 : p.dist <= 100 ? 18000 : 38000;
function shipBreakdown(p, mode){
  if (mode === 'driver') return { base: driverFee(p.dist), seller: 0, subsidy: 0 };
  // ongkir tetap dari penjual (wajib utk peternakan — hewan hidup butuh
  // penanganan khusus) menimpa tarif ekspedisi standar
  const base = p.ship_cost != null ? p.ship_cost : shipCost(p);
  if (p.freeship) return { base, seller: base, subsidy: 0 };
  const subsidy = p.price >= FREESHIP_MIN ? Math.min(FREESHIP_CAP, base) : 0;
  return { base, seller: 0, subsidy };
}
/* Pembayaran: FULL MANUAL (Transfer/QRIS milik toko + verifikasi admin)
 * dan Saldo internal. Integrasi gateway (Duitku/Midtrans) telah dihapus
 * — lihat riwayat git bila suatu saat ingin dipasang kembali. */

/* ================= REALTIME (Server-Sent Events) ================= */
const sseClients = new Map(); // userId -> Set<res>
function ssePush(userId, event, data){
  const set = sseClients.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(payload); } catch {} }
}
function sseBroadcast(event, data, exceptUserId){
  for (const [uid] of sseClients) if (uid !== exceptUserId) ssePush(uid, event, data);
}
app.get('/api/events', (req, res) => {
  let uid;
  try { uid = jwt.verify(String(req.query.token || ''), JWT_SECRET).uid; }
  catch { return res.status(401).end(); }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: hello\ndata: {}\n\n');
  if (!sseClients.has(uid)) sseClients.set(uid, new Set());
  sseClients.get(uid).add(res);
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
  req.on('close', () => {
    clearInterval(hb);
    const set = sseClients.get(uid);
    if (set) { set.delete(res); if (!set.size) sseClients.delete(uid); }
  });
});

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
const otpHtml = code => `
  <div style="font-family:sans-serif;max-width:440px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
    <h2 style="color:#2b2440;margin:0 0 4px">Lebak.market</h2>
    <p style="color:#6f6787;margin:0 0 20px">Marketplace warga Kabupaten Lebak</p>
    <p>Masukkan kode berikut untuk memverifikasi emailmu:</p>
    <p style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;background:#fff9f2;border-radius:10px;padding:16px;color:#2b2440">${code}</p>
    <p style="color:#6f6787;font-size:13px">Kode berlaku 10 menit. Abaikan email ini jika kamu tidak mendaftar.</p>
  </div>`;

async function sendOtpEmail(email, code){
  const subject = `${code} — Kode Verifikasi Lebak.market`;
  try {
    /* Jalur 1: Brevo lewat HTTPS — tidak terpengaruh pemblokiran SMTP
       (Railway trial dkk.). Butuh BREVO_API_KEY + MAIL_SENDER (email
       yang sudah diverifikasi sebagai pengirim di dashboard Brevo). */
    if (process.env.BREVO_API_KEY){
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Lebak.market', email: process.env.MAIL_SENDER || process.env.GMAIL_USER },
          to: [{ email }], subject, htmlContent: otpHtml(code),
        }),
      });
      if (!r.ok) throw new Error('Brevo ' + r.status + ': ' + (await r.text()).slice(0, 200));
      console.log(`[email→${email}] OTP terkirim via Brevo (HTTPS)`);
      return;
    }
    /* Jalur 2: Resend lewat HTTPS (butuh domain terverifikasi). */
    if (process.env.RESEND_API_KEY){
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.MAIL_SENDER || 'Lebak.market <onboarding@resend.dev>',
          to: [email], subject, html: otpHtml(code),
        }),
      });
      if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
      console.log(`[email→${email}] OTP terkirim via Resend (HTTPS)`);
      return;
    }
    /* Jalur 3: SMTP (Gmail App Password / SMTP umum). */
    if (mailer){
      await mailer.sendMail({
        from: process.env.MAIL_FROM || `"Lebak.market" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`,
        to: email, subject, html: otpHtml(code),
      });
      console.log(`[email→${email}] OTP terkirim via ${process.env.GMAIL_USER ? 'Gmail' : 'SMTP'}`);
      return;
    }
    console.log(`[email→${email}] Kode verifikasi Lebak.market: ${code} (mode pilot — email belum dikonfigurasi)`);
  } catch (e) {
    // Penyelamat: catat kodenya di log server agar admin bisa membantu
    // pendaftar yang emailnya tidak sampai (mis. SMTP diblokir jaringan).
    console.error(`[email→${email}] GAGAL kirim OTP (${e.message}) — kode: ${code}`);
  }
}

/* ---- Simpan foto produk (data URL → file di UPLOAD_DIR) ---- */
function saveImage(dataUrl){
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || buf.length > 5 * 1024 * 1024) return null;
  const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
  const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}
function auth(req, res, next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return bad(res, 401, 'Perlu login dulu');
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = db.prepare('SELECT id, name, email, phone, kec, verified, cod_debt, balance, avatar FROM users WHERE id = ?').get(data.uid);
    if (!req.user) return bad(res, 401, 'Akun tidak ditemukan');
    next();
  } catch { return bad(res, 401, 'Sesi berakhir — silakan login kembali'); }
}
function optionalAuth(req, _res, next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) { try { req.userId = jwt.verify(token, JWT_SECRET).uid; } catch {} }
  next();
}
function addEvent(orderId, status, note, notify = true){
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
  db.prepare('INSERT INTO order_events (order_id, status, note, at) VALUES (?,?,?,?)').run(orderId, status, note, now());
  if (notify){
    const o = db.prepare('SELECT buyer_id, seller_id, id FROM orders WHERE id = ?').get(orderId);
    if (o){
      ssePush(o.buyer_id, 'order', { orderId, status, note });
      ssePush(o.seller_id, 'order', { orderId, status, note });
    }
  }
}
function addRevenue(orderId, kind, amount){
  if (amount > 0) db.prepare('INSERT INTO revenue (order_id, kind, amount, at) VALUES (?,?,?,?)').run(orderId, kind, amount, now());
}
const getSetting = k => db.prepare('SELECT v FROM settings WHERE k = ?').get(k)?.v || null;
const setSetting = (k, v) => db.prepare('INSERT INTO settings (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
const adminOk = req => process.env.ADMIN_KEY && (req.query.key === process.env.ADMIN_KEY || req.body?.key === process.env.ADMIN_KEY);
/* tandai order sebagai LUNAS → dana ditahan rekber (dipakai verifikasi admin) */
function markPaid(o){
  db.prepare('UPDATE products SET stock = MAX(0, stock - 1) WHERE id = ?').run(o.product_id);
  addEvent(o.id, 'Dana Ditahan (Rekber)', 'Pembayaran terverifikasi — dana ditahan rekber. Menunggu penjual memproses.');
  addRevenue(o.id, 'app_fee', o.app_fee);
}
/* ---- SALDO pengguna (wallet internal) ----
 * Dana escrow yang cair masuk ke saldo penjual; saldo bisa ditarik
 * (diproses admin) atau dipakai belanja lagi. */
function walletTxn(userId, kind, amount, note, orderId = null){
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
  db.prepare('INSERT INTO wallet_txns (user_id, kind, amount, note, order_id, at) VALUES (?,?,?,?,?,?)')
    .run(userId, kind, amount, note, orderId, now());
}

/* ================= CONFIG ================= */
app.get('/api/config', (req, res) => {
  res.json({
    // indikator penyimpanan: "persisten" = volume /data terpasang, data awet
    storage: (process.env.DB_PATH || '').startsWith('/data') || fs.existsSync('/data') ? 'persisten ✓' : 'EPHEMERAL — data hilang tiap deploy! Pasang Volume /data di Railway',
    kecamatan: KECAMATAN, cats: CATS, kecCoords: KEC_COORDS,
    fees: { appFee: APP_FEE, sellerCommission: SELLER_COMMISSION, driverCommission: DRIVER_COMMISSION, freeshipExtra: FREESHIP_EXTRA, codFeeRate: COD_FEE_RATE, codFeeMin: COD_FEE_MIN },
    limits: { codMaxKm: COD_MAX_KM, driverMaxKm: DRIVER_MAX_KM, freeshipCap: FREESHIP_CAP, freeshipMin: FREESHIP_MIN },
  });
});

/* ================= AUTH =================
 * Akun DIBUAT LANGSUNG saat daftar (verified=0) sehingga login dengan
 * email+password selalu bisa, bahkan bila email OTP tidak sampai.
 * Verifikasi email hanya menaikkan status verified — bukan syarat login. */
const signToken = uid => jwt.sign({ uid }, JWT_SECRET, { expiresIn: '30d' });
const userPayload = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, kec: u.kec, verified: u.verified ? 1 : 0, cod_debt: u.cod_debt || 0, balance: u.balance || 0, avatar: u.avatar || null });

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
  const r = db.prepare('INSERT INTO users (name, email, phone, kec, pass_hash, verified, created_at) VALUES (?,?,?,?,?,0,?)')
    .run(name.trim(), em, phone, kec, pass_hash, now());
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT OR REPLACE INTO otps (email, code, payload, expires_at, attempts) VALUES (?,?,?,?,0)')
    .run(em, code, JSON.stringify({ name: name.trim(), phone, kec, pass_hash }), now() + 10 * 60e3);
  sendOtpEmail(em, code);
  res.json({
    ok: true, token: signToken(id),
    user: { id, name: name.trim(), email: em, phone, kec, verified: 0 },
    message: 'Kode verifikasi dikirim ke ' + em,
    ...(OTP_IN_RESPONSE ? { devCode: code } : {}),
  });
});

app.post('/api/auth/resend', (req, res) => {
  const em = String(req.body.email || '').trim().toLowerCase();
  const row = db.prepare('SELECT * FROM otps WHERE email = ?').get(em);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  if (row) {
    db.prepare('UPDATE otps SET code = ?, expires_at = ?, attempts = 0 WHERE email = ?').run(code, now() + 10 * 60e3, em);
  } else {
    // akun sudah ada tapi belum verifikasi (mis. tadinya melewati OTP)
    const u = db.prepare('SELECT id, verified FROM users WHERE email = ?').get(em);
    if (!u) return bad(res, 404, 'Tidak ada pendaftaran menunggu untuk email ini');
    if (u.verified) return bad(res, 400, 'Email ini sudah terverifikasi');
    db.prepare('INSERT OR REPLACE INTO otps (email, code, payload, expires_at, attempts) VALUES (?,?,?,?,0)')
      .run(em, code, '{}', now() + 10 * 60e3);
  }
  sendOtpEmail(em, code);
  res.json({ ok: true, message: 'Kode baru dikirim', ...(OTP_IN_RESPONSE ? { devCode: code } : {}) });
});

app.post('/api/auth/verify', (req, res) => {
  const em = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const row = db.prepare('SELECT * FROM otps WHERE email = ?').get(em);
  if (!row) return bad(res, 404, 'Tidak ada pendaftaran menunggu');
  if (row.expires_at < now()) return bad(res, 410, 'Kode kedaluwarsa — kirim ulang');
  if (row.attempts >= 5) return bad(res, 429, 'Terlalu banyak percobaan — kirim ulang kode');
  if (row.code !== code) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ?').run(em);
    return bad(res, 400, 'Kode verifikasi salah');
  }
  const p = JSON.parse(row.payload);
  let u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (u) {
    db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(u.id);
    u.verified = 1;
  } else {
    // akun dari alur lama (register sebelum perbaikan) — buat sekarang
    const r = db.prepare('INSERT INTO users (name, email, phone, kec, pass_hash, verified, created_at) VALUES (?,?,?,?,?,1,?)')
      .run(p.name, em, p.phone, p.kec, p.pass_hash, now());
    u = { id: Number(r.lastInsertRowid), name: p.name, email: em, phone: p.phone, kec: p.kec, verified: 1 };
  }
  db.prepare('DELETE FROM otps WHERE email = ?').run(em);
  res.json({ ok: true, token: signToken(u.id), user: userPayload(u) });
});

app.post('/api/auth/login', async (req, res) => {
  const em = String(req.body.email || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  let u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (!u) {
    // Penyelamat: pendaftar alur lama yang OTP-nya tak pernah sampai —
    // datanya masih tersimpan di tabel otps. Password cocok = akun dibuat.
    const row = db.prepare('SELECT * FROM otps WHERE email = ?').get(em);
    if (row) {
      const p = JSON.parse(row.payload);
      if (p.pass_hash && await bcrypt.compare(pw, p.pass_hash)) {
        const r = db.prepare('INSERT INTO users (name, email, phone, kec, pass_hash, verified, created_at) VALUES (?,?,?,?,?,0,?)')
          .run(p.name, em, p.phone, p.kec, p.pass_hash, now());
        db.prepare('DELETE FROM otps WHERE email = ?').run(em);
        u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
      }
    }
    if (!u) return bad(res, 404, 'Email belum terdaftar');
  } else if (!await bcrypt.compare(pw, u.pass_hash)) {
    return bad(res, 401, 'Password salah');
  }
  res.json({ ok: true, token: signToken(u.id), user: userPayload(u) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

/* Foto profil: kirim {img: dataURL} untuk pasang, {img: null} untuk hapus */
app.post('/api/me/avatar', auth, (req, res) => {
  if (req.body.img === null){
    db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
    return res.json({ ok: true, avatar: null });
  }
  const img = saveImage(req.body.img);
  if (!img) return bad(res, 400, 'Foto tidak valid (maks 5MB, JPG/PNG/WebP)');
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(img, req.user.id);
  res.json({ ok: true, avatar: img });
});

/* ================= PRODUK (100% postingan pengguna asli) ================= */
const PRODUCT_SELECT = `
  SELECT p.*, u.name seller_name, u.kec seller_kec, u.avatar seller_avatar,
    (SELECT COUNT(*) FROM likes l WHERE l.product_id = p.id) likes
  FROM products p JOIN users u ON u.id = p.seller_id`;

app.get('/api/products', optionalAuth, (req, res) => {
  const { cat, radius, q } = req.query;
  // posisi penonton: GPS live dari frontend > pusat kecamatan akunnya > Rangkasbitung
  let viewer = parseCoords(req.query.lat, req.query.lng);
  if (!viewer && req.userId) {
    const me = db.prepare('SELECT kec FROM users WHERE id = ?').get(req.userId);
    viewer = me ? KEC_COORDS[me.kec] : null;
  }
  viewer = viewer || KEC_COORDS.Rangkasbitung;
  let rows = db.prepare(PRODUCT_SELECT).all();
  rows.forEach(p => {
    const c = prodCoords(p);
    p.lat = c.lat; p.lng = c.lng;
    // min 0.01 km — dist 0 punya arti khusus "jasa online" di alur order
    p.dist = Math.max(0.01, +havKm(viewer, c).toFixed(2));
  });
  rows.sort((a, b) => b.lebak - a.lebak || a.dist - b.dist || b.created_at - a.created_at);
  if (cat && cat !== 'all') rows = rows.filter(p => p.cat === cat);
  const r = parseFloat(radius);
  if (!isNaN(r)) rows = rows.filter(p => p.dist <= r);
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter(p => p.name.toLowerCase().includes(s) || p.seller_name.toLowerCase().includes(s) || p.cat.includes(s));
  }
  if (req.userId) {
    const mine = new Set(db.prepare('SELECT product_id FROM likes WHERE user_id = ?').all(req.userId).map(x => x.product_id));
    rows.forEach(p => { p.liked = mine.has(p.id) ? 1 : 0; });
  }
  res.json({ products: rows });
});

app.post('/api/products', auth, (req, res) => {
  const { name = '', cat, cond = 'baru', price, stock, descr = '', cod = true, freeship = false, img, shipCost: shipCostRaw } = req.body;
  if (!name.trim()) return bad(res, 400, 'Nama produk wajib diisi');
  if (!CATS.includes(cat)) return bad(res, 400, 'Kategori tidak dikenal');
  const pr = parseInt(price, 10), st = parseInt(stock, 10);
  if (!pr || pr < 1000) return bad(res, 400, 'Harga minimal Rp1.000');
  if (!st || st < 1) return bad(res, 400, 'Stok minimal 1');
  // ongkir tetap dari penjual — wajib untuk kategori peternakan
  let shipCostVal = null;
  if (cat !== 'jasa' && shipCostRaw !== undefined && shipCostRaw !== null && shipCostRaw !== ''){
    shipCostVal = parseInt(shipCostRaw, 10);
    if (isNaN(shipCostVal) || shipCostVal < 0 || shipCostVal > 10_000_000) return bad(res, 400, 'Ongkir dari penjual tidak valid');
  }
  if (cat === 'ternak' && shipCostVal === null) return bad(res, 400, 'Kategori Peternakan wajib mengisi ongkir dari penjual (kirim hewan hidup)');
  // galeri: terima array imgs (maks 5) atau img tunggal (kompatibilitas lama)
  const imgsIn = Array.isArray(req.body.imgs) ? req.body.imgs.slice(0, 5) : (img ? [img] : []);
  const imgPaths = [];
  for (const d of imgsIn){
    const saved = saveImage(d);
    if (!saved) return bad(res, 400, 'Foto tidak valid (maks 5MB per foto, JPG/PNG/WebP)');
    imgPaths.push(saved);
  }
  const imgPath = imgPaths[0] || null;
  const g = 'g-' + (1 + Math.floor(Math.random() * 6));
  // posisi GPS live penjual saat posting; tanpa izin GPS → pusat kecamatan domisili
  const pos = parseCoords(req.body.lat, req.body.lng) || KEC_COORDS[req.user.kec] || KEC_COORDS.Rangkasbitung;
  const r = db.prepare(`INSERT INTO products
    (seller_id, cat, name, price, stock, cond, loc, dist, lat, lng, cod, freeship, lebak, emoji, g, img, imgs, descr, ship_cost, created_at)
    VALUES (?,?,?,?,?,?,?,0.5,?,?,?,?,1,'',?,?,?,?,?,?)`)
    .run(req.user.id, cat, name.trim(), pr, st, cond === 'bekas' ? 'bekas' : 'baru',
         req.user.kec + ', Lebak', pos.lat, pos.lng, cod ? 1 : 0, freeship ? 1 : 0,
         g, imgPath, imgPaths.length ? JSON.stringify(imgPaths) : null,
         String(descr).trim() || 'Tanpa deskripsi.', shipCostVal, now());
  const prod = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(Number(r.lastInsertRowid));
  sseBroadcast('product', { id: prod.id, name: prod.name, seller: prod.seller_name }, req.user.id);
  res.json({ ok: true, product: prod });
});

app.post('/api/products/:id/like', auth, (req, res) => {
  const pid = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT id FROM products WHERE id = ?').get(pid)) return bad(res, 404, 'Produk tidak ditemukan');
  const has = db.prepare('SELECT 1 x FROM likes WHERE user_id = ? AND product_id = ?').get(req.user.id, pid);
  if (has) db.prepare('DELETE FROM likes WHERE user_id = ? AND product_id = ?').run(req.user.id, pid);
  else db.prepare('INSERT INTO likes (user_id, product_id, at) VALUES (?,?,?)').run(req.user.id, pid, now());
  const likes = db.prepare('SELECT COUNT(*) c FROM likes WHERE product_id = ?').get(pid).c;
  res.json({ ok: true, liked: !has, likes });
});

/* ================= ORDER ================= */
app.post('/api/orders', auth, async (req, res) => {
  const { productId, mode, payMethod, recvName, recvAddr, meetPoint, meetTime } = req.body;
  const p = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(parseInt(productId, 10));
  if (!p) return bad(res, 404, 'Produk tidak ditemukan');
  if (p.seller_id === req.user.id) return bad(res, 400, 'Tidak bisa membeli produk sendiri');
  if (p.stock < 1) return bad(res, 409, 'Stok habis');
  // jasa = pengerjaan online: TANPA ongkir, tanpa COD/driver
  const isJasa = p.cat === 'jasa' || p.dist === 0;
  // jarak nyata pembeli→penjual: GPS live pembeli, fallback pusat kecamatannya
  const buyerPos = parseCoords(req.body.buyerLat, req.body.buyerLng) || KEC_COORDS[req.user.kec] || KEC_COORDS.Rangkasbitung;
  p.dist = Math.max(0.01, +havKm(buyerPos, prodCoords(p)).toFixed(2));

  if (mode === 'cod') {
    if (!p.cod || isJasa || p.dist > COD_MAX_KM) return bad(res, 400, 'COD tidak tersedia untuk produk ini');
    if (!meetPoint || !meetTime) return bad(res, 400, 'Isi titik temu & waktu janjian');
    const id = uid();
    db.prepare(`INSERT INTO orders (id, buyer_id, seller_id, product_id, mode, method, price, ship, app_fee, gateway_fee, total, status, meet_point, meet_time, created_at)
      VALUES (?,?,?,?,?,?,?,0,0,0,?,?,?,?,?)`)
      .run(id, req.user.id, p.seller_id, p.id, 'cod', 'Bayar di tempat', p.price, p.price, 'Janjian COD', meetPoint, meetTime, now());
    addEvent(id, 'Janjian COD', `${meetPoint} · ${meetTime}. Bayar setelah cek barang.`);
    db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(p.id);
    return res.json({ ok: true, order: getOrder(id) });
  }

  if (!['rekber', 'driver'].includes(mode)) return bad(res, 400, 'Mode transaksi tidak dikenal');
  if (mode === 'driver' && (isJasa || p.dist > DRIVER_MAX_KM)) return bad(res, 400, 'Driver hanya untuk penjual ≤ ' + DRIVER_MAX_KM + ' km');
  const paySaldo = payMethod === 'saldo';
  const payManual = payMethod === 'manual';
  if (!paySaldo && !payManual) return bad(res, 400, 'Metode pembayaran tidak dikenal');
  const gw = paySaldo ? { name: 'Saldo Lebak.market', fee: () => 0 }
    : { name: 'Transfer/QRIS Manual', fee: () => 0 };
  if (!recvName || !recvAddr) return bad(res, 400, 'Isi nama & alamat/kontak penerima');

  const bd = isJasa ? { base: 0, seller: 0, subsidy: 0 } : shipBreakdown(p, mode);
  const ship = Math.max(0, bd.base - bd.seller - bd.subsidy);
  // pembayaran manual: kode unik Rp1–499 ditambahkan agar mutasi mudah dicocokkan
  const gatewayFee = payManual ? 1 + Math.floor(Math.random() * 499) : gw.fee(p.price + ship + APP_FEE);
  const total = p.price + ship + APP_FEE + gatewayFee;

  if (paySaldo){
    // ---- BAYAR PAKAI SALDO: langsung lunas & dana ditahan rekber ----
    const bal = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id)?.balance || 0;
    if (bal < total) return bad(res, 402, `Saldo tidak cukup (saldo Rp${bal.toLocaleString('id-ID')}, butuh Rp${total.toLocaleString('id-ID')})`);
    const id = uid();
    db.prepare(`INSERT INTO orders (id, buyer_id, seller_id, product_id, mode, method, method_id, price, ship, app_fee, gateway_fee, total, status, recv_name, recv_addr, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.user.id, p.seller_id, p.id, mode, gw.name, 'saldo', p.price, ship, APP_FEE, 0, total,
           'Menunggu Pembayaran', recvName, recvAddr, now());
    walletTxn(req.user.id, 'purchase', -total, 'Bayar ' + p.name.slice(0, 40) + ' (rekber)', id);
    db.prepare('UPDATE products SET stock = MAX(0, stock - 1) WHERE id = ?').run(p.id);
    addEvent(id, 'Menunggu Pembayaran', 'Invoice diterbitkan', false);
    addEvent(id, 'Dana Ditahan (Rekber)', 'Dibayar pakai saldo — dana ditahan rekber. Menunggu penjual memproses.');
    addRevenue(id, 'app_fee', APP_FEE);
    return res.json({ ok: true, order: getOrder(id), payment: { paid: true, method: 'saldo' } });
  }

  const id = uid();
  // ---- TRANSFER/QRIS MANUAL: bayar ke rekening/QRIS pemilik, verifikasi admin ----
  db.prepare(`INSERT INTO orders (id, buyer_id, seller_id, product_id, mode, method, method_id, price, ship, app_fee, gateway_fee, total, status, recv_name, recv_addr, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, p.seller_id, p.id, mode, gw.name, 'manual', p.price, ship, APP_FEE, gatewayFee, total,
         'Menunggu Pembayaran', recvName, recvAddr, now());
  addEvent(id, 'Menunggu Pembayaran', 'Transfer PERSIS sejumlah total (termasuk kode unik) lalu unggah bukti pembayaran.');
  res.json({ ok: true, order: getOrder(id), payment: { manual: true } });
});

function getOrder(id){
  const o = db.prepare(`SELECT o.*, p.name pname, p.emoji, p.g, p.img, p.cond, p.dist, p.cat,
      su.name seller_name, bu.name buyer_name
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN users su ON su.id = o.seller_id
    JOIN users bu ON bu.id = o.buyer_id
    WHERE o.id = ?`).get(id);
  if (!o) return null;
  o.events = db.prepare('SELECT status, note, at FROM order_events WHERE order_id = ? ORDER BY at').all(id);
  return o;
}

app.get('/api/orders', auth, (req, res) => {
  const ids = db.prepare('SELECT id FROM orders WHERE buyer_id = ? AND buyer_hide = 0 ORDER BY created_at DESC').all(req.user.id);
  res.json({ orders: ids.map(x => getOrder(x.id)) });
});
app.get('/api/sales', auth, (req, res) => {
  const ids = db.prepare('SELECT id FROM orders WHERE seller_id = ? AND seller_hide = 0 ORDER BY created_at DESC').all(req.user.id);
  res.json({ sales: ids.map(x => getOrder(x.id)) });
});

/* --- PEMBAYARAN MANUAL: pembeli unggah bukti transfer --- */
app.post('/api/orders/:id/proof', auth, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.buyer_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (o.method_id !== 'manual') return bad(res, 400, 'Pesanan ini tidak memakai pembayaran manual');
  if (!['Menunggu Pembayaran', 'Menunggu Verifikasi'].includes(o.status)) return bad(res, 409, 'Pesanan sudah diproses');
  const img = saveImage(req.body.img);
  if (!img) return bad(res, 400, 'Bukti tidak valid (maks 5MB, JPG/PNG/WebP)');
  db.prepare('UPDATE orders SET pay_proof = ? WHERE id = ?').run(img, o.id);
  addEvent(o.id, 'Menunggu Verifikasi', 'Bukti pembayaran diunggah — menunggu verifikasi admin.');
  res.json({ ok: true, order: getOrder(o.id) });
});

/* --- ADMIN: verifikasi pembayaran manual + pengaturan QRIS --- */
app.get('/api/admin/payments', (req, res) => {
  if (!adminOk(req)) return bad(res, 403, 'Akses admin ditolak');
  const rows = db.prepare(`
    SELECT o.id, o.total, o.status, o.pay_proof, o.created_at, p.name pname, u.name buyer, u.email, u.phone
    FROM orders o JOIN products p ON p.id = o.product_id JOIN users u ON u.id = o.buyer_id
    WHERE o.method_id = 'manual' AND o.status IN ('Menunggu Pembayaran','Menunggu Verifikasi')
    ORDER BY o.created_at DESC LIMIT 200`).all();
  res.json({ payments: rows });
});
app.post('/api/admin/payments/:id/approve', (req, res) => {
  if (!adminOk(req)) return bad(res, 403, 'Akses admin ditolak');
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return bad(res, 404, 'Order tidak ditemukan');
  if (!['Menunggu Pembayaran', 'Menunggu Verifikasi'].includes(o.status)) return res.json({ ok: true, note: 'sudah diproses' });
  markPaid(o);
  res.json({ ok: true });
});
app.post('/api/admin/payments/:id/reject', (req, res) => {
  if (!adminOk(req)) return bad(res, 403, 'Akses admin ditolak');
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return bad(res, 404, 'Order tidak ditemukan');
  if (!['Menunggu Pembayaran', 'Menunggu Verifikasi'].includes(o.status)) return res.json({ ok: true, note: 'sudah diproses' });
  addEvent(o.id, 'Dibatalkan', 'Pembayaran ditolak/tidak ditemukan oleh admin.');
  res.json({ ok: true });
});
/* Info tujuan pembayaran (QRIS + rekening) — publik utk pembeli.
 * Default bawaan di bawah bisa ditimpa kapan saja lewat /admin.html. */
const PAY_INFO_DEFAULT = [
  'GOPAY  083102568122',
  'DANA   087710347760',
  'BANK JAGO  507728035278',
  'SEABANK    901713783157',
  'a/n IMAN SAEPULLOH',
].join('\n');
app.get('/api/paycfg', (req, res) => {
  res.json({
    qris: getSetting('qris_path') || (fs.existsSync(path.join(__dirname, '..', 'qris.png')) ? '/qris.png' : null),
    info: getSetting('pay_info') || PAY_INFO_DEFAULT,
  });
});
app.post('/api/admin/paycfg', (req, res) => {
  if (!adminOk(req)) return bad(res, 403, 'Akses admin ditolak');
  if (req.body.qrisImg){
    const img = saveImage(req.body.qrisImg);
    if (!img) return bad(res, 400, 'Gambar QRIS tidak valid (maks 5MB)');
    setSetting('qris_path', img);
  }
  if (req.body.info !== undefined) setSetting('pay_info', String(req.body.info).slice(0, 1000));
  res.json({ ok: true, qris: getSetting('qris_path'), info: getSetting('pay_info') });
});

/* --- Aksi PENJUAL: kirim barang / serahkan ke driver / kirim hasil --- */
app.post('/api/orders/:id/ship', auth, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.seller_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (o.status !== 'Dana Ditahan (Rekber)') return bad(res, 409, 'Pesanan belum dibayar / sudah diproses');
  const isJasa = o.cat === 'jasa' || o.dist === 0;
  if (o.mode === 'driver') addEvent(o.id, 'Diantar Driver', 'Barang diserahkan ke driver — menuju alamat pembeli.');
  else if (isJasa) addEvent(o.id, 'Hasil Dikirim', 'Hasil kerja dikirim — periksa lalu konfirmasi agar dana cair.');
  else addEvent(o.id, 'Dikirim', 'Paket diserahkan ke ekspedisi.');
  res.json({ ok: true, order: getOrder(o.id) });
});

/* --- Aksi PEMBELI: konfirmasi diterima → dana cair --- */
const CONFIRMABLE = ['Dikirim', 'Diantar Driver', 'Hasil Dikirim'];
app.post('/api/orders/:id/confirm', auth, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.buyer_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (o.mode === 'cod') {
    if (o.status !== 'Janjian COD') return bad(res, 409, 'Status tidak bisa dikonfirmasi');
    // Platform tetap dapat bagian dari COD: komisi dicatat sebagai tagihan
    // penjual dan dipotong otomatis dari pencairan rekber berikutnya.
    const fee = codFee(o.price);
    addRevenue(o.id, 'cod_fee', fee);
    db.prepare('UPDATE users SET cod_debt = cod_debt + ? WHERE id = ?').run(fee, o.seller_id);
    addEvent(o.id, 'Selesai',
      `Transaksi COD selesai. Komisi COD Rp${fee.toLocaleString('id-ID')} dicatat sebagai tagihan penjual (dipotong dari pencairan rekber berikutnya).`);
    return res.json({ ok: true, order: getOrder(o.id), codFee: fee });
  }
  if (!CONFIRMABLE.includes(o.status)) return bad(res, 409, 'Barang belum dikirim penjual / sudah selesai');
  const commission = Math.round(o.price * SELLER_COMMISSION);
  const extra = db.prepare('SELECT freeship FROM products WHERE id = ?').get(o.product_id)?.freeship
    ? Math.round(o.price * FREESHIP_EXTRA) : 0;
  const driverCut = o.mode === 'driver' ? Math.round(o.ship * DRIVER_COMMISSION) : 0;
  let net = o.price - commission - extra;
  // lunasi tagihan komisi COD penjual (bila ada) dari pencairan ini
  const debt = db.prepare('SELECT cod_debt FROM users WHERE id = ?').get(o.seller_id)?.cod_debt || 0;
  const debtCut = Math.min(debt, Math.max(0, net));
  if (debtCut > 0){
    db.prepare('UPDATE users SET cod_debt = cod_debt - ? WHERE id = ?').run(debtCut, o.seller_id);
    net -= debtCut;
  }
  addRevenue(o.id, 'commission', commission);
  addRevenue(o.id, 'freeship_extra', extra);
  addRevenue(o.id, 'driver_cut', driverCut);
  // dana cair MASUK KE SALDO penjual — bisa ditarik atau dibelanjakan lagi
  walletTxn(o.seller_id, 'escrow_in', net, 'Dana cair: ' + o.pname.slice(0, 40), o.id);
  addEvent(o.id, 'Selesai — Dana Cair',
    `Rp${net.toLocaleString('id-ID')} masuk ke saldo penjual (komisi ${SELLER_COMMISSION*100}%${extra ? ' + gratis ongkir 4%' : ''}${debtCut ? ' + tagihan COD Rp' + debtCut.toLocaleString('id-ID') : ''} dipotong).`);
  res.json({ ok: true, order: getOrder(o.id), payout: { net, commission, extra, driverCut, debtCut } });
});

/* ================= SALDO & PENARIKAN ================= */
app.get('/api/wallet', auth, (req, res) => {
  const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id).balance;
  const txns = db.prepare('SELECT kind, amount, note, order_id, at FROM wallet_txns WHERE user_id = ? ORDER BY at DESC LIMIT 50').all(req.user.id);
  res.json({ balance, minWithdraw: MIN_WITHDRAW, txns });
});
app.post('/api/wallet/withdraw', auth, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  const dest = String(req.body.dest || '').trim().slice(0, 120);
  if (!amount || amount < MIN_WITHDRAW) return bad(res, 400, 'Penarikan minimal Rp' + MIN_WITHDRAW.toLocaleString('id-ID'));
  if (!dest || dest.length < 8) return bad(res, 400, 'Isi tujuan penarikan (bank/e-wallet + nomor + atas nama)');
  const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id).balance;
  if (amount > balance) return bad(res, 400, 'Saldo tidak cukup (saldo Rp' + balance.toLocaleString('id-ID') + ')');
  walletTxn(req.user.id, 'withdraw', -amount, 'Penarikan ke ' + dest + ' · diproses admin maks 1×24 jam');
  console.log(`[withdraw] ${req.user.name} (${req.user.email}) menarik Rp${amount.toLocaleString('id-ID')} → ${dest}`);
  res.json({ ok: true, balance: balance - amount, message: 'Permintaan penarikan dicatat — dana dikirim admin maks 1×24 jam' });
});

app.post('/api/orders/:id/complain', auth, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.buyer_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (!CONFIRMABLE.includes(o.status)) return bad(res, 409, 'Komplain hanya saat barang sudah dikirim');
  addEvent(o.id, 'Komplain — Ditinjau', 'Komplain dibuka — dana ditahan sampai sengketa selesai.');
  res.json({ ok: true, order: getOrder(o.id) });
});

/* --- Pembeli membatalkan pesanan yang BELUM dibayar --- */
app.post('/api/orders/:id/cancel', auth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o || o.buyer_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (o.status !== 'Menunggu Pembayaran')
    return bad(res, 409, o.status === 'Menunggu Verifikasi'
      ? 'Bukti bayar sudah dikirim — tunggu verifikasi admin (hubungi admin bila keliru)'
      : 'Pesanan ini sudah berjalan dan tidak bisa dibatalkan sepihak');
  addEvent(o.id, 'Dibatalkan', 'Dibatalkan oleh pembeli sebelum pembayaran.');
  res.json({ ok: true, order: getOrder(o.id) });
});

/* --- Hapus dari riwayat (sembunyikan per sisi; hanya transaksi final) --- */
const FINAL_STATUSES = ['Selesai', 'Selesai — Dana Cair', 'Dibatalkan'];
app.post('/api/orders/:id/hide', auth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o || (o.buyer_id !== req.user.id && o.seller_id !== req.user.id)) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (!FINAL_STATUSES.includes(o.status)) return bad(res, 409, 'Hanya transaksi selesai/dibatalkan yang bisa dihapus dari riwayat');
  const col = o.buyer_id === req.user.id ? 'buyer_hide' : 'seller_hide';
  db.prepare(`UPDATE orders SET ${col} = 1 WHERE id = ?`).run(o.id);
  res.json({ ok: true });
});

/* ================= CHAT NYATA antar pengguna ================= */
app.get('/api/chats', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT peer_id, MAX(at) last_at, SUM(unread) unread FROM (
      SELECT recipient_id peer_id, at, 0 unread FROM messages WHERE sender_id = @me
      UNION ALL
      SELECT sender_id peer_id, at, CASE WHEN read = 0 THEN 1 ELSE 0 END unread FROM messages WHERE recipient_id = @me
    ) GROUP BY peer_id ORDER BY last_at DESC`).all({ me: req.user.id });
  const chats = rows.map(r => {
    const peer = db.prepare('SELECT id, name, kec, avatar FROM users WHERE id = ?').get(r.peer_id);
    const last = db.prepare(`SELECT sender_id, text, at FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY at DESC LIMIT 1`).get(req.user.id, r.peer_id, r.peer_id, req.user.id);
    return { peer, unread: r.unread, last: { from_me: last.sender_id === req.user.id ? 1 : 0, text: last.text, at: last.at } };
  });
  res.json({ chats });
});
app.get('/api/chats/:peerId', auth, (req, res) => {
  const pid = parseInt(req.params.peerId, 10);
  const peer = db.prepare('SELECT id, name, kec, avatar FROM users WHERE id = ?').get(pid);
  if (!peer) return bad(res, 404, 'Pengguna tidak ditemukan');
  db.prepare('UPDATE messages SET read = 1 WHERE recipient_id = ? AND sender_id = ?').run(req.user.id, pid);
  const msgs = db.prepare(`SELECT sender_id, text, at FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY at`).all(req.user.id, pid, pid, req.user.id)
    .map(m => ({ from_me: m.sender_id === req.user.id ? 1 : 0, text: m.text, at: m.at }));
  res.json({ peer, messages: msgs });
});
app.post('/api/chats/:peerId', auth, (req, res) => {
  const pid = parseInt(req.params.peerId, 10);
  if (pid === req.user.id) return bad(res, 400, 'Tidak bisa chat dengan diri sendiri');
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(pid)) return bad(res, 404, 'Pengguna tidak ditemukan');
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) return bad(res, 400, 'Pesan kosong');
  db.prepare('INSERT INTO messages (sender_id, recipient_id, text, read, at) VALUES (?,?,?,0,?)').run(req.user.id, pid, text, now());
  ssePush(pid, 'chat', { from: { id: req.user.id, name: req.user.name }, text, at: now() });
  res.json({ ok: true });
});

/* Daftar permintaan penarikan utk ADMIN (kamu): set env ADMIN_KEY lalu buka
 * https://situsmu.com/api/admin/withdrawals?key=ADMIN_KEY
 * → transfer manual ke tujuan masing-masing. */
app.get('/api/admin/withdrawals', (req, res) => {
  const key = process.env.ADMIN_KEY;
  if (!key || req.query.key !== key) return bad(res, 403, 'Akses admin ditolak — set env ADMIN_KEY dan sertakan ?key=');
  const rows = db.prepare(`
    SELECT w.id, -w.amount amount, w.note, w.at, u.name, u.email, u.phone
    FROM wallet_txns w JOIN users u ON u.id = w.user_id
    WHERE w.kind = 'withdraw' ORDER BY w.at DESC LIMIT 200`).all();
  res.json({ withdrawals: rows.map(r => ({ ...r, tanggal: new Date(r.at).toLocaleString('id-ID') })) });
});

/* ================= REVENUE =================
 * (Direktori kuliner kini diambil frontend langsung dari OpenStreetMap
 *  di sekitar lokasi live pengguna — tidak ada lagi data resto karangan.) */
app.get('/api/revenue', (req, res) => {
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM revenue').get().t;
  const byKind = db.prepare('SELECT kind, SUM(amount) amount, COUNT(*) n FROM revenue GROUP BY kind').all();
  res.json({ total, byKind });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🌾 Lebak.market API + frontend siap di http://localhost:${PORT}`);
  console.log(`   Mode: ${IS_DEV ? 'DEV (OTP dibalas di respons API)' : 'PRODUKSI'} · Realtime: SSE aktif`);
});
