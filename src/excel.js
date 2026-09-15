import { cleanCode, inventoryReportStats, stockStatus } from './domain.js';

export const IMPORT_HEADERS = Object.freeze(['Kode Barang','Nama Barang','Kategori','Satuan','Lokasi','Stok Awal','Stok Minimum','Status Aktif','Foto']);
const MAX_IMPORT_ROWS = 5000;

export function validateImportHeaders(headers = []) {
  const normalized = headers.map(value => String(value ?? '').trim());
  const missing = IMPORT_HEADERS.filter(header => !normalized.includes(header));
  const unexpected = normalized.filter(header => header && !IMPORT_HEADERS.includes(header));
  return { valid: missing.length === 0, missing, unexpected };
}

export function parseActive(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['aktif','ya','yes','true','1'].includes(normalized)) return true;
  if (['nonaktif','tidak','no','false','0'].includes(normalized)) return false;
  return null;
}

const isBlankRow = row => IMPORT_HEADERS.every(header => String(row?.[header] ?? '').trim() === '');
const numberValue = value => {
  if (value === null || value === undefined || String(value).trim() === '') return Number.NaN;
  return typeof value === 'number' ? value : Number(String(value).trim());
};

export function validateImportRows(sourceRows = [], existingItems = []) {
  if (!Array.isArray(sourceRows) || !sourceRows.length) return { rows: [], total: 0, valid: 0, warning: 0, error: 0, canImport: false, fatal: 'File Excel tidak berisi data barang.' };
  if (sourceRows.length > MAX_IMPORT_ROWS) return { rows: [], total: sourceRows.length, valid: 0, warning: 0, error: sourceRows.length, canImport: false, fatal: `Maksimal ${MAX_IMPORT_ROWS} baris per import.` };
  const existingCodes = new Set(existingItems.map(item => cleanCode(item.code).toUpperCase()));
  const seen = new Set();
  const rows = [];
  sourceRows.forEach((source, index) => {
    if (isBlankRow(source)) return;
    const code = cleanCode(source['Kode Barang']);
    const name = String(source['Nama Barang'] ?? '').trim();
    const stock = numberValue(source['Stok Awal']);
    const minimum = numberValue(source['Stok Minimum']);
    const active = parseActive(source['Status Aktif']);
    const errors = [];
    const warnings = [];
    const key = code.toUpperCase();
    if (!code) errors.push('Kode barang wajib diisi');
    if (!name) errors.push('Nama barang wajib diisi');
    if (code && seen.has(key)) errors.push('Kode duplikat dalam file');
    if (!Number.isFinite(stock) || stock < 0) errors.push('Stok awal harus angka ≥ 0');
    if (!Number.isFinite(minimum) || minimum < 0) errors.push('Stok minimum harus angka ≥ 0');
    if (active === null) errors.push('Status aktif tidak dikenali');
    if (code && existingCodes.has(key)) warnings.push('Kode sudah ada dan tidak akan diimport');
    if (code) seen.add(key);
    const level = errors.length ? 'error' : warnings.length ? 'warning' : 'valid';
    rows.push({
      rowNumber: index + 2, code, name, level,
      messages: [...errors, ...warnings],
      data: { code, name, category: String(source.Kategori ?? '').trim(), unit: String(source.Satuan ?? '').trim(), location: String(source.Lokasi ?? '').trim(), stock, minimum, active, photo: String(source.Foto ?? '').trim() }
    });
  });
  const count = level => rows.filter(row => row.level === level).length;
  const result = { rows, total: rows.length, valid: count('valid'), warning: count('warning'), error: count('error') };
  return { ...result, canImport: result.valid > 0 && result.error === 0, fatal: rows.length ? '' : 'File Excel tidak berisi data barang.' };
}

export function buildImportBatch(validation) {
  return (validation?.rows || []).filter(row => row.level === 'valid').map(row => row.data);
}

export function workbookRows(XLSX, workbook) {
  if (!XLSX?.utils || !workbook?.SheetNames?.length) throw new Error('File Excel rusak atau tidak dapat dibaca.');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (!matrix.length) throw new Error('File Excel kosong.');
  const headers = matrix[0].map(value => String(value ?? '').trim());
  const headerCheck = validateImportHeaders(headers);
  if (!headerCheck.valid) throw new Error(`Header tidak lengkap: ${headerCheck.missing.join(', ')}.`);
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
}

export function createTemplateWorkbook(XLSX) {
  if (!XLSX?.utils) throw new Error('Library Excel belum tersedia. Sambungkan internet lalu muat ulang.');
  const examples = [
    ['BRG-00001','Indomie Goreng','Makanan','Bungkus','Gudang A',100,20,'Aktif',''],
    ['8996001600269','Aqua 600ml','Minuman','Botol','Rak B',48,12,'Aktif','https://contoh.com/aqua.jpg'],
    ['BRG-00003','Kopi ABC','Minuman','Sachet','Rak C',0,10,'Nonaktif','']
  ];
  const data = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, ...examples]);
  data['!cols'] = [{wch:18},{wch:28},{wch:18},{wch:14},{wch:18},{wch:12},{wch:14},{wch:14},{wch:34}];
  data['!autofilter'] = { ref: `A1:I${examples.length + 1}` };
  const guidance = [
    ['PANDUAN TEMPLATE IMPORT STOKQR',''],
    ['Aturan penting','Jangan mengubah nama header pada sheet Data Barang.'],
    ['Kode Barang','Wajib dan unik. Contoh benar: BRG-00001 atau 8996001600269. Contoh salah: kosong/duplikat.'],
    ['Nama Barang','Wajib diisi.'],['Kategori','Opsional; default Lainnya.'],['Satuan','Opsional; default PCS.'],['Lokasi','Opsional; default -.'],
    ['Stok Awal','Angka 0 atau lebih besar.'],['Stok Minimum','Angka 0 atau lebih besar.'],
    ['Status Aktif','Isi Aktif atau Nonaktif.'],['Foto','Opsional; URL atau data URL jika didukung browser.'],
    ['Contoh benar','BRG-00010 | Beras | Bahan Pokok | Kg | Gudang A | 20 | 5 | Aktif'],
    ['Contoh salah','kode kosong, nama kosong, stok -1, atau status selain Aktif/Nonaktif.']
  ];
  const guide = XLSX.utils.aoa_to_sheet(guidance);guide['!cols']=[{wch:24},{wch:95}];
  const wb = XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,data,'Data Barang');XLSX.utils.book_append_sheet(wb,guide,'Panduan');return wb;
}

export function reportRows(items) {
  return items.map((item,index)=>({No:index+1,Kode:item.code,'Nama Barang':item.name,Kategori:item.category,Lokasi:item.location,Stok:item.stock,Satuan:item.unit,Minimum:item.minimum,Status:stockStatus(item),'Status Aktif':item.active?'Aktif':'Nonaktif','Terakhir Diperbarui':item.updatedAt||''}));
}

export function createReportWorkbook(XLSX, items, filtersLabel = 'Semua data') {
  if (!XLSX?.utils) throw new Error('Library Excel belum tersedia. Sambungkan internet lalu muat ulang.');
  const report = XLSX.utils.json_to_sheet(reportRows(items));report['!cols']=[{wch:7},{wch:18},{wch:28},{wch:18},{wch:18},{wch:10},{wch:12},{wch:10},{wch:12},{wch:14},{wch:24}];report['!autofilter']={ref:`A1:K${Math.max(1,items.length+1)}`};
  const stats=inventoryReportStats(items);const summary=XLSX.utils.aoa_to_sheet([['STOKQR - LAPORAN STOK GUDANG'],['Dibuat',new Date().toLocaleString('id-ID')],['Filter',filtersLabel],[],['Total Jenis Barang',stats.totalItems],['Total Stok',stats.totalStock],['Aman',stats.safe],['Menipis',stats.low],['Habis',stats.empty]]);summary['!cols']=[{wch:24},{wch:44}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,report,'Laporan Stok');XLSX.utils.book_append_sheet(wb,summary,'Ringkasan');return wb;
}
