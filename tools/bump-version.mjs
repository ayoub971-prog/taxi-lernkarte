// Setzt die Versionsnummer ueberall gleichzeitig: sw.js (VERSION + ?v=), app.js (APP_VERSION),
// index.html, manifest, alle Module (?v=). Benutzung: node tools/bump-version.mjs 2
import fs from 'node:fs';
import path from 'node:path';
const v = process.argv[2];
if (!/^\d+$/.test(v || '')) { console.error('Benutzung: node tools/bump-version.mjs <Zahl>'); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'tools/fetch-routes.mjs', ...fs.readdirSync(path.join(root, 'js')).map((f) => 'js/' + f)];
for (const f of files) {
  const p = path.join(root, f); let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/\?v=\d+/g, `?v=${v}`).replace(/const VERSION = '\d+'/, `const VERSION = '${v}'`).replace(/APP_VERSION = '\d+'/, `APP_VERSION = '${v}'`);
  fs.writeFileSync(p, s);
}
console.log('Version ist jetzt', v, '– Tests laufen lassen: npm test');
