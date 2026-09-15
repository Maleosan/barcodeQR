import test from 'node:test';import assert from 'node:assert/strict';import { normalizeItem,nextGeneratedCode,calculateTransaction,TX,stockStatus,filterTransactions,dashboardStats,inventoryCsv,SCAN_FORMATS,cleanCode } from '../src/domain.js';import { BarcodeScanner } from '../src/scanner.js';
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

function scannerHarness({ startError } = {}) {
  const sessions = [];
  class Reader {
    async decodeFromConstraints(_constraints, video, callback) {
      if (startError) throw startError;
      const session = { callback, stops: 0, video, controls: null };
      session.controls = { stop: () => { session.stops += 1; } };
      sessions.push(session);
      return session.controls;
    }
  }
  return { sessions, scanner: new BarcodeScanner({ getZXing: () => ({ BrowserMultiFormatReader: Reader }) }) };
}
const fakeVideo = () => {
  const track = { stops: 0, stop() { this.stops += 1; } };
  return { srcObject: { getTracks: () => [track] }, track };
};
const result = value => ({ getText: () => value, getBarcodeFormat: () => 'EAN_13' });

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

test('permission kamera ditolak menghasilkan error dan dapat dicoba ulang', async () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const { scanner } = scannerHarness({ startError: denied });
  const errors = [];
  await assert.rejects(scanner.start(fakeVideo(), () => {}, error => errors.push(error)), /Izin kamera ditolak/);
  assert.equal(scanner.state, 'error');
  assert.equal(errors[0].code, 'PERMISSION_DENIED');
  const retry = scannerHarness();
  await retry.scanner.start(fakeVideo(), () => {});
  assert.equal(retry.scanner.running, true);
});

test('decoder tidak tersedia tidak menampilkan scanner aktif', async () => {
  const scanner = new BarcodeScanner({ getZXing: () => undefined });
  await assert.rejects(scanner.start(fakeVideo(), () => {}), /Decoder barcode belum tersedia/);
  assert.equal(scanner.running, false);
  assert.equal(scanner.state, 'error');
});
