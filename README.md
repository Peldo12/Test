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

## Building Android package (APK/AAB)

There are two ways to produce an Android package from this project:

1) Local (recommended if you have Android Studio)

- Install prerequisites: Android Studio, Android SDK (API 33+), JDK 11+.
- Ensure Node dependencies are installed: `npm ci`.
- Prepare web assets: `npm run prepare:web` (this copies web files to `www/`).
- Scaffold native project (already done in the `chore/mobile-banner` branch):
	- `npx cap add android` (if not present)
	- `npx cap copy android`
- Open the generated `android/` project in Android Studio and build: `Build -> Generate Signed Bundle / APK...`.

2) CI (GitHub Actions)

- This repository includes a workflow `.github/workflows/android-build.yml` that prepares web assets and builds debug/release APKs using Gradle on GitHub Actions. Runs produce artifacts you can download from the Actions run.
- Note: Release APKs produced by CI may be unsigned. To publish to Play Store you need to sign them using your keystore. You can add automatic signing in the workflow by storing the keystore and passwords as GitHub Secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`).

If you want, I can:
- Add automatic signing steps to the workflow (you'll need to provide keystore secrets), or
- Clean the `android/` folder out of the repo and only rely on CI builds.


Lisensi: contoh bebas pakai untuk pengembangan internal.
# Test