import test from 'node:test';import assert from 'node:assert/strict';import { normalizeItem,nextGeneratedCode,calculateStockOpname,calculateTransaction,TX,stockStatus,filterTransactions,filterTransactionReport,dashboardStats,inventoryCsv,stockOpnameCsv,stockOpnameStats,transactionCsv,SCAN_FORMATS,cleanCode,filterInventory,inventoryReportStats } from '../src/domain.js';import { InventoryRepository } from '../src/repository.js';import { BarcodeScanner,ScanFeedback,ScannerSettingsStore,cameraCapabilityProfile,normalizeScannerSettings,scannerResumeDelay } from '../src/scanner.js';import { IMPORT_HEADERS,REQUIRED_IMPORT_HEADERS,buildImportBatch,createMutationWorkbook,createReportWorkbook,createStockOpnameWorkbook,createTemplateWorkbook,parseActive,stockOpnameRows,validateImportHeaders,validateImportRows } from '../src/excel.js';
const item=(over={})=>normalizeItem({code:'8991234567890',name:'Indomie',category:'Makanan',unit:'PCS',location:'A',stock:10,minimum:2,...over});
test('tambah barang membentuk record lengkap',()=>assert.equal(item().name,'Indomie'));
test('edit barang mempertahankan id dan createdAt',()=>{const a=item(),b=normalizeItem({...a,name:'Baru'},a);assert.equal(b.id,a.id);assert.equal(b.createdAt,a.createdAt)});
test('kode kosong ditolak dan duplikat didukung index unik repository',()=>assert.throws(()=>item({code:''}),/wajib/));
test('generate QR menghasilkan kode berurutan dan payload hanya kode',()=>assert.equal(nextGeneratedCode([{code:'BRG-00009'}]),'BRG-00010'));
for(const [label,format,value] of [['QR','QR_CODE','BRG-00001'],['EAN-13','EAN_13','8991234567890'],['EAN-8','EAN_8','12345670'],['UPC','UPC_A','012345678905'],['Code 128','CODE_128','ABC-128'],['Code 39','CODE_39','CODE39']])test(`scan ${label}`,()=>{assert.ok(SCAN_FORMATS.includes(format));assert.equal(new BarcodeScanner().acceptDecoded(` ${value} `),value)});
test('barang tidak ditemukan direpresentasikan undefined',()=>assert.equal([item()].find(i=>i.code===cleanCode('000')),undefined));
test('daftarkan barang dari scan mengisi kode',()=>assert.equal(item({code:cleanCode(' 123 ')}).code,'123'));
test('tambah stok konsisten',()=>assert.deepEqual(calculateTransaction(10,TX.IN,5),{before:10,after:15,amount:5}));
test('kurangi stok konsisten',()=>assert.equal(calculateTransaction(10,TX.OUT,4).after,6));
test('stok negatif ditolak',()=>assert.throws(()=>calculateTransaction(5,TX.OUT,10),/tidak mencukupi/));
test('penyesuaian menyimpan selisih',()=>assert.equal(calculateTransaction(8,TX.ADJUST,3).amount,-5));
test('riwayat dapat dicari dan difilter',()=>{const now=new Date(),rows=[{itemName:'Indomie',code:'899',createdAt:now.toISOString()}];assert.equal(filterTransactions(rows,'today','indo',now).length,1)});
test('dashboard menghitung status',()=>{const s=dashboardStats([item(),item({code:'2',stock:2}),item({code:'3',stock:0})]);assert.deepEqual(s,{totalItems:3,totalStock:12,low:1,empty:1})});
test('status stok',()=>{assert.equal(stockStatus(item()),'AMAN');assert.equal(stockStatus(item({stock:2})),'MENIPIS');assert.equal(stockStatus(item({stock:0})),'HABIS')});
test('export CSV aman dan memuat status',()=>assert.match(inventoryCsv([item({name:'Kopi, ABC'})]),/"Kopi, ABC".*AMAN/));

const importRow=(over={})=>({'Kode Barang':'BRG-00100','Nama Barang':'Beras','Kategori':'Bahan Pokok','Satuan':'Kg','Lokasi':'Gudang A','Stok Awal':20,'Stok Minimum':5,'Status Aktif':'Aktif','Foto':'',...over});
test('header import lengkap diterima',()=>assert.equal(validateImportHeaders(IMPORT_HEADERS).valid,true));
test('header import wajib yang hilang ditolak',()=>assert.deepEqual(validateImportHeaders(IMPORT_HEADERS.filter(header=>header!=='Kode Barang')).missing,['Kode Barang']));
test('header import opsional boleh tidak tersedia',()=>assert.equal(validateImportHeaders(REQUIRED_IMPORT_HEADERS).valid,true));
test('baris import valid dinormalisasi',()=>{const v=validateImportRows([importRow()],[]);assert.equal(v.valid,1);assert.equal(v.canImport,true);assert.equal(buildImportBatch(v)[0].active,true)});
test('kolom import opsional kosong memakai nilai default',()=>{const v=validateImportRows([{'Kode Barang':'BRG-2','Nama Barang':'Gula','Stok Awal':4}],[]),row=buildImportBatch(v)[0];assert.equal(row.minimum,0);assert.equal(row.active,true)});
test('nama barang kosong menjadi error',()=>assert.match(validateImportRows([importRow({'Nama Barang':' '})],[]).rows[0].messages.join(),/Nama/));
test('kode barang kosong menjadi error',()=>assert.match(validateImportRows([importRow({'Kode Barang':''})],[]).rows[0].messages.join(),/Kode/));
test('kode duplikat dalam file ditolak',()=>{const v=validateImportRows([importRow(),importRow()],[]);assert.equal(v.error,1);assert.equal(v.canImport,false)});
test('stok import invalid ditolak',()=>assert.match(validateImportRows([importRow({'Stok Awal':-1})],[]).rows[0].messages.join(),/Stok awal/));
test('minimum import invalid ditolak',()=>assert.match(validateImportRows([importRow({'Stok Minimum':'abc'})],[]).rows[0].messages.join(),/Stok minimum/));
test('status import invalid ditolak',()=>{assert.equal(parseActive('Aktif'),true);assert.equal(parseActive('Nonaktif'),false);assert.match(validateImportRows([importRow({'Status Aktif':'mungkin'})],[]).rows[0].messages.join(),/Status/)});
test('file tanpa data menghasilkan fatal error',()=>{const v=validateImportRows([],[]);assert.equal(v.canImport,false);assert.match(v.fatal,/tidak berisi/)});
test('kode yang sudah ada menjadi warning dan tidak diimport',()=>{const v=validateImportRows([importRow()],[item({code:'BRG-00100'})]);assert.equal(v.warning,1);assert.equal(buildImportBatch(v).length,0)});
test('beberapa barang valid siap diimport',()=>{const v=validateImportRows([importRow(),importRow({'Kode Barang':'BRG-00101','Nama Barang':'Gula'})],[]);assert.equal(buildImportBatch(v).length,2)});
test('repository mengimport beberapa barang dalam satu transaksi',async()=>{const added=[],db={transaction:()=>{const tx={objectStore:()=>({add:value=>added.push(value)})};queueMicrotask(()=>tx.oncomplete?.());return tx}};const repository=new InventoryRepository(null);repository.open=async()=>db;const imported=await repository.importItems(buildImportBatch(validateImportRows([importRow(),importRow({'Kode Barang':'BRG-00101'})],[])));assert.equal(imported.length,2);assert.equal(added.length,2)});
const fakeXlsx={utils:{aoa_to_sheet:rows=>({rows}),json_to_sheet:rows=>({rows}),book_new:()=>({SheetNames:[],Sheets:{}}),book_append_sheet:(book,sheet,name)=>{book.SheetNames.push(name);book.Sheets[name]=sheet}}};
test('template Excel memiliki sheet data dan panduan',()=>assert.deepEqual(createTemplateWorkbook(fakeXlsx).SheetNames,['Data Barang','Panduan']));

const reportItems=()=>[item({code:'1',name:'Aqua',category:'Minuman',location:'A',stock:10,minimum:2,active:true}),item({code:'2',name:'Kopi',category:'Minuman',location:'B',stock:2,minimum:2,active:true}),item({code:'3',name:'Sabun',category:'Kebersihan',location:'A',stock:0,minimum:2,active:false})];
test('summary laporan menghitung semua status',()=>assert.deepEqual(inventoryReportStats(reportItems()),{totalItems:3,totalStock:12,safe:1,low:1,empty:1}));
test('filter laporan kategori',()=>assert.equal(filterInventory(reportItems(),{category:'Minuman'}).length,2));
test('filter laporan lokasi',()=>assert.equal(filterInventory(reportItems(),{location:'A'}).length,2));
test('filter laporan status',()=>assert.equal(filterInventory(reportItems(),{status:'MENIPIS'}).length,1));
test('pencarian laporan',()=>assert.equal(filterInventory(reportItems(),{query:'sab'}).length,1));
test('kombinasi filter laporan',()=>assert.deepEqual(filterInventory(reportItems(),{category:'Minuman',location:'B',status:'MENIPIS',active:'active',query:'kopi'}).map(i=>i.code),['2']));
test('CSV laporan berisi satuan dan status AMAN MENIPIS HABIS',()=>{const csv=inventoryCsv(reportItems());assert.match(csv,/Satuan/);assert.match(csv,/AMAN/);assert.match(csv,/MENIPIS/);assert.match(csv,/HABIS/)});
test('CSV laporan stok memuat kolom barcode',()=>assert.match(inventoryCsv(reportItems()),/^No,Kode,Barcode/));
test('export Excel laporan memiliki laporan dan ringkasan',()=>assert.deepEqual(createReportWorkbook(fakeXlsx,reportItems()).SheetNames,['Laporan Stok','Ringkasan']));
const mutationRows=()=>[{code:'1',itemName:'Aqua',category:'Minuman',location:'A',type:TX.IN,amount:5,before:5,after:10,user:'-',note:'Scan',createdAt:'2026-09-16T08:00:00.000Z'},{code:'2',itemName:'Kopi',category:'Minuman',location:'B',type:TX.OUT,amount:2,before:4,after:2,user:'-',note:'Kasir',createdAt:'2026-09-10T08:00:00.000Z'}];
test('filter laporan mutasi mendukung custom tanggal jenis kategori lokasi dan pencarian',()=>{const rows=filterTransactionReport(mutationRows(),{period:'custom',startDate:'2026-09-15',endDate:'2026-09-16',type:TX.IN,category:'Minuman',location:'A',query:'aqua'},new Date('2026-09-16T12:00:00Z'));assert.deepEqual(rows.map(row=>row.code),['1'])});
test('CSV mutasi memuat stok sebelum sesudah user dan catatan',()=>{const csv=transactionCsv(mutationRows());assert.match(csv,/Stok Sebelum,Stok Sesudah,User,Catatan/);assert.match(csv,/Scan/)});
test('export Excel mutasi memiliki laporan dan ringkasan',()=>assert.deepEqual(createMutationWorkbook(fakeXlsx,mutationRows()).SheetNames,['Mutasi Stok','Ringkasan']));

const opnameRows=()=>[
  {id:'o1',itemId:'i1',code:'1',itemName:'Aqua',category:'Minuman',location:'A',type:TX.STOCK_OPNAME,amount:0,before:20,counted:20,difference:0,after:20,user:'Admin',note:'Rak A',createdAt:'2026-09-16T08:00:00.000Z'},
  {id:'o2',itemId:'i2',code:'2',itemName:'Kopi',category:'Minuman',location:'B',type:TX.STOCK_OPNAME,amount:-3,before:20,counted:17,difference:-3,after:17,user:'Admin',note:'Rusak',createdAt:'2026-09-16T09:00:00.000Z'},
  {id:'o3',itemId:'i3',code:'3',itemName:'Gula',category:'Bahan',location:'A',type:TX.STOCK_OPNAME,amount:5,before:20,counted:25,difference:5,after:25,user:'Admin',note:'Temuan',createdAt:'2026-09-15T09:00:00.000Z'}
];
test('opname sama dengan stok sistem menghasilkan selisih 0',()=>assert.deepEqual(calculateStockOpname(20,20),{before:20,counted:20,difference:0,after:20,amount:0}));
test('opname lebih kecil menghasilkan adjustment negatif',()=>assert.equal(calculateStockOpname(20,17).difference,-3));
test('opname lebih besar menghasilkan adjustment positif',()=>assert.equal(calculateStockOpname(20,25).difference,5));
test('stok fisik 0 valid dan menjadi stok akhir',()=>assert.deepEqual(calculateStockOpname(20,0),{before:20,counted:0,difference:-20,after:0,amount:-20}));
test('stok fisik negatif ditolak',()=>assert.throws(()=>calculateStockOpname(20,-1),/0 atau lebih/));
test('input jumlah fisik kosong ditolak',()=>assert.throws(()=>calculateStockOpname(20,''),/wajib/));
test('stok akhir opname selalu sama dengan jumlah fisik',()=>{for(const counted of [0,17,20,25])assert.equal(calculateStockOpname(20,counted).after,counted)});
test('history transaksi lama tetap dapat dibaca dan difilter',()=>{const old=mutationRows();assert.equal(filterTransactionReport(old,{period:'all',type:TX.IN}).length,1);assert.equal(old[0].counted,undefined)});
test('filter laporan STOCK_OPNAME hanya mengembalikan opname',()=>{const rows=[...mutationRows(),...opnameRows()];assert.equal(filterTransactionReport(rows,{period:'all',type:TX.STOCK_OPNAME}).length,3);assert.equal(filterTransactionReport(rows,{period:'all',type:'adjustment'}).length,3)});
test('summary laporan opname menghitung sesuai selisih positif dan negatif',()=>assert.deepEqual(stockOpnameStats(opnameRows()),{total:3,matched:1,different:2,positive:1,negative:1}));
test('export CSV dan Excel opname memuat field fisik selisih dan ringkasan',()=>{const csv=stockOpnameCsv(opnameRows()),workbook=createStockOpnameWorkbook(fakeXlsx,opnameRows(),'Semua');assert.match(csv,/Stok Sistem,Stok Fisik,Selisih,Stok Akhir/);assert.match(csv,/"-3"/);assert.deepEqual(workbook.SheetNames,['Stok Opname','Ringkasan']);assert.equal(stockOpnameRows(opnameRows())[1]['Stok Fisik'],17)});

function stockOpnameRepositoryHarness(stock=20){
  let current=item({id:'item-opname',code:'OP-1',name:'Barang Opname',stock});const transactions=[];
  const db={transaction:()=>{let tx;const itemStore={get:()=>{const request={};queueMicrotask(()=>{request.result=current;request.onsuccess?.()});return request},put:value=>{current={...value};queueMicrotask(()=>tx.oncomplete?.())}},transactionStore={put:value=>transactions.push({...value})};tx={objectStore:name=>name==='items'?itemStore:transactionStore,abort:()=>queueMicrotask(()=>tx.onabort?.())};return tx}};
  const repository=new InventoryRepository(null);repository.open=async()=>db;return {repository,transactions,current:()=>current};
}
test('repository menyimpan STOCK_OPNAME atomic dengan before counted difference after yang benar',async()=>{const harness=stockOpnameRepositoryHarness(20),result=await harness.repository.stockOpname('item-opname',17,'Hitung fisik','Admin');assert.equal(harness.transactions.length,1);assert.deepEqual({type:result.type,before:result.before,counted:result.counted,difference:result.difference,after:result.after},{type:TX.STOCK_OPNAME,before:20,counted:17,difference:-3,after:17});assert.equal(harness.current().stock,17)});

function scannerHarness({ startError, startErrors, feedback } = {}) {
  const sessions = [];
  const attempts = [];
  const failures = startErrors ? [...startErrors] : startError ? [startError] : [];
  class Reader {
    async decodeFromConstraints(constraints, video, callback) {
      attempts.push(constraints);
      if (failures.length) throw failures.shift();
      if (!video.srcObject) video.srcObject = { getTracks: () => [video.track], getVideoTracks: () => [video.track] };
      const session = { callback, stops: 0, video, controls: null };
      session.controls = { stop: () => { session.stops += 1; } };
      sessions.push(session);
      return session.controls;
    }
  }
  return { sessions, attempts, scanner: new BarcodeScanner({ getZXing: () => ({ BrowserMultiFormatReader: Reader }), getMediaDevices: () => ({ getUserMedia() {} }), getPermissions: () => undefined, feedback, logger: {} }) };
}
const fakeVideo = ({ capabilities = {}, applyError = null } = {}) => {
  const track = { stops: 0, applied: [], stop() { this.stops += 1; }, getCapabilities() { return capabilities; }, async applyConstraints(value) { if (applyError) throw applyError; this.applied.push(value); } };
  const attributes = new Set();
  return { srcObject: { getTracks: () => [track], getVideoTracks: () => [track] }, track, attributes, paused: false, setAttribute(name) { attributes.add(name); } };
};
const result = value => ({ getText: () => value, getBarcodeFormat: () => 'EAN_13' });

test('kamera berhasil start dengan atribut video mobile',async()=>{const {scanner,attempts}=scannerHarness(),video=fakeVideo();await scanner.start(video,()=>{});assert.equal(scanner.state,'scanning');assert.equal(attempts.length,1);assert.equal(video.autoplay,true);assert.equal(video.muted,true);assert.equal(video.playsInline,true);assert.ok(video.attributes.has('playsinline'))});

test('scanner settings disimpan dan dinormalisasi tanpa data sensitif',()=>{const memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},store=new ScannerSettingsStore(storage);const saved=store.save({focusMode:'fixed',zoom:2,torch:true,scanMode:'stable',autoNext:false,sound:false,vibration:false,secret:'abaikan'});assert.deepEqual(store.load(),saved);assert.equal('secret'in saved,false)});
test('mode scan cepat memiliki jeda auto-next paling pendek',()=>{assert.ok(scannerResumeDelay('fast')<scannerResumeDelay('normal'));assert.ok(scannerResumeDelay('normal')<scannerResumeDelay('stable'));assert.equal(normalizeScannerSettings({scanMode:'invalid'}).scanMode,'fast')});
test('capability kamera mendeteksi focus zoom dan torch',()=>{const profile=cameraCapabilityProfile({focusMode:['single-shot','continuous','manual'],zoom:{min:1,max:4,step:.5},torch:true});assert.deepEqual(profile.focus,{auto:true,continuous:true,fixed:true});assert.deepEqual(profile.zoom,{min:1,max:4,step:.5});assert.equal(profile.torch,true)});
test('focus yang tidak didukung fallback aman ke continuous',async()=>{const {scanner}=scannerHarness(),video=fakeVideo({capabilities:{focusMode:['continuous']}});await scanner.start(video,()=>{},()=>{},{settings:{focusMode:'fixed'}});assert.equal(scanner.appliedCameraSettings.focusMode,'continuous');assert.deepEqual(video.track.applied[0],{advanced:[{focusMode:'continuous'}]})});
test('zoom dan torch hanya diterapkan saat capability tersedia',async()=>{const {scanner}=scannerHarness(),video=fakeVideo({capabilities:{zoom:{min:1,max:3,step:.5},torch:true}});await scanner.start(video,()=>{},()=>{},{settings:{zoom:9,torch:true}});assert.equal(scanner.appliedCameraSettings.zoom,3);assert.equal(scanner.appliedCameraSettings.torch,true);assert.deepEqual(video.track.applied.map(value=>value.advanced[0]),[{zoom:3},{torch:true}])});
test('camera capability tidak tersedia tidak menyebabkan scanner gagal',async()=>{const {scanner}=scannerHarness(),video=fakeVideo();await scanner.start(video,()=>{},()=>{},{settings:{focusMode:'continuous',zoom:2,torch:true}});assert.equal(scanner.running,true);assert.equal(video.track.applied.length,0);assert.equal(scanner.appliedCameraSettings.focusMode,'unavailable')});
test('kegagalan applyConstraints tidak menghentikan decode',async()=>{const {scanner}=scannerHarness(),video=fakeVideo({capabilities:{focusMode:['continuous']},applyError:Object.assign(new Error('unsupported'),{name:'OverconstrainedError'})});await scanner.start(video,()=>{});assert.equal(scanner.running,true)});

test('lifecycle scan baru, daftar, simpan, lalu barcode sama dapat dipindai lagi', async () => {
  const { scanner, sessions } = scannerHarness();
  const found = new Map();
  const scanned = [];
  const scan = async code => { scanned.push(code); return found.get(code); };
  await scanner.start(fakeVideo(), scan);
  sessions[0].callback(result('8990000000001'));
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(await scan('8990000000001'), undefined);
  found.set('8990000000001', { code: '8990000000001' });
  await scanner.start(fakeVideo(), scan);
  sessions[1].callback(result('8990000000001'));
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(found.get(scanned.at(-1)), { code: '8990000000001' });
});

test('scan berurutan tetap menerima barcode sama dan berbeda setelah restart', async () => {
  const { scanner, sessions } = scannerHarness();
  const values = [];
  for (const code of ['111', '111', '222']) {
    await scanner.start(fakeVideo(), value => values.push(value));
    sessions.at(-1).callback(result(code));
    await new Promise(resolve => setTimeout(resolve));
  }
  assert.deepEqual(values, ['111', '111', '222']);
});

test('hasil duplikat dalam satu sesi hanya diproses sekali', async () => {
  const { scanner, sessions } = scannerHarness();
  const values = [];
  await scanner.start(fakeVideo(), value => values.push(value));
  sessions[0].callback(result('123'));
  sessions[0].callback(result('123'));
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(values, ['123']);
});

test('stop/start berulang menghentikan control dan stream lama', async () => {
  const { scanner, sessions } = scannerHarness();
  const firstVideo = fakeVideo();
  await scanner.start(firstVideo, () => {});
  await scanner.stop();
  assert.equal(sessions[0].stops, 1);
  assert.equal(firstVideo.track.stops, 1);
  await scanner.start(fakeVideo(), () => {});
  assert.equal(scanner.running, true);
});

test('callback sesi lama diabaikan setelah scanner dimulai ulang', async () => {
  const { scanner, sessions } = scannerHarness();
  const values = [];
  await scanner.start(fakeVideo(), value => values.push(value));
  await scanner.start(fakeVideo(), value => values.push(value));
  sessions[0].callback(result('LAMA'));
  sessions[1].callback(result('BARU'));
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(values, ['BARU']);
});

test('NotFoundException normal dan scanner tetap mencari', async () => {
  const { scanner, sessions } = scannerHarness();
  const errors = [];
  await scanner.start(fakeVideo(), () => {}, error => errors.push(error));
  sessions[0].callback(undefined, { name: 'NotFoundException' });
  assert.equal(scanner.running, true);
  assert.deepEqual(errors, []);
});

test('ChecksumException dan FormatException adalah miss decode normal', async () => {
  const { scanner, sessions } = scannerHarness();
  const errors = [];
  await scanner.start(fakeVideo(), () => {}, error => errors.push(error));
  sessions[0].callback(undefined, { name: 'ChecksumException' });
  sessions[0].callback(undefined, { name: 'FormatException' });
  assert.equal(scanner.running, true);
  assert.deepEqual(errors, []);
});

test('pesan No MultiFormat Readers adalah miss frame normal dan scan berikutnya tetap berhasil', async () => {
  const { scanner, sessions } = scannerHarness();
  const errors = [];
  const values = [];
  await scanner.start(fakeVideo(), value => values.push(value), error => errors.push(error));
  sessions[0].callback(undefined, new Error('No MultiFormat Readers were able to detect the code.'));
  assert.equal(scanner.running, true);
  assert.equal(sessions[0].stops, 0);
  assert.deepEqual(errors, []);
  sessions[0].callback(result('8990000000001'));
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(values, ['8990000000001']);
  assert.equal(scanner.state, 'detected');
});

test('mediaDevices tidak tersedia menghasilkan error khusus', async () => {
  const scanner = new BarcodeScanner({ getMediaDevices: () => undefined, getZXing: () => ({ BrowserMultiFormatReader: class {} }), logger: {} });
  await assert.rejects(scanner.start(fakeVideo(), () => {}), /tidak mendukung akses kamera/);
  assert.equal(scanner.state, 'error');
});

test('permission kamera ditolak menghasilkan error dan dapat dicoba ulang', async () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const { scanner } = scannerHarness({ startError: denied });
  const errors = [];
  await assert.rejects(scanner.start(fakeVideo(), () => {}, error => errors.push(error)), /Izin kamera ditolak/);
  assert.equal(scanner.state, 'error');
  assert.equal(errors[0].code, 'PERMISSION_DENIED');
  await scanner.start(fakeVideo(), () => {});
  assert.equal(scanner.running, true);
});

test('kamera tidak tersedia mencoba fallback lalu menampilkan error khusus', async () => {
  const unavailable = () => Object.assign(new Error('no camera'), { name: 'NotFoundError' });
  const { scanner, attempts } = scannerHarness({ startErrors: [unavailable(), unavailable(), unavailable()] });
  await assert.rejects(scanner.start(fakeVideo(), () => {}), /tidak tersedia di perangkat/);
  assert.equal(attempts.length, 3);
  assert.equal(scanner.state, 'error');
});

test('constraint kamera belakang fallback ke kamera default', async () => {
  const constrained = Object.assign(new Error('constraint'), { name: 'OverconstrainedError' });
  const { scanner, attempts } = scannerHarness({ startError: constrained });
  await scanner.start(fakeVideo(), () => {});
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0].video.facingMode, { exact: 'environment' });
  assert.deepEqual(attempts[1].video.facingMode, { ideal: 'environment' });
  assert.equal(scanner.running, true);
});

test('constraint yang tetap tidak didukung memiliki solusi khusus', async () => {
  const unsupported = () => Object.assign(new Error('constraint'), { name: 'OverconstrainedError' });
  const { scanner } = scannerHarness({ startErrors: [unsupported(), unsupported(), unsupported()] });
  await assert.rejects(scanner.start(fakeVideo(), () => {}), /pengaturan default/i);
  assert.equal(scanner.state, 'error');
});

test('kamera yang sedang dipakai aplikasi lain memiliki pesan khusus', async () => {
  const busy = Object.assign(new Error('busy'), { name: 'NotReadableError' });
  const { scanner } = scannerHarness({ startError: busy });
  await assert.rejects(scanner.start(fakeVideo(), () => {}), /digunakan aplikasi lain/);
});

test('decoder tidak tersedia tidak menampilkan scanner aktif', async () => {
  const scanner = new BarcodeScanner({ getZXing: () => undefined, getMediaDevices: () => ({ getUserMedia() {} }), logger: {} });
  await assert.rejects(scanner.start(fakeVideo(), () => {}), /Scanner tidak dapat dimuat/);
  assert.equal(scanner.running, false);
  assert.equal(scanner.state, 'error');
});

test('getar dipanggil satu kali saat scan berhasil',()=>{const calls=[],feedback=new ScanFeedback({vibrate:value=>calls.push(value),createAudioContext:()=>null});feedback.notify();assert.deepEqual(calls,[70])});
test('feedback tidak error tanpa vibration API',()=>{const feedback=new ScanFeedback({vibrate:null,createAudioContext:()=>null});assert.doesNotThrow(()=>feedback.notify())});
test('setting suara dan getar dapat dinonaktifkan',()=>{let vibrations=0,beeps=0;const audio={state:'running',currentTime:0,destination:{},createOscillator:()=>({frequency:{setValueAtTime(){}},connect(){},start(){beeps+=1},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};const feedback=new ScanFeedback({vibrate:()=>{vibrations+=1},createAudioContext:()=>audio});feedback.prepare();feedback.notify({sound:false,vibration:false});assert.equal(vibrations,0);assert.equal(beeps,0)});
test('beep dan getar tidak berulang untuk callback duplikat satu sesi',async()=>{let beeps=0,vibrations=0;const audio={state:'running',currentTime:0,destination:{},createOscillator:()=>({frequency:{setValueAtTime(){}},connect(){},start(){beeps+=1},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};const feedback=new ScanFeedback({vibrate:()=>{vibrations+=1},createAudioContext:()=>audio});feedback.prepare();const {scanner,sessions}=scannerHarness({feedback});await scanner.start(fakeVideo(),()=>{});sessions[0].callback(result('SAMA'));sessions[0].callback(result('SAMA'));await new Promise(resolve=>setTimeout(resolve));assert.equal(beeps,1);assert.equal(vibrations,1)});
test('feedback aktif kembali untuk barcode sama setelah restart',async()=>{let feedbackCount=0;const feedback={prepare(){},notify(){feedbackCount+=1}};const {scanner,sessions}=scannerHarness({feedback});for(let i=0;i<2;i++){await scanner.start(fakeVideo(),()=>{});sessions.at(-1).callback(result('SAMA'));await new Promise(resolve=>setTimeout(resolve))}assert.equal(feedbackCount,2);assert.equal(scanner.state,'detected')});
