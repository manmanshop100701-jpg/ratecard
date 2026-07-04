# 🌾 Lebak.market — Sosmed Jualan & Kuliner Lebak (Fullstack, 100% Real & Realtime)

Marketplace bergaya **media sosial** khusus **Kabupaten Lebak, Banten**. Penjual lokal Lebak **selalu diprioritaskan** — lokal pride!

**100% real:** tidak ada postingan seed/bot — feed hanya berisi jualan pengguna terdaftar asli. Chat benar-benar antar akun (bukan balasan otomatis), dan status pesanan digerakkan aksi penjual sungguhan (Tandai Dikirim / Serahkan ke Driver / Kirim Hasil Kerja).

**Realtime (SSE):** pesan chat, perubahan status pesanan, dan jualan baru terdorong langsung ke semua pengguna online lewat `GET /api/events` — tanpa refresh. Transaksi punya dua sisi: tab **🛍️ Pembelian** dan **🏪 Penjualan** di akun yang sama.

```
ratecard/
├── index.html      ← frontend (terhubung ke API)
└── server/         ← backend Node.js + Express + SQLite
    ├── server.js   ← semua endpoint API
    ├── db.js       ← skema database (node:sqlite bawaan Node 22+)
    └── seed.js     ← produk contoh + direktori kuliner
```

## 🚀 Menjalankan

```bash
cd server
npm install
npm start
# buka http://localhost:3000
```

Database SQLite (`server/data.db`) dibuat otomatis; hapus file itu untuk reset total.

## 🧩 Arsitektur & Endpoint

| Endpoint | Fungsi |
|---|---|
| `POST /api/auth/register` | Validasi ketat (email typo/sekali-pakai ditolak) → kirim OTP (dev: kode ikut di respons & log server) |
| `POST /api/auth/verify` | Cek OTP (kedaluwarsa 10 mnt, maks 5 percobaan) → buat akun → JWT 30 hari |
| `POST /api/auth/login` · `GET /api/me` | Login (password bcrypt) · profil dari token |
| `GET /api/products` | Filter `cat`/`radius`/`q`, urut **Lebak dulu** lalu jarak terdekat |
| `POST /api/products` | Posting jualan (auth) — 1 akun otomatis bisa jual & beli |
| `POST /api/orders` | Buat order rekber/driver/COD — **semua biaya dihitung server** (anti manipulasi) |
| `POST /api/payments/webhook` | Jalur notifikasi gateway (persis pola Midtrans) → dana ditahan, stok dipotong, status berjalan otomatis |
| `POST /api/orders/:id/confirm` | Escrow release: komisi 3% (+4% freeship) dipotong, sisanya "dicairkan" ke penjual |
| `POST /api/orders/:id/complain` | Tahan dana, tandai sengketa |
| `GET /api/events` | **Realtime SSE**: push chat, status order, & produk baru ke pengguna online |
| `GET /api/sales` · `POST /api/orders/:id/ship` | Sisi penjual: daftar penjualan + aksi kirim (ekspedisi/driver/hasil jasa) |
| `GET/POST /api/chats/:peerId` | Chat NYATA antar akun pengguna (tersimpan di DB, terdorong via SSE) |
| `POST /api/products/:id/like` | Like tersimpan per akun di server |
| `GET /api/restos` | Direktori kuliner Lebak + menu & harga |
| `GET /api/revenue` | **Buku kas pendapatan platform** (biaya aplikasi, komisi penjual/driver) — tampil live di modal "ℹ️ Biaya & Komisi" |
| `GET /api/config` | Konstanta bisnis (tarif driver, batas COD, biaya) — satu sumber kebenaran |

**Keamanan yang sudah diterapkan:** password di-bcrypt, sesi JWT, harga/ongkir/komisi dihitung ulang di server (input frontend tidak dipercaya), OTP dibatasi umur & percobaan, escape output di frontend.

## 💳 Menghubungkan Midtrans Asli (produksi)

Alurnya sudah 1:1 dengan gateway sungguhan — tinggal ganti modul `gateway` di `server.js`:
1. Daftar [Midtrans](https://midtrans.com) → ambil **Server Key** (mode sandbox dulu)
2. `npm i midtrans-client`, buat transaksi Snap di `POST /api/orders` (contoh kode sudah dikomentari di `server.js`)
3. Set URL webhook di dashboard Midtrans ke `https://domainmu.com/api/payments/webhook` + verifikasi signature SHA-512
4. Tombol "[SANDBOX] Simulasikan Pembayaran" dihapus — webhook asli yang menembak

## 🏗️ Menuju Produksi Penuh

- Deploy: **Railway / Render / Fly.io / VPS** (GitHub Pages tidak bisa — perlu server). Ganti `JWT_SECRET` via env!
- Email OTP asli: nodemailer / Resend / Mailgun di fungsi `sendOtpEmail`
- Chat real-time: WebSocket (socket.io) menggantikan polling; pesan diteruskan ke akun penjual sungguhan
- Geolokasi GPS + Haversine; upload foto (S3/R2); verifikasi KTP penjual; rating & ulasan; panel admin sengketa
- Status pesanan digerakkan aksi penjual/kurir (timer simulasi di webhook diganti endpoint penjual)

## ✨ Fitur Produk (ringkas)

Register/login + OTP email valid · 1 akun jual & beli · feed prioritas Lebak + kategori & radius · favorit · chat · rekber escrow win-win (barang bekas aman) · COD titik temu aman · Driver Lebak resmi (Rp10rb + Rp2.500/km, ≤15 km) · strategi gratis ongkir (ditanggung penjual / voucher plafon) · direktori kuliner + menu wajib tampil · monetisasi transparan · responsif penuh dengan bottom nav mobile.
