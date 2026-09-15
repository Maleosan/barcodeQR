# StokQR

**StokQR** adalah aplikasi stok gudang single-device berbasis web. UI langsung terbuka dari `index.html`; README ini hanya dokumentasi developer. Data barang dan transaksi disimpan lokal dalam IndexedDB dan tidak disinkronkan ke cloud/perangkat lain.

## Fitur

- Dashboard stok, master barang, status aktif, pencarian/filter, dan detail barang.
- Scan QR dan barcode 1D (EAN-13, EAN-8, UPC-A, Code 128, Code 39, serta format umum lain) dengan kamera belakang melalui `@zxing/browser`.
- Kode internal `BRG-00001` dan QR yang hanya berisi kode barang; tampilkan, download, cetak, atau bagikan.
- Stok masuk/keluar/penyesuaian atomik, proteksi stok negatif, stock opname cepat, riwayat, dan export CSV.
- Responsive desktop/mobile, installable PWA, dan application shell offline.

## Menjalankan

Tidak ada build step atau framework.

```bash
npm install
npm run dev
```

Buka `http://localhost:4173`. `npm install` hanya memvalidasi metadata karena runtime aplikasi tidak membutuhkan package lokal.

## Testing

```bash
npm test
npm run check
```

Test mencakup master barang, kode, payload QR, format scan, hasil tidak ditemukan, transaksi, stok negatif, riwayat, dashboard, dan CSV.

## Scanner dan keterbatasan browser

Klik **Scan Stock → Mulai Kamera**, izinkan kamera, lalu arahkan kamera belakang ke kode. Decoder `@zxing/browser` dan generator `qrcode` dimuat dari jsDelivr dan akan dicache service worker setelah kunjungan online pertama. UI dan data tetap tersedia offline; scanner/QR juga offline sesudah library berhasil tercache. Input manual tersedia jika izin kamera ditolak. Kamera browser hanya tersedia pada secure context: HTTPS atau `localhost`. Performa dipengaruhi kamera, pencahayaan, fokus, dan browser.

### Uji dari HP pada Wi-Fi yang sama

HTTP melalui alamat LAN tidak dianggap secure context. Gunakan HTTPS lokal, misalnya dengan `mkcert` dan server static HTTPS favorit Anda:

```bash
mkcert -install
mkcert 192.168.1.100 localhost
npx http-server . -S -C 192.168.1.100+1.pem -K 192.168.1.100+1-key.pem -p 4173
```

Buka `https://192.168.1.100:4173` di HP. Ganti IP dengan hasil `hostname -I`, dan pastikan sertifikat root `mkcert` dipercaya oleh HP. Alternatif paling mudah adalah deploy ke GitHub Pages yang sudah HTTPS.

## Deploy GitHub Pages

Workflow `.github/workflows/pages.yml` otomatis menerbitkan isi repository saat push ke `main`. Aktifkan **Settings → Pages → Source: GitHub Actions**. Semua asset memakai URL relatif dan service worker menghitung base path, sehingga berjalan pada `https://maleosan.github.io/barcodeQR/`.

## Struktur

- `index.html`, `styles.css` — shell dan desain responsive.
- `src/app.js` — rendering, navigasi, dan orkestrasi use case.
- `src/domain.js` — aturan bisnis murni.
- `src/repository.js` — repository IndexedDB yang dapat diganti backend kelak.
- `src/scanner.js` — adapter kamera/ZXing.
- `manifest.webmanifest`, `service-worker.js`, `assets/icons/` — PWA.
- `tests/` — test aturan bisnis dan alur scan.
- `server.mjs` — development server tanpa framework.
