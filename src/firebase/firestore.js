import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { calculateStockOpname, calculateTransaction, normalizeItem, TX } from '../domain.js';
import {
  itemDocumentId,
  itemFromFirestore,
  itemToFirestore,
  transactionFromFirestore,
  transactionTypeToFirestore,
  userProfileFromFirestore
} from './model.js';

const chunk = (rows, size = 400) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

function authIdentity(user) {
  return {
    userId: user.uid,
    userName: user.displayName || user.email || 'User',
    userEmail: user.email || ''
  };
}

function transactionRecord(ref, item, type, calc, note, user) {
  const identity = authIdentity(user);
  return {
    id: ref.id,
    itemId: item.id,
    kodeBarang: item.code,
    namaBarang: item.name,
    kategori: item.category || '-',
    lokasi: item.location || '-',
    jenis: transactionTypeToFirestore(type),
    jumlah: Number(calc.amount),
    stokSebelum: Number(calc.before),
    stokSesudah: Number(calc.after),
    jumlahFisik: calc.counted,
    selisih: calc.difference,
    ...identity,
    timestamp: serverTimestamp(),
    keterangan: String(note || '').trim()
  };
}

export class FirestoreRepository {
  constructor(db, user) {
    if (!db || !user?.uid) throw new Error('Firestore membutuhkan user yang sudah login.');
    this.db = db;
    this.user = user;
    this.items = [];
    this.transactions = [];
    this.users = [];
    this.presence = [];
    this.itemsLoaded = false;
    this.transactionsLoaded = false;
    this.unsubscribers = [];
    this.connectionListener = () => {};
  }

  assertOnline() {
    if (globalThis.navigator?.onLine === false) throw new Error('Perangkat sedang offline. Data belum disimpan ke Firebase.');
  }

  connection(online, message = '') {
    this.connectionListener({ online, message });
  }

  async startRealtime({ onData = () => {}, onConnection = () => {}, onProfile = () => {} } = {}) {
    this.stopRealtime();
    this.connectionListener = onConnection;
    let resolveItems; let resolveTransactions;
    const itemsReady = new Promise(resolve => { resolveItems = resolve; });
    const transactionsReady = new Promise(resolve => { resolveTransactions = resolve; });
    const itemsUnsubscribe = onSnapshot(collection(this.db, 'barang'), { includeMetadataChanges: true }, snapshot => {
      this.items = snapshot.docs.map(itemFromFirestore).sort((a,b)=>a.name.localeCompare(b.name,'id'));
      this.itemsLoaded = true;
      resolveItems?.(); resolveItems = null;
      this.connection(!snapshot.metadata.fromCache && navigator.onLine, snapshot.metadata.hasPendingWrites ? 'Menyinkronkan perubahan…' : 'Terhubung ke Firebase');
      onData('items');
    }, error => { this.connection(false, error.message); resolveItems?.(); resolveItems = null; });
    const transactionQuery = query(collection(this.db, 'transaksi'), orderBy('timestamp', 'desc'));
    const transactionsUnsubscribe = onSnapshot(transactionQuery, { includeMetadataChanges: true }, snapshot => {
      this.transactions = snapshot.docs.map(transactionFromFirestore).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      this.transactionsLoaded = true;
      resolveTransactions?.(); resolveTransactions = null;
      this.connection(!snapshot.metadata.fromCache && navigator.onLine, snapshot.metadata.hasPendingWrites ? 'Menyinkronkan perubahan…' : 'Terhubung ke Firebase');
      onData('transactions');
    }, error => { this.connection(false, error.message); resolveTransactions?.(); resolveTransactions = null; });
    const profileUnsubscribe = onSnapshot(doc(this.db, 'users', this.user.uid), snapshot => {
      if (snapshot.exists()) onProfile(userProfileFromFirestore(snapshot, this.user));
    }, error => this.connection(false, error.message));
    const presenceUnsubscribe = onSnapshot(collection(this.db, 'presence'), snapshot => {
      this.presence = snapshot.docs.map(row => ({ uid: row.id, lastSeenAt: row.data().lastSeenAt?.toDate?.()?.toISOString?.() || '' }));
      onData('presence');
    }, error => this.connection(false, error.message));
    this.unsubscribers.push(itemsUnsubscribe, transactionsUnsubscribe, profileUnsubscribe, presenceUnsubscribe);
    await Promise.all([itemsReady, transactionsReady]);
  }

  stopRealtime() {
    this.unsubscribers.splice(0).forEach(unsubscribe => unsubscribe?.());
  }

  async allItems() {
    if (!this.itemsLoaded) {
      const snapshot = await getDocs(collection(this.db, 'barang'));
      this.items = snapshot.docs.map(itemFromFirestore).sort((a,b)=>a.name.localeCompare(b.name,'id'));
      this.itemsLoaded = true;
    }
    return [...this.items];
  }

  async allTransactions() {
    if (!this.transactionsLoaded) {
      const snapshot = await getDocs(query(collection(this.db, 'transaksi'), orderBy('timestamp', 'desc')));
      this.transactions = snapshot.docs.map(transactionFromFirestore).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      this.transactionsLoaded = true;
    }
    return [...this.transactions];
  }

  async findByCode(code) {
    const id = itemDocumentId(code);
    const cached = this.items.find(item => item.id === id || item.code === String(code).trim());
    if (cached) return cached;
    const snapshot = await getDoc(doc(this.db, 'barang', id));
    return snapshot.exists() ? itemFromFirestore(snapshot) : undefined;
  }

  async getItem(id) {
    const cached = this.items.find(item => item.id === id);
    if (cached) return cached;
    const snapshot = await getDoc(doc(this.db, 'barang', id));
    return snapshot.exists() ? itemFromFirestore(snapshot) : undefined;
  }

  async saveItem(input) {
    this.assertOnline();
    const previousId = input.id || '';
    const draft = normalizeItem(input, previousId ? await this.getItem(previousId) : undefined);
    const nextId = itemDocumentId(draft.code);
    const nextReference = doc(this.db, 'barang', nextId);
    let result;
    await runTransaction(this.db, async atomic => {
      if (!previousId) {
        const duplicate = await atomic.get(nextReference);
        if (duplicate.exists()) throw new Error('Kode barang sudah digunakan.');
        result = { ...draft, id: nextId };
        atomic.set(nextReference, itemToFirestore(result, this.user, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        return;
      }

      const previousReference = doc(this.db, 'barang', previousId);
      const previousSnapshot = await atomic.get(previousReference);
      if (!previousSnapshot.exists()) throw new Error('Barang tidak ditemukan. Muat ulang data lalu coba lagi.');
      let duplicate = null;
      if (previousId !== nextId) duplicate = await atomic.get(nextReference);
      if (duplicate?.exists()) throw new Error('Kode barang sudah digunakan.');
      const serverItem = itemFromFirestore(previousSnapshot);
      result = normalizeItem({ ...input, stock: serverItem.stock }, serverItem);
      result.id = nextId;
      const data = itemToFirestore(result, this.user, {
        createdAt: previousSnapshot.data().createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      atomic.set(nextReference, data, { merge: previousId === nextId });
      if (previousId !== nextId) atomic.delete(previousReference);
    });
    return result;
  }

  async deleteItem(id) {
    this.assertOnline();
    await deleteDoc(doc(this.db, 'barang', id));
  }

  async importItems(inputs) {
    this.assertOnline();
    const items = inputs.map(input => normalizeItem(input));
    const imported = [];
    for (const group of chunk(items, 200)) {
      let groupImported = [];
      await runTransaction(this.db, async atomic => {
        const references = group.map(item => doc(this.db, 'barang', itemDocumentId(item.code)));
        const snapshots = await Promise.all(references.map(reference => atomic.get(reference)));
        const created = [];
        snapshots.forEach((snapshot, index) => {
          if (snapshot.exists()) return;
          const item = group[index];
          item.id = references[index].id;
          atomic.set(references[index], itemToFirestore(item, this.user, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
          created.push(item);
        });
        groupImported = created;
      });
      imported.push(...groupImported);
    }
    return imported;
  }

  async transact(itemId, type, amount, note = '') {
    if (type === TX.STOCK_OPNAME) return this.stockOpname(itemId, amount, note);
    this.assertOnline();
    const itemRef = doc(this.db, 'barang', itemId);
    const transactionRef = doc(collection(this.db, 'transaksi'));
    let result;
    await runTransaction(this.db, async atomic => {
      const snapshot = await atomic.get(itemRef);
      if (!snapshot.exists()) throw new Error('Barang tidak ditemukan.');
      const item = itemFromFirestore(snapshot);
      const calc = calculateTransaction(item.stock, type, amount);
      atomic.update(itemRef, { stok: calc.after, updatedAt: serverTimestamp(), updatedBy: this.user.uid, lastTransactionId: transactionRef.id });
      atomic.set(transactionRef, transactionRecord(transactionRef, item, type, calc, note, this.user));
      result = { ...transactionFromFirestore({ id: transactionRef.id, data: () => ({ ...transactionRecord(transactionRef, item, type, calc, note, this.user), timestamp: new Date() }) }), createdAt: new Date().toISOString() };
    });
    return result;
  }

  async stockOpname(itemId, counted, note = '') {
    this.assertOnline();
    const itemRef = doc(this.db, 'barang', itemId);
    const transactionRef = doc(collection(this.db, 'transaksi'));
    let result;
    await runTransaction(this.db, async atomic => {
      const snapshot = await atomic.get(itemRef);
      if (!snapshot.exists()) throw new Error('Barang tidak ditemukan.');
      const item = itemFromFirestore(snapshot);
      const calc = calculateStockOpname(item.stock, counted);
      atomic.update(itemRef, { stok: calc.after, updatedAt: serverTimestamp(), updatedBy: this.user.uid, lastTransactionId: transactionRef.id });
      atomic.set(transactionRef, transactionRecord(transactionRef, item, TX.STOCK_OPNAME, calc, note, this.user));
      result = { ...transactionFromFirestore({ id: transactionRef.id, data: () => ({ ...transactionRecord(transactionRef, item, TX.STOCK_OPNAME, calc, note, this.user), timestamp: new Date() }) }), createdAt: new Date().toISOString() };
    });
    return result;
  }

  async registerCurrentUser(requestAdmin = false) {
    this.assertOnline();
    const reference = doc(this.db, 'users', this.user.uid);
    const presenceReference = doc(this.db, 'presence', this.user.uid);
    const writeProfile = primaryAdmin => runTransaction(this.db, async atomic => {
      const snapshot = await atomic.get(reference);
      const existing = snapshot.exists() ? snapshot.data() : null;
      const role = primaryAdmin ? 'admin' : existing?.role === 'admin' ? 'admin' : 'user';
      const pending = !primaryAdmin && role !== 'admin' && requestAdmin;
      const data = {
        uid: this.user.uid,
        displayName: this.user.displayName || this.user.email || 'User',
        email: this.user.email || '',
        photoURL: this.user.photoURL || '',
        role,
        primaryAdmin: primaryAdmin || Boolean(existing?.primaryAdmin),
        adminRequest: primaryAdmin ? false : pending ? true : Boolean(existing?.adminRequest),
        adminRequestStatus: primaryAdmin ? 'approved' : pending ? 'pending' : existing?.adminRequestStatus || 'none',
        createdAt: existing?.createdAt || serverTimestamp(),
        lastLoginAt: serverTimestamp()
      };
      if (pending) data.adminRequestedAt = serverTimestamp();
      atomic.set(reference, data, { merge: true });
      atomic.set(presenceReference, { uid: this.user.uid, lastSeenAt: serverTimestamp() }, { merge: true });
    });
    try {
      await writeProfile(true);
    } catch (error) {
      if (error?.code !== 'permission-denied') throw error;
      await writeProfile(false);
    }
    const snapshot = await getDoc(reference);
    return userProfileFromFirestore(snapshot, this.user);
  }

  async requestAdmin() {
    this.assertOnline();
    await updateDoc(doc(this.db, 'users', this.user.uid), { adminRequest: true, adminRequestStatus: 'pending', adminRequestedAt: serverTimestamp() });
  }

  async subscribeUsers(callback) {
    const unsubscribe = onSnapshot(collection(this.db, 'users'), snapshot => {
      this.users = snapshot.docs.map(row => userProfileFromFirestore(row)).sort((a,b)=>a.displayName.localeCompare(b.displayName,'id'));
      callback([...this.users]);
    }, error => this.connection(false, error.message));
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  async resolveAdminRequest(uid, approved) {
    this.assertOnline();
    const reference = doc(this.db, 'users', uid);
    await runTransaction(this.db, async atomic => {
      const snapshot = await atomic.get(reference);
      if (!snapshot.exists()) throw new Error('User tidak ditemukan.');
      const target = snapshot.data();
      if (target.primaryAdmin && !approved) throw new Error('Admin utama tidak dapat diturunkan menjadi User.');
      atomic.update(reference, {
        role: approved ? 'admin' : 'user',
        adminRequest: false,
        adminRequestStatus: approved ? 'approved' : 'rejected',
        adminResolvedAt: serverTimestamp(),
        adminResolvedBy: this.user.uid
      });
    });
  }

  activeUserCount() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return Math.max(1, this.presence.filter(user => user.lastSeenAt && new Date(user.lastSeenAt).getTime() >= cutoff).length);
  }

  async importLocalData(items, transactions = []) {
    this.assertOnline();
    const importedItems = await this.importItems(items);
    let importedTransactions = 0;
    const rows = transactions.filter(row => row.id);
    for (const group of chunk(rows, 200)) {
      let groupImported = 0;
      await runTransaction(this.db, async atomic => {
        const references = group.map(row => doc(this.db, 'transaksi', row.id));
        const snapshots = await Promise.all(references.map(reference => atomic.get(reference)));
        let created = 0;
        snapshots.forEach((snapshot, index) => {
          if (snapshot.exists()) return;
          const row = group[index], reference = references[index], migratedAt = new Date(row.createdAt || Date.now());
          atomic.set(reference, {
          id: row.id,
          itemId: itemDocumentId(row.code || row.itemId),
          kodeBarang: String(row.code || ''),
          namaBarang: String(row.itemName || ''),
          kategori: row.category || '-',
          lokasi: row.location || '-',
          jenis: transactionTypeToFirestore(row.type),
          jumlah: Number(row.amount || 0),
          stokSebelum: Number(row.before || 0),
          jumlahFisik: row.counted,
          selisih: row.difference,
          stokSesudah: Number(row.after || 0),
          userId: this.user.uid,
          userName: this.user.displayName || this.user.email || '',
          userEmail: this.user.email || '',
          originalUserId: row.userId || '',
          originalUserName: row.user || '',
          originalUserEmail: row.userEmail || '',
          timestamp: Timestamp.fromDate(Number.isNaN(migratedAt.getTime()) ? new Date() : migratedAt),
          keterangan: row.note || '',
          migratedFromIndexedDb: true
          });
          created += 1;
        });
        groupImported = created;
      });
      importedTransactions += groupImported;
    }
    return { items: importedItems.length, transactions: importedTransactions };
  }
}
