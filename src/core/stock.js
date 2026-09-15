import { TRANSACTION_TYPES } from './constants.js';
export function calculateStock(current, type, quantity) {
  const before = Number(current); const amount = Number(quantity);
  if (!Number.isInteger(before) || before < 0) throw new Error('Stok saat ini tidak valid.');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Jumlah harus bilangan bulat lebih dari 0.');
  let after;
  if (type === TRANSACTION_TYPES.IN) after = before + amount;
  else if (type === TRANSACTION_TYPES.OUT) after = before - amount;
  else if (type === TRANSACTION_TYPES.ADJUSTMENT) after = amount;
  else throw new Error('Jenis transaksi tidak valid.');
  if (after < 0) throw new Error('Stok tidak mencukupi.');
  return after;
}
