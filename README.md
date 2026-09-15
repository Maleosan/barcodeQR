# StokQR Web

Aplikasi stok gudang berbasis web/PWA yang responsif untuk desktop, Android, iPhone, dan tablet. Implementasi Android native sebelumnya telah dihapus sesuai perubahan arah proyek.

## Audit dan keputusan teknologi

Repositori awal hanya berisi aplikasi Android Kotlin/Compose. Karena aplikasi kini harus berjalan lintas perangkat dan implementasi native tidak ingin dipertahankan, proyek Android dibersihkan dan diganti satu proyek web.

Stack MVP sengaja sederhana dan tanpa dependency eksternal:

- **HTML, CSS, dan JavaScript ES modules**: tidak memerlukan bundler atau registry package.
- **IndexedDB repository**: database transaksional browser untuk MVP offline/single-device.
- **Service layer**: validasi dan use case terpisah dari IndexedDB agar repository dapat diganti REST API/backend kelak.
- **MediaDevices + Barcode Detection API**: kamera belakang dan deteksi multi-format (QR, EAN, UPC, Code 128/39, serta format lain yang tersedia di browser).
- **QR encoder lokal**: QR identifier dibuat tanpa mengirim data ke layanan luar.
- **Web App Manifest + Service Worker**: shell aplikasi dapat dipasang sebagai PWA dan dibuka kembali secara offline.
- **Node HTTP/HTTPS server bawaan**: development server tanpa instalasi package.

### Trade-off database MVP

IndexedDB reliable dan atomik di satu browser, serta tetap berfungsi tanpa internet. Namun data **tidak otomatis tersedia di perangkat lain**, dapat hilang bila storage browser dibersihkan, dan bukan database produksi multi-user. Seluruh UI menggunakan `InventoryService` dan kontrak repository sehingga fase backend dapat mengganti `IndexedDbInventoryRepository` dengan REST repository tanpa menulis ulang alur UI. Sinkronisasi offline belum dibuat agar tidak menciptakan transaksi ganda sebelum desain idempotency/server tersedia.

## Struktur

```text
public/
├── index.html              # entry point
├── styles.css              # UI responsif desktop/mobile
├── manifest.webmanifest    # instalasi PWA
├── service-worker.js       # cache application shell
└── src/
    ├── app.js              # layar dan navigasi
    ├── database.js         # IndexedDB repository + transaksi atomik
    ├── inventory-service.js# validasi/use cases
    ├── scanner.js          # kamera + multi-format scanner
    └── qr.js               # QR generator lokal
server.mjs                  # development HTTP/HTTPS server
scripts/create-dev-cert.sh  # sertifikat HTTPS LAN untuk kamera HP
tests/                      # unit test Node
```

## Skema data

- `items`: `id`, `code` (unique), `name`, `category`, `unit`, `location`, `stock`, `minimumStock`, `photo`, `active`, `createdAt`, `updatedAt`.
- `transactions`: `id`, `itemId`, `itemCode`, `itemName`, `type`, `quantity`, `stockBefore`, `stockAfter`, `createdAt`, `note`.

Update stok dan insert transaksi dilakukan dalam **satu transaction IndexedDB read-write**. Stok negatif ditolak secara default.

## Menjalankan di komputer

Prasyarat: Node.js 20 atau lebih baru. Tidak perlu `npm install`.

```bash
npm test
npm run dev
```

Buka `http://localhost:4173`. Server bind ke `0.0.0.0` dan menampilkan URL IP LAN untuk perangkat lain.

## Menguji kamera dari HP

`getUserMedia` memerlukan secure context. `localhost` aman di komputer, tetapi URL IP LAN melalui HTTP biasanya tidak diberi akses kamera. Buat sertifikat development untuk IP komputer:

```bash
./scripts/create-dev-cert.sh 192.168.1.10
npm run dev:https
```

1. Ganti IP dengan alamat LAN komputer yang dicetak oleh server.
2. Salin dan percayai `certs/dev-cert.pem` pada HP testing, atau gunakan sertifikat development dari CA lokal seperti `mkcert`.
3. Buka `https://192.168.1.10:8443` dari HP pada Wi-Fi yang sama.
4. Berikan izin kamera, lalu buka **Scan Stock**.

Barcode Detection API bergantung pada browser. Chrome/Edge Android terbaru biasanya menjadi target development paling praktis. UI selalu menyediakan input kode manual bila API scanner tidak tersedia. Untuk dukungan produksi iOS lintas versi yang konsisten, decoder WASM/ZXing perlu ditambahkan setelah akses package/vendor artifact tersedia; arsitektur `WebScanner` mengisolasi perubahan tersebut.

## Tahapan yang dapat diuji

1. Master barang dan IndexedDB: tambah, edit, kode unik, status aktif.
2. Scanner: barcode/QR ditemukan atau langsung masuk form **Daftarkan Barang**.
3. QR: tampil, download SVG, cetak, dan Web Share jika tersedia.
4. Stok: masuk/keluar, larangan negatif, transaksi atomik.
5. Scan Stock: simpan lalu kamera otomatis aktif untuk barang berikutnya.
6. Dashboard dan riwayat transaksi.
