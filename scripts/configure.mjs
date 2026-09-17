import { resolve } from 'node:path';
import { loadEnvironment, missingFirebaseKeys, writeFirestoreRules, writeRuntimeConfig } from './config.mjs';

const root = resolve('.');
const env = await loadEnvironment(root);
await writeRuntimeConfig(resolve(root, 'firebase-config.js'), env);
await writeFirestoreRules(resolve(root, '.firebase/firestore.rules'), env, root);
const missing = missingFirebaseKeys(env);
if (missing.length) console.warn(`Konfigurasi belum lengkap: ${missing.join(', ')}. Isi .env sebelum uji Firebase.`);
else console.log('Konfigurasi runtime dan Firestore Rules berhasil dibuat dari environment.');
