import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TX, normalizeItem } from '../src/domain.js';
import {
  itemDocumentId,
  itemFromFirestore,
  itemToFirestore,
  transactionFromFirestore,
  transactionTypeFromFirestore,
  transactionTypeToFirestore,
  userProfileFromFirestore
} from '../src/firebase/model.js';
import { firebaseClientConfig, writeFirestoreRules } from '../scripts/config.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('konfigurasi client hanya memuat VITE_FIREBASE dan tidak membocorkan email admin', () => {
  const config = firebaseClientConfig({ VITE_FIREBASE_API_KEY: 'key', VITE_FIREBASE_AUTH_DOMAIN: 'domain', VITE_FIREBASE_PROJECT_ID: 'project', VITE_FIREBASE_STORAGE_BUCKET: 'bucket', VITE_FIREBASE_MESSAGING_SENDER_ID: 'sender', VITE_FIREBASE_APP_ID: 'app', VITE_ADMIN_EMAIL: 'private@example.test' });
  assert.deepEqual(Object.keys(config), ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']);
  assert.doesNotMatch(JSON.stringify(config), /private@example\.test/);
});

test('kode barang menjadi document id Firestore yang konsisten dan aman untuk slash', () => {
  assert.equal(itemDocumentId(' BRG/001 '), 'BRG%2F001');
  assert.throws(() => itemDocumentId(''), /wajib/);
});

test('barang dapat dipetakan ke dan dari field Firestore tanpa kehilangan field lama', () => {
  const item = normalizeItem({ code: 'BRG-1', name: 'Kopi', category: 'Minuman', unit: 'PCS', stock: 12, minimum: 3, price: 4500, location: 'Rak A', photo: 'foto', active: true });
  const stored = itemToFirestore(item, { uid: 'u1' }, { createdAt: 'created', updatedAt: 'updated' });
  assert.deepEqual({ kodeBarang: stored.kodeBarang, namaBarang: stored.namaBarang, stok: stored.stok, harga: stored.harga, updatedBy: stored.updatedBy }, { kodeBarang: 'BRG-1', namaBarang: 'Kopi', stok: 12, harga: 4500, updatedBy: 'u1' });
  const restored = itemFromFirestore({ id: 'BRG-1', data: () => stored });
  assert.deepEqual({ code: restored.code, name: restored.name, stock: restored.stock, price: restored.price }, { code: 'BRG-1', name: 'Kopi', stock: 12, price: 4500 });
});

test('jenis transaksi aplikasi dan Firestore kompatibel dua arah', () => {
  assert.equal(transactionTypeToFirestore(TX.IN), 'TAMBAH');
  assert.equal(transactionTypeToFirestore(TX.OUT), 'KURANG');
  assert.equal(transactionTypeToFirestore(TX.STOCK_OPNAME), 'STOK_OPNAME');
  assert.equal(transactionTypeFromFirestore('PENYESUAIAN'), TX.ADJUST);
});

test('transaksi Firestore memuat actor, before, counted, difference, dan after', () => {
  const restored = transactionFromFirestore({ id: 'tx1', data: () => ({ itemId: 'BRG-1', kodeBarang: 'BRG-1', namaBarang: 'Kopi', jenis: 'STOK_OPNAME', jumlah: -3, stokSebelum: 20, jumlahFisik: 17, selisih: -3, stokSesudah: 17, userId: 'u1', userName: 'User', userEmail: 'user@example.test', timestamp: '2026-09-17T10:00:00.000Z', keterangan: 'Hitung fisik' }) });
  assert.deepEqual({ type: restored.type, before: restored.before, counted: restored.counted, difference: restored.difference, after: restored.after, userEmail: restored.userEmail }, { type: TX.STOCK_OPNAME, before: 20, counted: 17, difference: -3, after: 17, userEmail: 'user@example.test' });
});

test('profil memakai role dan penanda primaryAdmin yang tersimpan di Firestore', () => {
  const user = userProfileFromFirestore({ id: 'u1', data: () => ({ email: 'user@example.test', role: 'user', primaryAdmin: false }) });
  const admin = userProfileFromFirestore({ id: 'u2', data: () => ({ email: 'admin@example.test', role: 'admin', primaryAdmin: true }) });
  assert.deepEqual({ role: user.role, primaryAdmin: user.primaryAdmin }, { role: 'user', primaryAdmin: false });
  assert.deepEqual({ role: admin.role, primaryAdmin: admin.primaryAdmin }, { role: 'admin', primaryAdmin: true });
});

test('generator rules menolak VITE_ADMIN_EMAIL kosong atau tidak valid', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stokqr-rules-'));
  try {
    await assert.rejects(
      writeFirestoreRules(join(directory, 'firestore.rules'), { VITE_ADMIN_EMAIL: '' }, projectRoot),
      /VITE_ADMIN_EMAIL wajib diisi/
    );
    await assert.rejects(
      writeFirestoreRules(join(directory, 'firestore.rules'), { VITE_ADMIN_EMAIL: 'bukan-email' }, projectRoot),
      /alamat email admin yang valid/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('generator rules mengganti placeholder admin tanpa memasukkannya ke konfigurasi client', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stokqr-rules-'));
  const target = join(directory, 'firestore.rules');
  try {
    await writeFirestoreRules(target, { VITE_ADMIN_EMAIL: 'PRIMARY.ADMIN@example.test' }, projectRoot);
    const rules = await readFile(target, 'utf8');
    assert.match(rules, /request\.auth\.token\.email == "primary\.admin@example\.test"/);
    assert.doesNotMatch(rules, /__VITE_ADMIN_EMAIL_JSON__/);
    assert.doesNotMatch(JSON.stringify(firebaseClientConfig({ VITE_ADMIN_EMAIL: 'PRIMARY.ADMIN@example.test' })), /primary\.admin/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('security rules mewajibkan auth dan melindungi perubahan role', async () => {
  const rules = await readFile(new URL('../firestore.rules.template', import.meta.url), 'utf8');
  assert.doesNotMatch(rules, /allow\s+read\s*,\s*write\s*:\s*if\s+false/);
  assert.doesNotMatch(rules, /allow\s+read\s*,\s*write\s*:\s*if\s+true/);
  assert.match(rules, /request\.auth != null/);
  assert.match(rules, /__VITE_ADMIN_EMAIL_JSON__/);
  assert.match(rules, /primaryAdmin/);
  assert.match(rules, /request\.resource\.data\.role == resource\.data\.role/);
  assert.match(rules, /function validAdminResolution/);
  assert.match(rules, /resource\.data\.adminRequestStatus == 'pending'/);
  assert.match(rules, /request\.resource\.data\.adminResolvedBy == request\.auth\.uid/);
  assert.match(rules, /request\.resource\.data\.adminRequestStatus == 'approved'/);
  assert.match(rules, /request\.resource\.data\.adminRequestStatus == 'rejected'/);
});

test('security rules mengikat stok dan transaksi dalam satu atomic write', async () => {
  const rules = await readFile(new URL('../firestore.rules.template', import.meta.url), 'utf8');
  assert.match(rules, /existsAfter/);
  assert.match(rules, /getAfter/);
  assert.match(rules, /lastTransactionId == transactionId/);
  assert.match(rules, /changed\.hasOnly\(\['stok', 'updatedAt', 'updatedBy', 'lastTransactionId'\]\)/);
  assert.match(rules, /data\.kodeBarang == request\.resource\.data\.kodeBarang/);
  assert.match(rules, /validLiveTransaction\(transactionId\)/);
  assert.match(rules, /linkedItemMatchesTransaction\(transactionId\)/);
  assert.match(rules, /request\.resource\.data\.timestamp == request\.time/);
  assert.match(rules, /validMigratedTransaction/);
  assert.match(rules, /return isAdmin\(\) &&\s*request\.resource\.data\.migratedFromIndexedDb == true/);
  assert.match(rules, /jumlahFisik/);
  assert.match(rules, /stokSesudah == request\.resource\.data\.jumlahFisik/);
});

test('repository Firebase mempertahankan listener realtime dan transaksi atomik', async () => {
  const source = await readFile(new URL('../src/firebase/firestore.js', import.meta.url), 'utf8');
  assert.match(source, /onSnapshot\(collection\(this\.db, 'barang'\)/);
  assert.match(source, /onSnapshot\(transactionQuery/);
  assert.match(source, /await runTransaction\(this\.db/);
  assert.match(source, /calculateStockOpname\(item\.stock, counted\)/);
  assert.match(source, /lastTransactionId: transactionRef\.id/);
});
