# 🌾 Lebak.market — Sosmed Jualan & Kuliner Lebak (Fullstack, 100% Real & Realtime)

Marketplace bergaya **media sosial** khusus **Kabupaten Lebak, Banten**. Penjual lokal Lebak **selalu diprioritaskan** — lokal pride!

**100% real:** tidak ada postingan seed/bot — feed hanya berisi jualan pengguna terdaftar asli. Chat benar-benar antar akun (bukan balasan otomatis), dan status pesanan digerakkan aksi penjual sungguhan (Tandai Dikirim / Serahkan ke Driver / Kirim Hasil Kerja).

**Realtime (SSE):** pesan chat, perubahan status pesanan, dan jualan baru terdorong langsung ke semua pengguna online lewat `GET /api/events` — tanpa refresh. Transaksi punya dua sisi: tab **🛍️ Pembelian** dan **🏪 Penjualan** di akun yang sama.

```
ratecard/
├── index.html      ← frontend (terhubung ke API + GPS live + OpenStreetMap)
└── server/         ← backend Node.js + Express + SQLite
    ├── server.js   ← semua endpoint API
    └── db.js       ← skema database (node:sqlite bawaan Node 22+)
```

## 🚀 Menjalankan

```bash
cd server
npm install
npm start
# buka http://localhost:3000
```

Database SQLite (`server/data.db`) dibuat otomatis; hapus file itu untuk reset total.

> ⚠️ **Produksi (Railway/Render): WAJIB pasang Volume agar database tidak hilang tiap deploy.**
> Railway: klik service → **Settings → Volumes → Attach Volume** → mount path **`/data`** → redeploy.
> Server otomatis mendeteksi `/data` dan menyimpan `data.db` + foto upload di sana (tanpa perlu env tambahan).
> Tanpa volume, filesystem di-reset di setiap deploy → semua akun/produk hilang.

## 🧩 Arsitektur & Endpoint

| Endpoint | Fungsi |
|---|---|
| `POST /api/auth/register` | Validasi ketat (email typo/sekali-pakai ditolak) → **akun langsung aktif + JWT** (login bisa seketika); OTP dikirim untuk verifikasi email (opsional) |
| `POST /api/auth/verify` | Cek OTP (kedaluwarsa 10 mnt, maks 5 percobaan) → tandai email terverifikasi |
| `POST /api/auth/login` · `GET /api/me` | Login (password bcrypt) · profil dari token — termasuk penyelamat otomatis untuk pendaftar lama yang OTP-nya tak sampai |
| `GET /api/products` | Filter `cat`/`radius`/`q` + `lat`/`lng` posisi live penonton — jarak dihitung **Haversine asli**, urut Lebak dulu lalu terdekat |
| `POST /api/products` | Posting jualan (auth) — menyimpan koordinat GPS penjual saat posting (fallback: pusat kecamatan domisili) |
| `POST /api/orders` | Buat order rekber/driver/COD — **semua biaya dihitung server** (anti manipulasi) |
| `POST /api/orders/:id/proof` · `/api/admin/payments*` | Pembayaran manual: unggah bukti transfer → admin verifikasi di `/admin.html` |
| `POST /api/orders/:id/confirm` | Escrow release: komisi 1,5% (+4% freeship) dipotong, sisanya "dicairkan" ke penjual |
| `POST /api/orders/:id/complain` | Tahan dana, tandai sengketa |
| `GET /api/events` | **Realtime SSE**: push chat, status order, & produk baru ke pengguna online |
| `GET /api/sales` · `POST /api/orders/:id/ship` | Sisi penjual: daftar penjualan + aksi kirim (ekspedisi/driver/hasil jasa) |
| `GET/POST /api/chats/:peerId` | Chat NYATA antar akun pengguna (tersimpan di DB, terdorong via SSE) |
| `POST /api/products/:id/like` | Like tersimpan per akun di server |
| *(kuliner)* | Tanpa endpoint — frontend membaca tempat makan **asli** dari OpenStreetMap (Overpass API) di radius 15 km dari GPS live pengguna |
| `GET /api/revenue` | **Buku kas pendapatan platform** (biaya aplikasi, komisi penjual/driver) — tampil live di modal "ℹ️ Biaya & Komisi" |
| `GET /api/config` | Konstanta bisnis (tarif driver, batas COD, biaya) — satu sumber kebenaran |

**Keamanan yang sudah diterapkan:** password di-bcrypt, sesi JWT, harga/ongkir/komisi dihitung ulang di server (input frontend tidak dipercaya), OTP dibatasi umur & percobaan, escape output di frontend.

## 💳 Pembayaran: Transfer/QRIS Manual + Saldo

Tanpa payment gateway — pembeli membayar ke **QRIS/rekening milik pemilik platform** (diatur di `/admin.html`), total diberi **kode unik Rp1–499** untuk pencocokan mutasi, pembeli mengunggah bukti, lalu **admin memverifikasi satu klik** di `/admin.html` → dana berstatus ditahan rekber dan alur berjalan normal. Saldo internal juga bisa dipakai membayar (tanpa biaya).

Integrasi gateway (Duitku/Midtrans) telah dihapus dari kode — lihat riwayat git bila ingin dipasang kembali.

## 💼 Side Quest (misi berhadiah saldo)

Fitur pemberdayaan: admin membuat misi di `/admin.html` (judul, instruksi, hadiah Rp, kuota opsional) — mis. bantu promosi, komen sosmed, survei. Pengguna membuka menu **Misi**, mengerjakan, lalu mengirim bukti (keterangan/link + screenshot). Admin meninjau bukti dan sekali klik **ACC** → hadiah langsung masuk ke saldo pengguna (bisa ditarik tunai atau dipakai belanja). Anti-curang: satu akun hanya bisa menyelesaikan tiap misi sekali, kuota dihitung dari yang di-ACC, dan bukti ditolak boleh dicoba ulang.

## ☁️ Deploy ke Cloud (Railway / Render)

Repo sudah siap deploy: ada `package.json` root (install & start otomatis), `Procfile`, dan `render.yaml`.

### Railway (paling mudah, ±5 menit)
1. Buka [railway.app](https://railway.app) → login pakai akun GitHub
2. **New Project → Deploy from GitHub repo** → pilih repo ini → pilih branch
3. Railway mendeteksi Node otomatis dan menjalankan `npm install` + `npm start`
4. Tab **Variables** → tambah `JWT_SECRET` = teks acak panjang (wajib!)
5. Tab **Settings → Networking → Generate Domain** → dapat URL publik 🎉
6. *(Agar database awet saat redeploy)*: klik service → **Volumes → New Volume**, mount path `/data`, lalu tambah variable `DB_PATH=/data/data.db`

### Render (blueprint sekali klik)
1. Buka [render.com](https://render.com) → login pakai GitHub
2. **New + → Blueprint** → pilih repo ini → Render membaca `render.yaml` → **Apply**
3. `JWT_SECRET` dibuat otomatis; tunggu build selesai → dapat URL `https://lebak-market.onrender.com`
4. Catatan free tier: server "tidur" setelah 15 menit sepi (bangun ±30 detik saat diakses) dan disk bersifat sementara — database ter-reset saat redeploy. Upgrade + persistent disk menghilangkan keduanya (lihat komentar di `render.yaml`).

### Environment variables
| Var | Fungsi |
|---|---|
| `JWT_SECRET` | **Wajib di produksi** — kunci sesi login |
| `BREVO_API_KEY` + `MAIL_SENDER` | **Email OTP via Brevo (HTTPS)** — jalur paling andal di hosting cloud karena tidak terkena blokir SMTP (Railway trial memblokir SMTP!). Gratis 300 email/hari; `MAIL_SENDER` = email yang diverifikasi sebagai pengirim di dashboard Brevo |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Email OTP via Gmail SMTP — cocok untuk Termux/VPS; di PaaS sering diblokir |
| `RESEND_API_KEY` | Alternatif HTTPS lain (butuh domain terverifikasi) |
| `SMTP_HOST/PORT/USER/PASS` | SMTP umum lainnya |
| `OTP_IN_RESPONSE` | Otomatis: `0` saat email terpasang, `1` (mode pilot, kode tampil di aplikasi) saat belum |
| `DB_PATH` | Lokasi file SQLite (arahkan ke volume/disk agar persisten) |
| `ADMIN_KEY` | Kunci admin — buka `/api/admin/withdrawals?key=ADMIN_KEY` untuk melihat daftar permintaan penarikan saldo penjual |
| `UPLOAD_DIR` | Folder foto produk (arahkan ke volume agar foto awet) |
| `PORT` | Diisi otomatis oleh platform |

### 📧 Mengaktifkan email OTP via Gmail (5 menit)
1. Aktifkan **verifikasi 2 langkah** di akun Google-mu (myaccount.google.com → Keamanan)
2. Buka **myaccount.google.com/apppasswords** → buat App Password baru (nama bebas, mis. "lebak-market") → salin 16 karakternya
3. Tambahkan 2 env var: `GMAIL_USER=emailmu@gmail.com` dan `GMAIL_APP_PASSWORD=16karakter-tadi`
4. Restart — kode OTP kini terkirim ke inbox email pendaftar, dan tidak lagi tampil di layar. Email palsu otomatis tidak bisa daftar karena tidak pernah menerima kode

### 📷 Foto produk
Penjual mengunggah foto asli dari galeri/kamera saat posting; foto dikompresi otomatis di browser (maks 900px, JPEG) lalu disimpan server di `UPLOAD_DIR` dan tampil di feed, keranjang beli, dan kartu transaksi. Produk tanpa foto memakai tile inisial huruf yang bersih (bukan emoji).

## 🏗️ Menuju Produksi Penuh

- Deploy: **Railway / Render / Fly.io / VPS** (GitHub Pages tidak bisa — perlu server). Ganti `JWT_SECRET` via env!
- Email OTP asli: nodemailer / Resend / Mailgun di fungsi `sendOtpEmail`
- Chat real-time: WebSocket (socket.io) menggantikan polling; pesan diteruskan ke akun penjual sungguhan
- ~~Geolokasi GPS + Haversine~~ ✅ sudah live (`watchPosition` + Haversine di server); berikutnya: upload foto (S3/R2); verifikasi KTP penjual; rating & ulasan; panel admin sengketa
- Status pesanan digerakkan aksi penjual/kurir (timer simulasi di webhook diganti endpoint penjual)

## ✨ Fitur Produk (ringkas)

Register langsung aktif + verifikasi email opsional · 1 akun jual & beli · **lokasi live GPS dengan filter akurasi** (±meter ditampilkan; bisa dikunci manual per kecamatan) · **UI ala Facebook** (3 kolom, post cards, stories, composer) · feed prioritas Lebak + kategori & radius dari posisi nyata · favorit · chat · rekber escrow win-win · **pembayaran Transfer/QRIS manual** dengan kode unik + verifikasi admin, plus saldo internal · COD titik temu aman (validasi jarak GPS) dengan **komisi COD 1,5% tercatat sebagai tagihan penjual** · Driver Lebak resmi (Rp10rb + Rp2.500/km, ≤15 km) · gratis ongkir (ditanggung penjual / voucher plafon) · kuliner asli dari OpenStreetMap + petunjuk arah Google Maps · monetisasi transparan · responsif penuh dengan bottom nav mobile.
