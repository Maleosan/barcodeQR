import { resolve } from 'node:path';
import { loadEnvironment, missingFirebaseKeys, writeFirestoreRules, writeRuntimeConfig } from './config.mjs';

const root = resolve('.');
const env = await loadEnvironment(root);
const missing = missingFirebaseKeys(env);
if (missing.length) throw new Error(`Konfigurasi belum lengkap: ${missing.join(', ')}. Isi environment sebelum konfigurasi Firebase dibuat.`);
await writeRuntimeConfig(resolve(root, 'firebase-config.js'), env);
await writeFirestoreRules(resolve(root, '.firebase/firestore.rules'), env, root);
console.log('Konfigurasi runtime dan Firestore Rules berhasil dibuat dari environment.');
