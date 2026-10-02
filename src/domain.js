export const TX = Object.freeze({ IN: 'STOK MASUK', OUT: 'STOK KELUAR', ADJUST: 'PENYESUAIAN', STOCK_OPNAME: 'STOCK_OPNAME' });
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
    price: Number(input.price ?? previous.price ?? 0),
    minimum: Number(input.minimum ?? previous.minimum ?? 0), photo: input.photo ?? previous.photo ?? '',
    active: input.active ?? previous.active ?? true, generated: input.generated ?? previous.generated ?? false,
    createdAt: previous.createdAt || now, updatedAt: now
  };
  if (!item.code || !item.name) throw new Error('Kode dan nama barang wajib diisi.');
  if (!Number.isFinite(item.stock) || !Number.isFinite(item.minimum) || !Number.isFinite(item.price) || item.stock < 0 || item.minimum < 0 || item.price < 0) throw new Error('Stok, minimum, dan harga harus berupa angka positif.');
  return item;
}
export function calculateTransaction(stock, type, amount) {
  if (type === TX.STOCK_OPNAME) return calculateStockOpname(stock, amount);
  const qty = Number(amount);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Jumlah harus lebih dari 0.');
  if (![TX.IN, TX.OUT, TX.ADJUST].includes(type)) throw new Error('Jenis transaksi tidak valid.');
  const after = type === TX.IN ? stock + qty : type === TX.OUT ? stock - qty : qty;
  if (after < 0) throw new Error('Stok tidak mencukupi.');
  return { before: stock, after, amount: type === TX.ADJUST ? after - stock : qty };
}
export function calculateStockOpname(stock, counted) {
  if (counted === '' || counted === null || counted === undefined) throw new Error('Jumlah fisik wajib diisi.');
  const before = Number(stock); const physical = Number(counted);
  if (!Number.isFinite(before) || before < 0) throw new Error('Stok sistem tidak valid.');
  if (!Number.isFinite(physical) || physical < 0) throw new Error('Jumlah fisik harus berupa angka 0 atau lebih.');
  const difference = physical - before;
  return { before, counted: physical, difference, after: physical, amount: difference };
}
export function filterTransactions(rows, period, query = '', now = new Date()) {
  const q = query.toLowerCase(); const start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  if (period === '7days') start.setDate(start.getDate() - 7);
  if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  return rows.filter(row => (!q || `${row.itemName} ${row.code}`.toLowerCase().includes(q)) && (period === 'all' || new Date(row.createdAt) >= start));
}
export function filterTransactionReport(rows, filters = {}, now = new Date()) {
  const query = String(filters.query || '').trim().toLowerCase();
  let start = null; let end = null;
  if (filters.period === 'today') { start = new Date(now); start.setHours(0, 0, 0, 0); }
  if (filters.period === '7days') { start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6); }
  if (filters.period === 'month') { start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0); }
  if (filters.period === 'custom') {
    if (filters.startDate) start = new Date(`${filters.startDate}T00:00:00`);
    if (filters.endDate) { end = new Date(`${filters.endDate}T23:59:59.999`); }
  }
  return rows.filter(row => {
    const createdAt = new Date(row.createdAt);
    if (start && createdAt < start) return false;
    if (end && createdAt > end) return false;
    if (filters.type === 'adjustment' && ![TX.ADJUST, TX.STOCK_OPNAME].includes(row.type)) return false;
    if (filters.type && !['all','adjustment'].includes(filters.type) && row.type !== filters.type) return false;
    if (filters.category && filters.category !== 'all' && row.category !== filters.category) return false;
    if (filters.location && filters.location !== 'all' && row.location !== filters.location) return false;
    return !query || `${row.itemName} ${row.code} ${row.category || ''} ${row.note || ''}`.toLowerCase().includes(query);
  });
}
export function inventoryCsv(items) {
  const esc = value => `"${String(value).replaceAll('"', '""')}"`;
  return ['No,Kode,Barcode,Nama,Kategori,Lokasi,Stok,Satuan,Minimum,Status,Aktif,Terakhir Diperbarui', ...items.map((i,index) => [index+1,i.code,i.barcode||i.code,i.name,i.category,i.location,i.stock,i.unit,i.minimum,stockStatus(i),i.active?'Ya':'Tidak',i.updatedAt||''].map(esc).join(','))].join('\n');
}
export function transactionCsv(rows) {
  const esc = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return ['No,Tanggal,Jam,Kode,Nama Barang,Kategori,Jenis Transaksi,Jumlah,Stok Sebelum,Stok Sesudah,User,Catatan,Lokasi,Stok Fisik,Selisih', ...rows.map((row,index) => {
    const timestamp = new Date(row.createdAt);
    return [index+1,timestamp.toLocaleDateString('id-ID'),timestamp.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),row.code,row.itemName,row.category||'-',row.type,row.amount,row.before,row.after,row.user||'-',row.note||'-',row.location||'-',row.counted??'',row.difference??''].map(esc).join(',');
  })].join('\n');
}
export function stockOpnameCsv(rows) {
  const esc = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return ['No,Tanggal,Jam,Kode,Nama Barang,Kategori,Stok Sistem,Stok Fisik,Selisih,Stok Akhir,User,Catatan', ...rows.map((row,index) => {
    const timestamp = new Date(row.createdAt);
    return [index+1,timestamp.toLocaleDateString('id-ID'),timestamp.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),row.code,row.itemName,row.category||'-',row.before,row.counted,row.difference,row.after,row.user||'-',row.note||'-'].map(esc).join(',');
  })].join('\n');
}
export function stockOpnameStats(rows) {
  const opname = rows.filter(row => row.type === TX.STOCK_OPNAME);
  return {
    total: opname.length,
    matched: opname.filter(row => Number(row.difference) === 0).length,
    different: opname.filter(row => Number(row.difference) !== 0).length,
    positive: opname.filter(row => Number(row.difference) > 0).length,
    negative: opname.filter(row => Number(row.difference) < 0).length
  };
}
export function dashboardStats(items) {
  const active = items.filter(i => i.active);
  return { totalItems: active.length, totalStock: active.reduce((n,i)=>n+i.stock,0), low: active.filter(i=>stockStatus(i)==='MENIPIS').length, empty: active.filter(i=>stockStatus(i)==='HABIS').length };
}

export function filterInventory(items, filters = {}) {
  const query = String(filters.query || '').trim().toLowerCase();
  return items.filter(item => {
    if (filters.active === 'active' && !item.active) return false;
    if (filters.active === 'inactive' && item.active) return false;
    if (filters.category && filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.location && filters.location !== 'all' && item.location !== filters.location) return false;
    if (filters.status && filters.status !== 'all' && stockStatus(item) !== filters.status) return false;
    return !query || `${item.code} ${item.barcode || ''} ${item.name} ${item.category} ${item.location}`.toLowerCase().includes(query);
  });
}

export function inventoryReportStats(items) {
  return {
    totalItems: items.length,
    totalStock: items.reduce((sum, item) => sum + Number(item.stock || 0), 0),
    safe: items.filter(item => stockStatus(item) === 'AMAN').length,
    low: items.filter(item => stockStatus(item) === 'MENIPIS').length,
    empty: items.filter(item => stockStatus(item) === 'HABIS').length
  };
}
