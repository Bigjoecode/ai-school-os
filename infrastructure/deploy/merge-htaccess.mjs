// Merges the web app's Apache rules into the live .htaccess without touching
// anything else in it — cPanel writes its own blocks there (Passenger config
// for the Node.js API, PHP handlers), and a plain overwrite would delete them.
//
//   node merge-htaccess.mjs <live .htaccess or missing> <our rules> <output>
//
// Our rules live between the BEGIN/END markers below; each deploy replaces
// that block and keeps every other line as it was.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [livePath, oursPath, outPath] = process.argv.slice(2);
if (!oursPath || !outPath) {
  console.error('usage: merge-htaccess.mjs <live> <ours> <out>');
  process.exit(2);
}

const BEGIN = '# BEGIN AI School OS (managed by deploy; edits inside are overwritten)';
const END = '# END AI School OS';

const live = livePath && existsSync(livePath) ? readFileSync(livePath, 'utf8').replace(/\r\n/g, '\n') : '';
const ours = readFileSync(oursPath, 'utf8').replace(/\r\n/g, '\n').trim();

const start = live.indexOf(BEGIN);
const end = live.indexOf(END);
const rest =
  start !== -1 && end > start ? live.slice(0, start) + live.slice(end + END.length) : live;

// cPanel's blocks (Passenger etc.) go first so they apply before the SPA
// fallback; our block closes the file.
const merged = [rest.trim(), `${BEGIN}\n${ours}\n${END}`].filter(Boolean).join('\n\n') + '\n';
writeFileSync(outPath, merged);
console.log(`Merged .htaccess (${rest.trim() ? 'kept existing server rules' : 'no existing rules'})`);
