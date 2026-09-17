import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_ADMIN_EMAIL'
];

function parseEnv(source = '') {
  return Object.fromEntries(source.split(/\r?\n/).flatMap(line => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1].startsWith('#')) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

export async function loadEnvironment(root = resolve('.')) {
  let local = {};
  try { local = parseEnv(await readFile(resolve(root, '.env'), 'utf8')); } catch {}
  return Object.fromEntries(ENV_KEYS.map(key => [key, String(process.env[key] ?? local[key] ?? '').trim()]));
}

export function firebaseClientConfig(env) {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };
}

export async function writeRuntimeConfig(target, env) {
  await mkdir(dirname(target), { recursive: true });
  const content = `// Generated from VITE_FIREBASE_* environment variables. Do not commit this file.\nglobalThis.STOKQR_FIREBASE_CONFIG = ${JSON.stringify(firebaseClientConfig(env), null, 2)};\n`;
  await writeFile(target, content, 'utf8');
}

export async function writeFirestoreRules(target, env, root = resolve('.')) {
  const template = await readFile(resolve(root, 'firestore.rules.template'), 'utf8');
  const adminEmail = env.VITE_ADMIN_EMAIL.toLowerCase() || 'admin@example.invalid';
  const rules = template.replaceAll('__VITE_ADMIN_EMAIL_JSON__', JSON.stringify(adminEmail));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, rules, 'utf8');
}

export function missingFirebaseKeys(env) {
  return ENV_KEYS.filter(key => !env[key]);
}
