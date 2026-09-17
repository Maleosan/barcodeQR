# StokQR

StokQR adalah aplikasi stok gudang multi-user berbasis Firebase. Google Authentication menangani login, Cloud Firestore menjadi source of truth untuk barang/transaksi/user, dan listener realtime memperbarui perangkat lain tanpa reload. IndexedDB lama hanya dibaca untuk migrasi opsional dan tidak lagi menjadi database utama.

## Fitur

- Login Google resmi, profil, logout, role `user`/`admin`, request Admin, dan approval/reject oleh Admin.
- Admin utama ditentukan melalui environment variable `VITE_ADMIN_EMAIL` dan dilindungi oleh Firestore Security Rules; nilainya tidak disimpan di source code atau bundle publik.
- Dashboard realtime, master/detail barang, scan QR/barcode, tambah/kurang stok, dan Stok Opname berbasis jumlah fisik.
- Perubahan stok dan pencatatan transaksi dijalankan bersama dalam Firestore transaction untuk mencegah race condition.
- Riwayat transaksi dengan filter tanggal, user, jenis, barang, dan kategori.
- Laporan, CSV/Excel/print, import Excel, template, QR internal, data demo, kamera, suara, getar, dan PWA tetap tersedia.
- Indikator koneksi membedakan data server dan kondisi offline; write ditolak saat browser offline agar user tidak mengira data sudah tersimpan.
- Migrasi IndexedDB → Firebase bersifat opt-in, tidak menghapus data lokal, dan tidak menimpa dokumen cloud yang sudah ada.

Semua layanan yang dipakai tersedia pada Firebase Spark Plan: Authentication dan Cloud Firestore. Tidak ada Cloud Functions.

## Konfigurasi Firebase

Project ini tetap berupa aplikasi statis, tetapi memiliki build script ringan untuk membuat konfigurasi runtime dari environment. Salin `.env.example` menjadi `.env`, lalu isi nilai berikut. File `.env`, konfigurasi runtime, rules hasil generate, dan folder `dist/` diabaikan Git.

1. Buat project di [Firebase Console](https://console.firebase.google.com/).
2. Tambahkan Web app, lalu salin konfigurasi yang diberikan.
3. Aktifkan **Authentication → Sign-in method → Google**.
4. Tambahkan domain produksi (misalnya `maleosan.github.io`) ke **Authentication → Settings → Authorized domains**.
5. Buat database Cloud Firestore.
6. Buat `.env` berdasarkan `.env.example`:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_EMAIL=
```

7. Generate konfigurasi dan rules, lalu deploy rules sebelum aplikasi digunakan:

```bash
npm run configure
npx firebase-tools login
npx firebase-tools use YOUR_PROJECT_ID
npx firebase-tools deploy --only firestore:rules
```

`VITE_ADMIN_EMAIL` hanya dipakai untuk menghasilkan `.firebase/firestore.rules` secara lokal/deployment. Alamat tersebut tidak dimasukkan ke `firebase-config.js` atau `dist/`. Jangan menjalankan aplikasi produksi dengan rules test mode.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:4173`. Login Google perlu `localhost` tercantum sebagai authorized domain (umumnya sudah tersedia pada project Firebase baru).

## Testing dan audit statis

```bash
npm test
npm run check
```

Test meliputi aturan stok/opname lama, scan, import/export, pemetaan model Firestore, role Admin utama, identitas dokumen, kompatibilitas transaksi lama, dan invariant penting pada Security Rules. Uji integrasi dua browser memerlukan project Firebase sungguhan:

1. Login dua akun berbeda pada browser/profil berbeda.
2. Buka barang yang sama di kedua browser.
3. Tambah `+10` di browser A; pastikan browser B berubah tanpa reload.
4. Kurangi `-3` di browser B; pastikan browser A melihat stok terbaru.
5. Uji Stok Opname dan pastikan transaksi menyimpan stok sebelum, jumlah fisik, selisih, serta stok akhir.
6. Login menggunakan akun yang nilainya telah diatur pada `VITE_ADMIN_EMAIL`; pastikan menu Admin muncul.
7. Request Admin dari user biasa, lalu Accept/Reject dari Admin dan verifikasi perubahan role realtime.

## Scanner dan mobile

Kamera browser membutuhkan secure context: HTTPS atau `localhost`. Input manual tetap tersedia bila izin kamera ditolak. Decoder ZXing, generator QR, Excel, dan Firebase SDK dimuat dari CDN dan dicache oleh service worker setelah kunjungan online pertama. Operasi write stok tetap memerlukan koneksi Firebase.

Untuk tes HP di jaringan lokal, gunakan HTTPS lokal atau deploy ke GitHub Pages. Contoh dengan `mkcert`:

```bash
mkcert -install
mkcert 192.168.1.100 localhost
npx http-server . -S -C 192.168.1.100+1.pem -K 192.168.1.100+1-key.pem -p 4173
```

## Deploy GitHub Pages

Workflow `.github/workflows/pages.yml` menjalankan build lalu menerbitkan hanya folder `dist/` saat push ke `main`. Aktifkan **Settings → Pages → Source: GitHub Actions**, tambahkan `VITE_FIREBASE_*` sebagai Repository Variables, dan simpan `VITE_ADMIN_EMAIL` sebagai Actions Secret. Pastikan domain Pages telah diotorisasi di Firebase Authentication. Deploy Firestore Rules tetap dilakukan melalui Firebase CLI setelah `npm run configure` pada lingkungan aman yang memiliki `.env`.

## Struktur

- `index.html`, `styles.css` — login shell, aplikasi, dan desain responsif.
- `src/app.js` — navigasi, auth bootstrap, realtime rendering, admin, migrasi, dan use case UI.
- `src/domain.js` — aturan bisnis murni dan laporan.
- `src/firebase/config.js` — inisialisasi Firebase modular.
- `src/firebase/auth.js` — Google sign-in, redirect/popup, dan logout.
- `src/firebase/firestore.js` — repository Firestore realtime dan transaksi atomik.
- `src/firebase/model.js` — pemetaan model aplikasi ↔ Firestore.
- `src/repository.js` — repository IndexedDB lama, dipertahankan hanya untuk migrasi aman dan regression test.
- `.env.example`, `scripts/` — template environment dan generator build/config aman.
- `firestore.rules.template`, `firebase.json` — template aturan akses dan konfigurasi deploy.
- `src/scanner.js`, `src/excel.js` — scanner dan Excel/report.
- `manifest.webmanifest`, `service-worker.js`, `assets/icons/` — PWA.
- `tests/` — test bisnis, scanner, export, model Firebase, dan audit rules.
