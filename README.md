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

Lisensi: contoh bebas pakai untuk pengembangan internal.
# Test