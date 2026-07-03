# 🛍️ MONGG.market — Sosmed Khusus Jualan (Baru & Bekas)

Marketplace bergaya **media sosial**: feed-nya seperti Instagram, tapi semua postingan adalah jualan — barang baru, barang second, jasa, makanan, elektronik, sampai ikan hias. Fokus pada **transaksi aman (rekber/escrow)**, **COD radius terdekat**, dan opsi **antar driver instan**.

> ⚠️ **Status: demo front-end.** Semua fitur berjalan di browser (data di `localStorage`). Pembayaran & webhook adalah **simulasi** alur payment gateway — untuk uang sungguhan dibutuhkan backend + Midtrans/Xendit (lihat "Menuju Produksi").

## ✨ Fitur

### Sosmed & katalog
- Feed post jualan: like 👍, komentar, share, follow penjual, stories penjual
- Kategori terpisah: 🛠️ Jasa · 🍜 Makanan · 📱 Elektronik · 🐠 Ikan Hias · 👕 Fashion
- Label kondisi **✨ Baru / 🏷️ Bekas** di setiap post
- **💖 Favorit** (wishlist) menggantikan keranjang — beli langsung per barang, khas jual-beli barang second
- Pencarian + **filter radius jarak** (≤5 / ≤10 / ≤25 km / semua); saat radius aktif, feed diurutkan dari penjual terdekat

### 3 cara transaksi (dipilih saat beli)
1. **🛡️ Rekber + Kirim Ekspedisi** — dana pembeli ditahan sistem (escrow); cair ke penjual hanya setelah pembeli konfirmasi barang sesuai. Ada tombol komplain yang menahan dana bila bermasalah.
2. **🛵 Rekber + Antar Driver Instan** — untuk penjual ≤15 km; barang diantar hari itu juga (ongkos ±Rp3.000/km, min Rp10.000), dana tetap lewat rekber.
3. **🤝 COD Ketemuan** — untuk penjual ≤25 km yang membuka COD; pilih titik temu aman (minimarket, kantor polisi, mall) + waktu janjian, bayar di tempat setelah cek barang. Gratis biaya.

### Strategi "Gratis Ongkir" (antar kota/pulau)
- **Ongkir bertingkat** berdasarkan jarak: sekitar kota Rp12rb → antar kota Rp18rb → antar pulau Rp38rb (simulasi)
- **Program Gratis Ongkir penjual** — penjual opt-in saat posting (di versi live: +4% komisi); ongkir ditanggung toko, produk dapat badge 🚚 GRATIS ONGKIR di feed
- **Voucher subsidi platform** — belanja min. Rp100rb otomatis dapat potongan ongkir s.d. Rp20rb; sisanya dibayar pembeli (model plafon ala Shopee/Tokopedia)
- Rincian di checkout selalu transparan: ongkir asli, siapa yang menanggung, dan sisa yang dibayar

### Otomatisasi
- Alur payment gateway: invoice → QRIS/VA → **webhook** → status "Dana Ditahan (Rekber)" otomatis
- Timeline status per moda: ekspedisi (Dikirim → Tiba), driver (Menjemput → Diantar → Tiba), jasa (Dikerjakan → Hasil dikirim)
- Stok berkurang otomatis; pencairan dana ke penjual otomatis begitu pembeli menekan "✅ Barang Sesuai"

### Jualan
- Tombol ＋ Jual: nama, kategori, **kondisi baru/bekas**, harga, stok, lokasi, dan toggle "buka COD"

## 🚀 Menjalankan

Buka `index.html` di browser — tanpa build, tanpa dependency. Bisa deploy ke GitHub Pages.

## ⚙️ Sistem Aman Barang Second (win-win)

| Risiko | Solusinya di sini |
|---|---|
| Penjual takut kirim barang tapi tidak dibayar | Dana sudah masuk rekber **sebelum** barang dikirim |
| Pembeli takut transfer tapi barang zonk/tidak dikirim | Dana **tidak diteruskan** ke penjual sampai pembeli cek & konfirmasi |
| Barang tidak sesuai deskripsi | Tombol komplain — dana tetap tertahan, CS menengahi dengan bukti |
| Tidak percaya sistem sama sekali | COD ketemuan di tempat ramai: cek dulu, bayar kalau cocok |
| Malas keluar rumah tapi barang dekat | Driver instan jemput barang, pembayaran tetap rekber |

## 🏗️ Menuju Produksi

1. **Backend + database** — akun, produk, pesanan, chat, keamanan.
2. **Payment gateway** (Midtrans/Xendit) + **webhook endpoint** di server untuk konfirmasi bayar otomatis.
3. **Escrow/split payment** — dana ditahan platform lalu diteruskan ke penjual (Xendit split payment / fitur marketplace Midtrans), plus rekening pencairan penjual yang diverifikasi (KTP).
4. **Geolokasi asli** — simpan koordinat penjual (Geolocation API), hitung jarak Haversine, index geospasial di database.
5. **Driver**: mulai dengan **integrasi kurir instan pihak ketiga** (GoSend/GrabExpress via API Biteship) — bukan armada sendiri. Armada sendiri baru masuk akal setelah volume pesanan per area tinggi.
6. Upload foto asli, verifikasi penjual, rating & ulasan, resolusi sengketa.

## ✏️ Kustomisasi Cepat

| Bagian | Lokasi di `index.html` |
|---|---|
| Kategori | Konstanta `CATS` |
| Produk contoh (jarak, COD, kondisi) | Konstanta `SEED` |
| Batas radius COD & driver | `COD_MAX_KM`, `DRIVER_MAX_KM` |
| Tarif driver | Fungsi `driverFee` |
| Metode & biaya pembayaran | Konstanta `PAY_METHODS` |
| Titik temu COD | Konstanta `MEET_POINTS` |
| Warna tema | Variabel CSS di `:root` |
