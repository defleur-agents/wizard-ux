'use strict';
// Static census of every network path literal the shell can issue under web/.
// tests/fixtures/proof-request-inventory.json must classify each one; the
// request-inventory test fails when a path appears here and is not classified.
const fs = require('node:fs'), path = require('node:path');
const API = /(['"`])((?:\/(?:wizard(?:-claude|-tinfoil)?|morning|notifications|troubleshoot)|\/api\/system)\/(?:\$\{[^}]*\}|[^'"`\s?#$])*)/g;
const STORE = /(['"`])(?:\.\.\/)?(store-(?:data|install)\/(?:\$\{[^}]*\}|[^'"`\s?#$])*)/g;
function normalise(p) {
 return p.replace(/\$\{[^}]*\}/g, '{}').replace(/([^/])\{\}$/, '$1').replace(/\/+$/, '');
}
function scan(root) {
 const found = new Map();
 (function visit(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
   const file = path.join(dir, name);
   if (fs.statSync(file).isDirectory()) { visit(file); continue; }
   if (!/\.(?:js|mjs)$/.test(name) || name === 'offline-session-config.js') continue;
   const rel = path.relative(root, file).split(path.sep).join('/'), text = fs.readFileSync(file, 'utf8');
   for (const m of text.matchAll(API)) { const p = normalise(m[2]); if (!found.has(p)) found.set(p, rel); }
   for (const m of text.matchAll(STORE)) { const p = normalise('/wizard-os-home/' + m[2]); if (!found.has(p)) found.set(p, rel); }
  }
 })(path.join(root, 'web'));
 found.set('/{app}/ready.json', 'web/core/chats-view.js'); // declared as prefix + 'ready.json'
 return found;
}
module.exports = { scan, normalise };
