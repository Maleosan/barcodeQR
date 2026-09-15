export class InventoryService {
  constructor(repository) { this.repository=repository; }
  normalizeCode(value) { return String(value ?? '').trim().toUpperCase(); }
  validate(input) {
    const item={...input,code:this.normalizeCode(input.code),name:String(input.name??'').trim(),category:String(input.category??'').trim(),unit:String(input.unit??'').trim().toUpperCase(),location:String(input.location??'').trim(),photo:String(input.photo??'').trim(),stock:Number(input.stock),minimumStock:Number(input.minimumStock),active:input.active !== false && input.active !== 'false'};
    if (!item.code) throw new Error('Kode barang wajib diisi.'); if (!item.name) throw new Error('Nama barang wajib diisi.'); if (!item.unit) throw new Error('Satuan wajib diisi.');
    if (!Number.isInteger(item.stock)||item.stock<0) throw new Error('Stok awal tidak valid.'); if (!Number.isInteger(item.minimumStock)||item.minimumStock<0) throw new Error('Stok minimum tidak valid.'); return item;
  }
  async saveItem(input) {
    const valid=this.validate(input); const duplicate=await this.repository.findItemByCode(valid.code); const id=input.id?Number(input.id):undefined;
    if (duplicate && duplicate.id !== id) throw new Error('Kode barang sudah digunakan.');
    const now=new Date().toISOString(); const item={...valid,id,codeType:input.codeType==='generated'?'generated':'product',createdAt:input.createdAt||now,updatedAt:now};
    const savedId=await this.repository.saveItem(item); return this.repository.getItem(savedId);
  }
  async findActiveItem(code) { const item=await this.repository.findItemByCode(this.normalizeCode(code)); return item?.active ? item : null; }
  async nextGeneratedCode() { const items=await this.repository.listItems(); const max=items.reduce((value,item)=>{const match=/^BRG-(\d+)$/.exec(item.code);return Math.max(value,match?Number(match[1]):0);},0); return `BRG-${String(max+1).padStart(5,'0')}`; }
  async dashboard() { const [items,transactions]=await Promise.all([this.repository.listItems(),this.repository.listTransactions()]); const active=items.filter(item=>item.active); return {totalItems:active.length,totalStock:active.reduce((sum,item)=>sum+item.stock,0),low:active.filter(item=>item.stock>0&&item.stock<=item.minimumStock),empty:active.filter(item=>item.stock===0),recent:transactions.slice(0,8)}; }
  async seedDemo() { if ((await this.repository.listItems()).length) throw new Error('Data demo hanya dapat diisi pada database kosong.'); for (const item of demoItems) await this.saveItem(item); }
}
const demoItems=[
 {code:'8996001300012',codeType:'product',name:'Indomie Goreng',category:'Makanan',unit:'BUNGKUS',location:'Gudang A',stock:100,minimumStock:20,active:true},
 {code:'8992752111111',codeType:'product',name:'Aqua 600ml',category:'Minuman',unit:'BOTOL',location:'Gudang A',stock:48,minimumStock:24,active:true},
 {code:'BRG-00001',codeType:'generated',name:'Kopi ABC',category:'Minuman',unit:'SACHET',location:'Rak B2',stock:12,minimumStock:15,active:true},
 {code:'BRG-00002',codeType:'generated',name:'Teh Botol',category:'Minuman',unit:'BOTOL',location:'Rak B1',stock:0,minimumStock:12,active:true}
];
