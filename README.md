# POS Offline Web App (Prototype)

Prototype aplikasi POS berbasis web yang berjalan offline (PWA) dan menyimpan semua data secara lokal menggunakan SQLite (sql.js). Aplikasi ini mendukung pemindaian barcode EAN-13 lewat kamera perangkat (menggunakan @zxing/browser).

Fitur utama:
- Database SQLite yang disimpan di `localStorage` (export/import base64)
- Tabel: `products`, `transactions`, `transaction_items`, `logs`
- Halaman Kasir: scan barcode, input manual, cart, total, simpan transaksi (cash / e-wallet)
- Halaman Admin: tambah/ubah produk (kode, nama, harga, stok, kategori)
- Logging perubahan stok/harga/transaksi
- UI sederhana, responsive, tombol besar untuk kasir

Cara pakai (dev):
1. Buka `index.html` di browser modern (Chrome/Edge) — lebih baik di device Android.
2. Izinkan Kamera ketika permintaan muncul.
3. Pilih peran `Kasir` atau `Admin` pada halaman awal.

Catatan untuk Android:
- Aplikasi ini adalah PWA yang dapat "Add to Home screen" dari Chrome.
- Jika ingin paket native, gunakan Capacitor/Android + plugin SQLite.

Limitasi prototype:
- Menggunakan `sql.js` (WASM) untuk SQLite di browser. Data persistensinya disimpan ke `localStorage`.
- Untuk produksi di Android, direkomendasikan menggunakan Capacitor + native SQLite/Room.

File penting:
- `/index.html` — UI dan struktur utama
- `/app.js` — logika aplikasi (DB, scanner, UI handlers)
- `/styles.css` — gaya sederhana

Cara menjalankan (dev):
1. Jalankan server HTTP dari folder proyek:
```bash
cd /workspaces/Test
python3 -m http.server 8000
```
2. Buka `http://localhost:8000/` di browser (untuk tes kamera gunakan device Android atau Chrome dengan permissions).

Menjadikan aplikasi sebagai PWA / Build untuk Android (opsi simple dengan Capacitor):
- Install Capacitor global atau di project: `npm install @capacitor/cli @capacitor/core --save-dev`
- Inisialisasi Capacitor dan tambahkan platform Android:
```bash
npx cap init
npx cap add android
```
- Salin file web Anda ke folder `webDir` yang ditentukan di `capacitor.config.json` (mis. `www` atau build folder dari bundler), lalu sync dan buka Android Studio:
```bash
npx cap copy
npx cap open android
```
- Untuk produksi di Android direkomendasikan menggunakan plugin native SQLite / Room (mis. `cordova-sqlite-storage` atau plugin Capacitor SQLite) dan berpindah dari `sql.js` ke native SQLite untuk performa dan persistensi.

Backup & Restore
- Gunakan fitur Admin -> Backup / Restore untuk ekspor `.sqlite` atau base64.

Catatan keamanan & produksi:
- Password disimpan dengan hashing SHA-256 (tanpa salt) di prototype; untuk produksi gunakan hashing ter-salt (PBKDF2/Argon2) dan mekanisme penyimpanan yang lebih aman.
- Untuk penggunaan di Android secara offline jangka panjang, gunakan Capacitor + native SQLite/Room.


Lisensi: contoh bebas pakai untuk pengembangan internal.
# Test