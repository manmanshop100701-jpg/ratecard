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
 *  - Webhook pembayaran pola Midtrans (sandbox-sim s.d. punya key)
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
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' })); // foto dikirim sebagai data URL terkompresi
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, '..')));

/* ================= KONSTANTA BISNIS ================= */
const APP_FEE = 1000;
const SELLER_COMMISSION = 0.03;
const DRIVER_COMMISSION = 0.10;
const FREESHIP_EXTRA = 0.04;
const COD_MAX_KM = 25, DRIVER_MAX_KM = 15;
const FREESHIP_CAP = 20000, FREESHIP_MIN = 100000;
const KECAMATAN = ['Rangkasbitung','Cibadak','Warunggunung','Kalanganyar','Cikulur','Cimarga','Maja','Sajira','Cileles','Leuwidamar','Malingping','Bayah'];
const CATS = ['jasa','makanan','elektronik','ikan','fashion','kriya'];

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
 * Integrasi Midtrans asli (saat sudah punya Server Key):
 *   const midtrans = require('midtrans-client');
 *   const snap = new midtrans.Snap({ isProduction:false, serverKey:process.env.MIDTRANS_SERVER_KEY });
 *   const tx = await snap.createTransaction({ transaction_details:{ order_id, gross_amount } });
 *   → kirim tx.redirect_url ke frontend; webhook Midtrans menembak /api/payments/webhook.
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
    // Tanpa WEBHOOK_SECRET = mode sandbox (tombol simulasi frontend).
    // Saat Midtrans terpasang: set WEBHOOK_SECRET & verifikasi SHA-512 asli.
    return !process.env.WEBHOOK_SECRET || req.body.signature === process.env.WEBHOOK_SECRET;
  },
};

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
    <p style="color:#6f6787;margin:0 0 20px">Marketplace-nya urang Lebak</p>
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
    req.user = db.prepare('SELECT id, name, email, phone, kec, verified FROM users WHERE id = ?').get(data.uid);
    if (!req.user) return bad(res, 401, 'Akun tidak ditemukan');
    next();
  } catch { return bad(res, 401, 'Sesi kedaluwarsa — login lagi ya'); }
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

/* ================= CONFIG ================= */
app.get('/api/config', (req, res) => {
  res.json({
    kecamatan: KECAMATAN, cats: CATS,
    fees: { appFee: APP_FEE, sellerCommission: SELLER_COMMISSION, driverCommission: DRIVER_COMMISSION, freeshipExtra: FREESHIP_EXTRA },
    limits: { codMaxKm: COD_MAX_KM, driverMaxKm: DRIVER_MAX_KM, freeshipCap: FREESHIP_CAP, freeshipMin: FREESHIP_MIN },
  });
});

/* ================= AUTH =================
 * Akun DIBUAT LANGSUNG saat daftar (verified=0) sehingga login dengan
 * email+password selalu bisa, bahkan bila email OTP tidak sampai.
 * Verifikasi email hanya menaikkan status verified — bukan syarat login. */
const signToken = uid => jwt.sign({ uid }, JWT_SECRET, { expiresIn: '30d' });
const userPayload = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, kec: u.kec, verified: u.verified ? 1 : 0 });

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
    message: 'Akun aktif! Kode verifikasi email dikirim ke ' + em,
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
  if (!row) return bad(res, 404, 'Tidak ada pendaftaran menunggu — daftar dulu ya');
  if (row.expires_at < now()) return bad(res, 410, 'Kode kedaluwarsa — kirim ulang ya');
  if (row.attempts >= 5) return bad(res, 429, 'Terlalu banyak percobaan — kirim ulang kode');
  if (row.code !== code) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ?').run(em);
    return bad(res, 400, 'Kode salah — cek lagi ya');
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
    if (!u) return bad(res, 404, 'Email belum terdaftar — daftar dulu yuk');
  } else if (!await bcrypt.compare(pw, u.pass_hash)) {
    return bad(res, 401, 'Password salah');
  }
  res.json({ ok: true, token: signToken(u.id), user: userPayload(u) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

/* ================= PRODUK (100% postingan pengguna asli) ================= */
const PRODUCT_SELECT = `
  SELECT p.*, u.name seller_name, u.kec seller_kec,
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
  const { name = '', cat, cond = 'baru', price, stock, descr = '', cod = true, freeship = false, img } = req.body;
  if (!name.trim()) return bad(res, 400, 'Nama produk wajib diisi');
  if (!CATS.includes(cat)) return bad(res, 400, 'Kategori tidak dikenal');
  const pr = parseInt(price, 10), st = parseInt(stock, 10);
  if (!pr || pr < 1000) return bad(res, 400, 'Harga minimal Rp1.000');
  if (!st || st < 1) return bad(res, 400, 'Stok minimal 1');
  let imgPath = null;
  if (img){
    imgPath = saveImage(img);
    if (!imgPath) return bad(res, 400, 'Foto tidak valid (maks 5MB, format JPG/PNG/WebP)');
  }
  const g = 'g-' + (1 + Math.floor(Math.random() * 6));
  // posisi GPS live penjual saat posting; tanpa izin GPS → pusat kecamatan domisili
  const pos = parseCoords(req.body.lat, req.body.lng) || KEC_COORDS[req.user.kec] || KEC_COORDS.Rangkasbitung;
  const r = db.prepare(`INSERT INTO products
    (seller_id, cat, name, price, stock, cond, loc, dist, lat, lng, cod, freeship, lebak, emoji, g, img, descr, created_at)
    VALUES (?,?,?,?,?,?,?,0.5,?,?,?,?,1,'',?,?,?,?)`)
    .run(req.user.id, cat, name.trim(), pr, st, cond === 'bekas' ? 'bekas' : 'baru',
         req.user.kec + ', Lebak', pos.lat, pos.lng, cod ? 1 : 0, freeship ? 1 : 0,
         g, imgPath, String(descr).trim() || 'Tanpa deskripsi.', now());
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
app.post('/api/orders', auth, (req, res) => {
  const { productId, mode, payMethod, recvName, recvAddr, meetPoint, meetTime } = req.body;
  const p = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(parseInt(productId, 10));
  if (!p) return bad(res, 404, 'Produk tidak ditemukan');
  if (p.seller_id === req.user.id) return bad(res, 400, 'Tidak bisa membeli barang sendiri 😄');
  if (p.stock < 1) return bad(res, 409, 'Stok habis');
  const isJasa = p.dist === 0;
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
    addEvent(id, 'Janjian COD', `${meetPoint} · ${meetTime}. Atur detail lewat chat. Bayar HANYA setelah cek barang!`);
    db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(p.id);
    return res.json({ ok: true, order: getOrder(id) });
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
  db.prepare(`INSERT INTO orders (id, buyer_id, seller_id, product_id, mode, method, method_id, price, ship, app_fee, gateway_fee, total, status, recv_name, recv_addr, va, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, p.seller_id, p.id, mode, gw.name, payMethod, p.price, ship, APP_FEE, gatewayFee, total,
         'Menunggu Pembayaran', recvName, recvAddr, pay.va, now());
  addEvent(id, 'Menunggu Pembayaran', 'Invoice rekber diterbitkan — bayar sebelum 24 jam');
  res.json({ ok: true, order: getOrder(id), payment: pay });
});

function getOrder(id){
  const o = db.prepare(`SELECT o.*, p.name pname, p.emoji, p.g, p.img, p.cond, p.dist,
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
  const ids = db.prepare('SELECT id FROM orders WHERE buyer_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ orders: ids.map(x => getOrder(x.id)) });
});
app.get('/api/sales', auth, (req, res) => {
  const ids = db.prepare('SELECT id FROM orders WHERE seller_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ sales: ids.map(x => getOrder(x.id)) });
});

/* --- WEBHOOK PEMBAYARAN (pola Midtrans; tanpa timer palsu) --- */
app.post('/api/payments/webhook', (req, res) => {
  if (!gateway.verifySignature(req)) return bad(res, 403, 'Signature tidak valid');
  const { order_id, transaction_status = 'settlement' } = req.body;
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!o) return bad(res, 404, 'Order tidak ditemukan');
  if (o.status !== 'Menunggu Pembayaran') return res.json({ ok: true, note: 'sudah diproses' });
  if (transaction_status !== 'settlement') return res.json({ ok: true, note: 'status diabaikan: ' + transaction_status });
  db.prepare('UPDATE products SET stock = MAX(0, stock - 1) WHERE id = ?').run(o.product_id);
  addEvent(o.id, 'Dana Ditahan (Rekber)', 'Pembayaran terverifikasi — dana aman di rekening bersama. Penjual: silakan proses pesanan! 🔔');
  addRevenue(o.id, 'app_fee', o.app_fee);
  res.json({ ok: true });
});

/* --- Aksi PENJUAL: kirim barang / serahkan ke driver / kirim hasil --- */
app.post('/api/orders/:id/ship', auth, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.seller_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (o.status !== 'Dana Ditahan (Rekber)') return bad(res, 409, 'Pesanan belum dibayar / sudah diproses');
  const isJasa = o.dist === 0;
  if (o.mode === 'driver') addEvent(o.id, 'Diantar Driver', `Penjual menyerahkan barang ke Driver Lebak — menuju alamat pembeli 🛵`);
  else if (isJasa) addEvent(o.id, 'Hasil Dikirim', 'Penjual mengirim hasil kerja — silakan review, lalu konfirmasi agar dana cair 🎨');
  else addEvent(o.id, 'Dikirim', 'Penjual menyerahkan paket ke ekspedisi — resi terbit 📦');
  res.json({ ok: true, order: getOrder(o.id) });
});

/* --- Aksi PEMBELI: konfirmasi diterima → dana cair --- */
const CONFIRMABLE = ['Dikirim', 'Diantar Driver', 'Hasil Dikirim'];
app.post('/api/orders/:id/confirm', auth, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.buyer_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (o.mode === 'cod') {
    if (o.status !== 'Janjian COD') return bad(res, 409, 'Status tidak bisa dikonfirmasi');
    addEvent(o.id, 'Selesai', 'Ketemuan sukses — barang oke, bayar di tempat. Win-win! 🎉');
    return res.json({ ok: true, order: getOrder(o.id) });
  }
  if (!CONFIRMABLE.includes(o.status)) return bad(res, 409, 'Barang belum dikirim penjual / sudah selesai');
  const commission = Math.round(o.price * SELLER_COMMISSION);
  const extra = db.prepare('SELECT freeship FROM products WHERE id = ?').get(o.product_id)?.freeship
    ? Math.round(o.price * FREESHIP_EXTRA) : 0;
  const driverCut = o.mode === 'driver' ? Math.round(o.ship * DRIVER_COMMISSION) : 0;
  const net = o.price - commission - extra;
  addRevenue(o.id, 'commission', commission);
  addRevenue(o.id, 'freeship_extra', extra);
  addRevenue(o.id, 'driver_cut', driverCut);
  addEvent(o.id, 'Selesai — Dana Cair',
    `Pembeli konfirmasi sesuai → dana diteruskan ke penjual: Rp${net.toLocaleString('id-ID')} (komisi platform 3%${extra ? ' + program gratis ongkir 4%' : ''} dipotong) 💸`);
  res.json({ ok: true, order: getOrder(o.id), payout: { net, commission, extra, driverCut } });
});

app.post('/api/orders/:id/complain', auth, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.buyer_id !== req.user.id) return bad(res, 404, 'Pesanan tidak ditemukan');
  if (!CONFIRMABLE.includes(o.status)) return bad(res, 409, 'Komplain hanya saat barang sudah dikirim');
  addEvent(o.id, 'Komplain — Ditinjau', 'Komplain dibuka: dana tetap ditahan, CS menengahi dengan bukti foto/video ⚖️');
  res.json({ ok: true, order: getOrder(o.id) });
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
    const peer = db.prepare('SELECT id, name, kec FROM users WHERE id = ?').get(r.peer_id);
    const last = db.prepare(`SELECT sender_id, text, at FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY at DESC LIMIT 1`).get(req.user.id, r.peer_id, r.peer_id, req.user.id);
    return { peer, unread: r.unread, last: { from_me: last.sender_id === req.user.id ? 1 : 0, text: last.text, at: last.at } };
  });
  res.json({ chats });
});
app.get('/api/chats/:peerId', auth, (req, res) => {
  const pid = parseInt(req.params.peerId, 10);
  const peer = db.prepare('SELECT id, name, kec FROM users WHERE id = ?').get(pid);
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
  if (pid === req.user.id) return bad(res, 400, 'Tidak bisa chat dengan diri sendiri 😄');
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(pid)) return bad(res, 404, 'Pengguna tidak ditemukan');
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) return bad(res, 400, 'Pesan kosong');
  db.prepare('INSERT INTO messages (sender_id, recipient_id, text, read, at) VALUES (?,?,?,0,?)').run(req.user.id, pid, text, now());
  ssePush(pid, 'chat', { from: { id: req.user.id, name: req.user.name }, text, at: now() });
  res.json({ ok: true });
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
