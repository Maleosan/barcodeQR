const DB_NAME='stokqr-web'; const DB_VERSION=1;
export function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('items')){const s=db.createObjectStore('items',{keyPath:'id',autoIncrement:true});s.createIndex('code','code',{unique:true});s.createIndex('active','active');}if(!db.objectStoreNames.contains('transactions')){const s=db.createObjectStore('transactions',{keyPath:'id',autoIncrement:true});s.createIndex('itemId','itemId');s.createIndex('createdAt','createdAt');s.createIndex('type','type');}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export class IndexedDbInventoryRepository{
 constructor(db){this.db=db} static async create(){return new this(await openDatabase())}
 async listItems(){const rows=await request(this.db.transaction('items').objectStore('items').getAll());return rows.sort((a,b)=>a.name.localeCompare(b.name,'id'))}
 async getItem(id){return request(this.db.transaction('items').objectStore('items').get(Number(id)))}
 async findByCode(code){return request(this.db.transaction('items').objectStore('items').index('code').get(code))}
 async saveItem(item){const tx=this.db.transaction('items','readwrite');const id=await request(tx.objectStore('items').put(item));await transactionDone(tx);return id}
 async listTransactions(){const rows=await request(this.db.transaction('transactions').objectStore('transactions').getAll());return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async changeStock(itemId,type,quantity,note=''){
  const tx=this.db.transaction(['items','transactions'],'readwrite');const items=tx.objectStore('items');const item=await request(items.get(Number(itemId)));if(!item){tx.abort();throw new Error('Barang tidak ditemukan')}
  const before=item.stock;const after=calculateStock(before,type,quantity);const now=new Date().toISOString();item.stock=after;item.updatedAt=now;items.put(item);
  tx.objectStore('transactions').add({itemId:item.id,itemCode:item.code,itemName:item.name,type,quantity:Number(quantity),stockBefore:before,stockAfter:after,createdAt:now,note:note.trim()});await transactionDone(tx);return item
 }
}
export function calculateStock(current,type,quantity){quantity=Number(quantity);if(!Number.isInteger(quantity)||quantity<=0)throw new Error('Jumlah harus bilangan bulat lebih dari 0');let result;if(type==='IN')result=current+quantity;else if(type==='OUT')result=current-quantity;else if(type==='ADJUSTMENT')result=quantity;else throw new Error('Jenis transaksi tidak valid');if(result<0)throw new Error('Stok tidak boleh negatif');return result}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Transaksi dibatalkan'));});}
