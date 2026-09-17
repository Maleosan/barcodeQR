import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvironment, missingFirebaseKeys, writeFirestoreRules, writeRuntimeConfig } from './config.mjs';

const root = resolve('.');
const output = resolve(root, 'dist');
const env = await loadEnvironment(root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'styles.css', 'manifest.webmanifest', 'service-worker.js', 'assets', 'src']) {
  await cp(resolve(root, path), resolve(output, path), { recursive: true });
}
await writeRuntimeConfig(resolve(output, 'firebase-config.js'), env);
await writeFirestoreRules(resolve(root, '.firebase/firestore.rules'), env, root);
const missing = missingFirebaseKeys(env);
if (missing.length) console.warn(`Build dibuat dengan konfigurasi kosong untuk: ${missing.join(', ')}.`);
console.log('Build production tersedia di dist/.');
