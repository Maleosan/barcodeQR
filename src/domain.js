export const TX = Object.freeze({ IN: 'STOK MASUK', OUT: 'STOK KELUAR', ADJUST: 'PENYESUAIAN' });
export const SCAN_FORMATS = Object.freeze(['QR_CODE', 'EAN_13', 'EAN_8', 'UPC_A', 'CODE_128', 'CODE_39']);
export function cleanCode(value) { return String(value ?? '').trim(); }
export function stockStatus(item) { return item.stock <= 0 ? 'HABIS' : item.stock <= item.minimum ? 'MENIPIS' : 'AMAN'; }
export function nextGeneratedCode(items) {
  const highest = items.reduce((max, item) => {
    const match = /^BRG-(\d{5})$/.exec(item.code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `BRG-${String(highest + 1).padStart(5, '0')}`;
}
export function normalizeItem(input, previous = {}) {
  const now = new Date().toISOString();
  const item = {
    ...previous,
    id: previous.id || input.id || crypto.randomUUID(),
    code: cleanCode(input.code), name: String(input.name || '').trim(),
    category: String(input.category || '').trim() || 'Lainnya', unit: String(input.unit || '').trim() || 'PCS',
    location: String(input.location || '').trim() || '-', stock: Number(input.stock ?? previous.stock ?? 0),
    minimum: Number(input.minimum ?? previous.minimum ?? 0), photo: input.photo ?? previous.photo ?? '',
    active: input.active ?? previous.active ?? true, generated: input.generated ?? previous.generated ?? false,
    createdAt: previous.createdAt || now, updatedAt: now
  };
  if (!item.code || !item.name) throw new Error('Kode dan nama barang wajib diisi.');
  if (!Number.isFinite(item.stock) || !Number.isFinite(item.minimum) || item.stock < 0 || item.minimum < 0) throw new Error('Stok dan minimum harus berupa angka positif.');
  return item;
}
export function calculateTransaction(stock, type, amount) {
  const qty = Number(amount);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Jumlah harus lebih dari 0.');
  const after = type === TX.IN ? stock + qty : type === TX.OUT ? stock - qty : qty;
  if (after < 0) throw new Error('Stok tidak mencukupi.');
  return { before: stock, after, amount: type === TX.ADJUST ? after - stock : qty };
}
export function filterTransactions(rows, period, query = '', now = new Date()) {
  const q = query.toLowerCase(); const start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  if (period === '7days') start.setDate(start.getDate() - 7);
  if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  return rows.filter(row => (!q || `${row.itemName} ${row.code}`.toLowerCase().includes(q)) && (period === 'all' || new Date(row.createdAt) >= start));
}
export function inventoryCsv(items) {
  const esc = value => `"${String(value).replaceAll('"', '""')}"`;
  return ['Kode,Nama,Kategori,Lokasi,Stok,Minimum,Status', ...items.map(i => [i.code,i.name,i.category,i.location,i.stock,i.minimum,stockStatus(i)].map(esc).join(','))].join('\n');
}
export function dashboardStats(items) {
  const active = items.filter(i => i.active);
  return { totalItems: active.length, totalStock: active.reduce((n,i)=>n+i.stock,0), low: active.filter(i=>stockStatus(i)==='MENIPIS').length, empty: active.filter(i=>stockStatus(i)==='HABIS').length };
}
