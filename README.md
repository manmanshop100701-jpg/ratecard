# 🌾 Lebak.market — Sosmed Jualan & Kuliner Lebak

Marketplace bergaya **media sosial** khusus **Kabupaten Lebak, Banten**: feed seperti Instagram tapi semua postingan adalah jualan. Penjual lokal Lebak **selalu diprioritaskan** — lokal pride! Dilengkapi rekber (escrow), COD radius terdekat, driver resmi, chat penjual-pembeli, dan direktori kuliner lengkap dengan menu.

> ⚠️ **Status: demo front-end.** Semua fitur berjalan di browser (data di `localStorage`). Pembayaran, webhook, dan balasan chat adalah **simulasi** — untuk versi live dibutuhkan backend (lihat "Menuju Produksi").

## ✨ Fitur

### 🔐 Akun (register & login)
- Daftar dengan nama, email, no. HP, **kecamatan di Lebak**, dan password (validasi lengkap)
- **Email wajib valid**: format diperiksa ketat, typo domain umum dikoreksi (mis. `gmail.con` → saran `gmail.com`), email sekali-pakai (mailinator dkk.) ditolak, lalu **verifikasi kode OTP 6 digit** — di demo kode tampil sebagai notifikasi; di versi live dikirim server ke inbox (email palsu tidak akan menerima kode)
- **1 akun = penjual + pembeli** — tanpa daftar toko terpisah; posting jualan memakai identitas & kecamatan akun
- Modal sambutan saat kunjungan pertama; aksi beli/jual/chat/favorit otomatis minta login dulu

### 📱 Responsif penuh
- Desktop: layout 2 kolom + sidebar; Mobile (≤680px): **bottom navigation ala aplikasi** (Beranda · Kuliner · ＋Jual · Transaksi · Chat) dengan badge notifikasi, drawer & modal layar penuh, ukuran teks/tombol ramah jempol, aman untuk notch (safe-area)

### 🌾 Lokal Pride Lebak
- Post penjual Lebak diberi strip **"LOKAL PRIDE"** + badge 🌾 dan **selalu tampil paling atas** di feed
- Filter radius (≤5/10/25 km) + urutan berdasarkan jarak terdekat
- Kategori: Jasa · Makanan · Elektronik · Ikan Hias · Fashion · **Kriya Lebak** (gula aren, anyaman, sale pisang, emping...)

### 💬 Chat penjual ↔ pembeli
- Tombol chat di setiap post & kartu transaksi, daftar percakapan, bubble chat, badge pesan belum dibaca
- Balasan penjual disimulasikan (di versi live: WebSocket real-time)

### 🛡️ Transaksi (3 cara)
1. **Rekber + Ekspedisi** — dana ditahan, cair setelah pembeli konfirmasi; tombol komplain menahan dana
2. **Rekber + Driver Lebak (RESMI)** — tarif: **Rp10.000 (0–3 km) + Rp2.500/km** berikutnya, maks 15 km, sampai hari itu juga
3. **COD Ketemuan** — ≤25 km, titik temu aman khas Lebak (alun-alun Rangkasbitung, stasiun, Polres) + tips keamanan

### 🍽️ Kuliner Lebak (direktori, bukan pesan-antar)
- Resto/warung/cafe/coffeeshop terdekat, diurut berdasarkan jarak
- **Menu + harga selalu ditampilkan** (ringkas di kartu, lengkap di modal), plus alamat, jam buka, rating, WiFi
- Tombol petunjuk arah (demo) — pesan langsung di tempat

### 💰 Monetisasi platform (pendapatan developer, transparan di tombol "ℹ️ Biaya & Komisi")
| Sumber | Besaran | Ditanggung |
|---|---|---|
| Biaya aplikasi | Rp1.000/transaksi rekber | Pembeli (tertera di checkout) |
| Komisi penjual | 3% saat dana cair | Penjual |
| Komisi driver | 10% dari ongkos antar | Mitra driver |
| Program Gratis Ongkir | +4% komisi | Penjual (opt-in) |
| Slot promosi feed & kuliner | (rencana) | Penjual/resto |

### 🚚 Strategi gratis ongkir antar kota/pulau
Ongkir bertingkat (12rb/18rb/38rb) + program ditanggung penjual (badge 🚚) + voucher subsidi (min. belanja Rp100rb, plafon Rp20rb).

## 🚀 Menjalankan
Buka `index.html` di browser — tanpa build, tanpa dependency. Bisa deploy ke GitHub Pages.

## 🏗️ Menuju Produksi
1. **Backend + database** (akun ter-enkripsi + OTP, produk, pesanan, chat WebSocket)
2. **Payment gateway** Midtrans/Xendit + webhook + escrow/split payment + verifikasi KTP penjual
3. **Geolokasi asli** (GPS + Haversine + index geospasial) untuk radius & urutan jarak
4. **Driver**: rekrut mitra driver lokal Lebak dengan aplikasi sederhana, atau integrasi kurir instan pihak ketiga
5. **Data kuliner**: pendaftaran mandiri pemilik resto (gratis tayang, bayar untuk slot promosi) — sekaligus sumber pendapatan
6. Upload foto asli, rating & ulasan, moderasi konten, resolusi sengketa

## ✏️ Kustomisasi Cepat
| Bagian | Lokasi di `index.html` |
|---|---|
| Kategori & kecamatan | `CATS`, `KECAMATAN` |
| Produk contoh | `SEED` |
| Tempat kuliner & menu | `RESTOS` |
| Tarif driver | `driverFee` |
| Biaya & komisi platform | `APP_FEE`, `SELLER_COMMISSION`, `DRIVER_COMMISSION`, `FREESHIP_EXTRA` |
| Titik temu COD | `MEET_POINTS` |
| Warna tema | Variabel CSS di `:root` |
