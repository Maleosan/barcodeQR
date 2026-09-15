import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files=['index.html','styles.css','service-worker.js','src/app.js','src/core/constants.js','src/core/stock.js','src/data/indexed-db-repository.js','src/services/inventory-service.js','src/services/scanner-service.js','src/services/qr-service.js','src/services/csv-service.js','src/ui/templates.js'];
for(const file of files){await stat(file);if(file.endsWith('.js')||file.endsWith('.mjs')){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status);}}
const index=await readFile('index.html','utf8');if(/(?:src|href)="\//.test(index))throw new Error('Asset absolut tidak kompatibel dengan /barcodeQR/.');
const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));if(manifest.start_url!=='./'||manifest.scope!=='./')throw new Error('Manifest tidak base-path safe.');
console.log(`Check berhasil: ${files.length} file, manifest dan asset path valid.`);
