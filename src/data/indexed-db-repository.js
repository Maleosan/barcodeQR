import { calculateStock } from '../core/stock.js';
const NAME = 'stokqr-inventory'; const VERSION = 1;
function result(request) { return new Promise((resolve,reject) => { request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); }); }
function complete(transaction) { return new Promise((resolve,reject) => { transaction.oncomplete=resolve; transaction.onerror=()=>reject(transaction.error); transaction.onabort=()=>reject(transaction.error || new Error('Transaksi dibatalkan.')); }); }
export function openInventoryDatabase() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const items = db.createObjectStore('items',{keyPath:'id',autoIncrement:true});
      items.createIndex('code','code',{unique:true}); items.createIndex('active','active'); items.createIndex('category','category');
      const transactions = db.createObjectStore('transactions',{keyPath:'id',autoIncrement:true});
      transactions.createIndex('itemId','itemId'); transactions.createIndex('createdAt','createdAt'); transactions.createIndex('type','type');
    };
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
}
export class IndexedDbInventoryRepository {
  constructor(database) { this.database=database; }
  static async create() { return new IndexedDbInventoryRepository(await openInventoryDatabase()); }
  async listItems() { return (await result(this.database.transaction('items').objectStore('items').getAll())).sort((a,b)=>a.name.localeCompare(b.name,'id')); }
  async getItem(id) { return result(this.database.transaction('items').objectStore('items').get(Number(id))); }
  async findItemByCode(code) { return result(this.database.transaction('items').objectStore('items').index('code').get(code)); }
  async saveItem(item) { const tx=this.database.transaction('items','readwrite'); const id=await result(tx.objectStore('items').put(item)); await complete(tx); return id; }
  async listTransactions() { return (await result(this.database.transaction('transactions').objectStore('transactions').getAll())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); }
  async applyStockTransaction(itemId,type,quantity,note='') {
    const tx=this.database.transaction(['items','transactions'],'readwrite'); const items=tx.objectStore('items'); const item=await result(items.get(Number(itemId)));
    if (!item) { tx.abort(); throw new Error('Barang tidak ditemukan.'); }
    const stockBefore=item.stock; const stockAfter=calculateStock(stockBefore,type,quantity); const createdAt=new Date().toISOString();
    items.put({...item,stock:stockAfter,updatedAt:createdAt});
    tx.objectStore('transactions').add({itemId:item.id,itemCode:item.code,itemName:item.name,type,quantity:Number(quantity),stockBefore,stockAfter,createdAt,note:String(note).trim()});
    await complete(tx); return {...item,stock:stockAfter,updatedAt:createdAt};
  }
  async clearAll() { const tx=this.database.transaction(['items','transactions'],'readwrite'); tx.objectStore('items').clear(); tx.objectStore('transactions').clear(); await complete(tx); }
}
