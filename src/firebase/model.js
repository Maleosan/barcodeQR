import { TX } from '../domain.js';

export function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function itemDocumentId(code) {
  const normalized = String(code || '').trim();
  if (!normalized) throw new Error('Kode barang wajib diisi.');
  return encodeURIComponent(normalized);
}

export function toIsoDate(value, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function itemFromFirestore(snapshot) {
  const data = typeof snapshot.data === 'function' ? snapshot.data() : snapshot.data || snapshot;
  const id = snapshot.id || data.id || itemDocumentId(data.kodeBarang || data.code);
  return {
    id,
    code: String(data.kodeBarang ?? data.code ?? '').trim(),
    barcode: String(data.barcode ?? data.kodeBarang ?? data.code ?? '').trim(),
    name: String(data.namaBarang ?? data.name ?? '').trim(),
    category: String(data.kategori ?? data.category ?? 'Lainnya'),
    unit: String(data.satuan ?? data.unit ?? 'PCS'),
    location: String(data.lokasi ?? data.location ?? '-'),
    stock: Number(data.stok ?? data.stock ?? 0),
    minimum: Number(data.stokMinimum ?? data.minimum ?? 0),
    price: Number(data.harga ?? data.price ?? 0),
    photo: data.photo ?? '',
    active: data.active !== false,
    generated: Boolean(data.generated),
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt || data.createdAt),
    updatedBy: data.updatedBy || ''
  };
}

export function itemToFirestore(item, user = {}, timestamps = {}) {
  return {
    kodeBarang: item.code,
    barcode: item.barcode || item.code,
    namaBarang: item.name,
    kategori: item.category,
    satuan: item.unit,
    stok: Number(item.stock),
    stokMinimum: Number(item.minimum),
    harga: Number(item.price || 0),
    lokasi: item.location,
    photo: item.photo || '',
    active: item.active !== false,
    generated: Boolean(item.generated),
    createdAt: timestamps.createdAt || item.createdAt,
    updatedAt: timestamps.updatedAt || item.updatedAt,
    updatedBy: user.uid || item.updatedBy || ''
  };
}

export function transactionTypeToFirestore(type) {
  if (type === TX.IN) return 'TAMBAH';
  if (type === TX.OUT) return 'KURANG';
  if (type === TX.STOCK_OPNAME) return 'STOK_OPNAME';
  return type === TX.ADJUST ? 'PENYESUAIAN' : String(type || '');
}

export function transactionTypeFromFirestore(type) {
  if (type === 'TAMBAH') return TX.IN;
  if (type === 'KURANG') return TX.OUT;
  if (type === 'STOK_OPNAME') return TX.STOCK_OPNAME;
  if (type === 'PENYESUAIAN') return TX.ADJUST;
  return type;
}

export function transactionFromFirestore(snapshot) {
  const data = typeof snapshot.data === 'function' ? snapshot.data() : snapshot.data || snapshot;
  return {
    id: snapshot.id || data.id,
    itemId: data.itemId || itemDocumentId(data.kodeBarang || data.code),
    code: data.kodeBarang ?? data.code ?? '',
    itemName: data.namaBarang ?? data.itemName ?? '',
    category: data.kategori ?? data.category ?? '-',
    location: data.lokasi ?? data.location ?? '-',
    type: transactionTypeFromFirestore(data.jenis ?? data.type),
    amount: Number(data.jumlah ?? data.amount ?? data.selisih ?? 0),
    before: Number(data.stokSebelum ?? data.before ?? 0),
    counted: data.jumlahFisik ?? data.counted,
    difference: data.selisih ?? data.difference,
    after: Number(data.stokSesudah ?? data.after ?? 0),
    userId: data.originalUserId || data.userId || '',
    user: data.originalUserName || data.userName || data.user || '',
    userEmail: data.originalUserEmail || data.userEmail || '',
    note: data.keterangan ?? data.note ?? '',
    createdAt: toIsoDate(data.timestamp || data.createdAt)
  };
}

export function userProfileFromFirestore(snapshot, authUser = {}) {
  const data = typeof snapshot?.data === 'function' ? snapshot.data() : snapshot?.data || snapshot || {};
  const email = data.email || authUser.email || '';
  return {
    uid: data.uid || snapshot?.id || authUser.uid || '',
    displayName: data.displayName || authUser.displayName || email || 'User',
    email,
    photoURL: data.photoURL || authUser.photoURL || '',
    role: data.role === 'admin' ? 'admin' : 'user',
    primaryAdmin: Boolean(data.primaryAdmin),
    adminRequest: Boolean(data.adminRequest),
    adminRequestStatus: data.adminRequestStatus || 'none',
    adminRequestedAt: data.adminRequestedAt ? toIsoDate(data.adminRequestedAt) : '',
    createdAt: data.createdAt ? toIsoDate(data.createdAt) : '',
    lastLoginAt: data.lastLoginAt ? toIsoDate(data.lastLoginAt) : ''
  };
}
