# 🛍️ MONGG.market — Sosmed Khusus Jualan

Marketplace bergaya **media sosial**: feed-nya seperti Instagram, tapi semua postingan adalah jualan. Jual jasa, makanan, elektronik, sampai ikan hias — dengan kategori terpisah dan alur pembayaran otomatis ala payment gateway.

> ⚠️ **Status: demo front-end.** Semua fitur berjalan di browser (data tersimpan di `localStorage`). Pembayaran adalah **simulasi** alur payment gateway — untuk menerima uang sungguhan dibutuhkan backend + akun Midtrans/Xendit (lihat bagian "Menuju Produksi" di bawah).

## ✨ Fitur Demo

- **Feed sosmed** — post jualan dengan foto, harga, stok, tombol like ❤️, komentar & share
- **Stories penjual** — deretan avatar toko di bagian atas
- **Kategori terpisah** — ✨ Semua · 🛠️ Jasa · 🍜 Makanan · 📱 Elektronik · 🐠 Ikan Hias · 👕 Fashion
- **Pencarian** produk/penjual/kategori
- **Keranjang** dengan atur jumlah + batas stok
- **Checkout 2 langkah** — alamat & kurir → pilih metode bayar
- **4 metode pembayaran** — QRIS (0,7%), Virtual Account (Rp4.000), E-Wallet (1,5%), Kartu (2,9% + Rp2.000) dengan biaya layanan dihitung otomatis
- **Halaman bayar** — QR code / nomor VA + batas waktu 24 jam
- **Status pesanan otomatis** — Menunggu Pembayaran → Dibayar (webhook) → Diproses → Dikirim → Selesai, lengkap dengan timeline
- **Escrow (rekber)** — dana "ditahan" dan diteruskan ke penjual saat pesanan selesai
- **Posting jualan** — tombol ＋ Jual: siapa pun bisa menambah produk ke feed
- **Stok berkurang otomatis** setelah pembayaran terkonfirmasi

## 🚀 Cara Menjalankan

Buka `index.html` di browser — selesai. Tanpa build, tanpa dependency. Bisa juga di-deploy ke GitHub Pages.

## ⚙️ Cara Kerja Alur Pembayaran (dan padanannya di dunia nyata)

| Di demo ini | Di produksi (Midtrans/Xendit) |
|---|---|
| Klik "Bayar Sekarang" → order dibuat di `localStorage` | Backend membuat transaksi via API gateway, dapat token/URL bayar |
| Muncul QR / nomor VA buatan | Gateway memberi QRIS dinamis / VA asli atas nama tokomu |
| Tombol "[DEMO] Simulasikan Pembayaran" | Pembeli benar-benar membayar dari aplikasinya |
| Status berubah jadi "Dibayar" | Gateway mengirim **webhook** ke server → server update status otomatis |
| Timer JS mengubah status Diproses/Dikirim | Penjual konfirmasi + integrasi API kurir (resi otomatis) |
| "Escrow" hanya teks | Perlu fitur split payment/escrow (mis. Xendit split, Midtrans partner) |

## 🏗️ Menuju Produksi — yang perlu ditambahkan

1. **Backend + database** (mis. Node.js/Laravel + PostgreSQL): akun pengguna, produk, pesanan, keamanan.
2. **Akun payment gateway** — daftar Midtrans/Xendit (butuh KTP/NPWP & data usaha), dapatkan Server Key.
3. **Webhook endpoint** — URL server yang menerima notifikasi pembayaran dan mengubah status pesanan otomatis.
4. **Upload foto asli** (object storage), verifikasi penjual, rekening pencairan dana.
5. **Integrasi kurir** (RajaOngkir/Biteship) untuk ongkir & resi otomatis.
6. **Escrow/split payment** karena marketplace multi-penjual — dana pembeli ditahan platform lalu diteruskan ke penjual.

## ✏️ Kustomisasi Cepat

| Bagian | Lokasi di `index.html` |
|---|---|
| Kategori | Konstanta `CATS` |
| Produk contoh | Konstanta `SEED` |
| Metode & biaya pembayaran | Konstanta `PAY_METHODS` |
| Ongkir | Angka `12000` di fungsi checkout |
| Warna tema | Variabel CSS di `:root` |
