# StokQR — Aplikasi Stok Gudang

Static web/PWA untuk master barang, scan barcode/QR, stock opname cepat, transaksi stok, dashboard, dan laporan CSV. Aplikasi ditujukan untuk desktop, Android, iPhone, dan tablet; data MVP disimpan lokal per browser.

## Teknologi

- HTML, CSS, dan JavaScript ES modules tanpa framework/bundler.
- IndexedDB dengan repository layer; stok dan transaksi ditulis atomik.
- `@zxing/browser` 0.1.5 dari jsDelivr sebagai decoder utama multi-format. `BarcodeDetector` hanya fallback ketika CDN gagal dan browser mendukungnya.
- QR encoder lokal untuk identifier `BRG-xxxxx`.
- Web App Manifest dan Service Worker untuk PWA/application shell offline.
- Node.js development server tanpa dependency npm.

> IndexedDB mempertahankan data setelah refresh tetapi bersifat single-device. Menghapus data situs akan menghapus inventori. Repository layer dapat diganti backend kemudian tanpa mengubah seluruh UI; versi ini sengaja tidak memiliki sinkronisasi.

## Struktur

```text
index.html / styles.css         entry point dan UI
src/core/                      konstanta dan aturan stok
src/data/                      repository IndexedDB
src/services/                  inventory, scanner, QR, CSV
src/ui/                        template/presentation helper
assets/icons/                  ikon PWA
service-worker.js              offline application shell
tests/                         unit test Node
server.mjs                     server HTTP/HTTPS development
```

## Menjalankan dan testing

Node.js 20+ diperlukan. Tidak ada package yang harus di-install, tetapi `npm install` aman dijalankan.

```bash
npm install
npm test
npm run check
npm run dev
```

Buka `http://localhost:4173`. Server bind ke `0.0.0.0` dan mencetak alamat LAN.

## Scanner di HP dan HTTPS

Kamera browser membutuhkan secure context. GitHub Pages sudah HTTPS. Untuk testing Wi-Fi lokal:

```bash
./scripts/create-dev-cert.sh 192.168.1.100
npm run dev:https
```

Percayai `certs/dev-cert.pem` pada perangkat testing, lalu buka `https://192.168.1.100:8443`. Izinkan kamera dan gunakan halaman **Scan Stock**. Decoder ZXing membutuhkan koneksi saat pertama kali dimuat dari CDN; setelah termuat, browser dapat menyimpannya dalam HTTP cache. Barcode Detection fallback berbeda dukungannya antarbrowser. Chrome/Edge Android terbaru direkomendasikan; Safari/iOS harus diuji pada versi target.

Format yang diminta: QR Code, EAN-13, EAN-8, UPC-A/E, Code 128, Code 39, Codabar, ITF, Data Matrix, PDF417, dan Aztec.

## GitHub Pages

Semua asset memakai path relatif agar kompatibel dengan `/barcodeQR/`. Workflow `.github/workflows/pages.yml` menguji lalu mengunggah root static project saat push ke `main`. Atur **Settings → Pages → Source: GitHub Actions**. URL produksi:

`https://maleosan.github.io/barcodeQR/`

README hanya dokumentasi developer; `index.html` adalah halaman aplikasi.
