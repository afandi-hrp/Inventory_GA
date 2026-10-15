#!/usr/bin/env node
// Cek apakah semua tabel, kolom, fungsi/trigger SQL, RPC, bucket storage,
// endpoint API, route halaman, dan file src yang dipakai aplikasi sudah
// tercatat di CLAUDE.md. Dipakai sebagai Stop hook Claude Code
// (.claude/settings.json di folder "stock GA") supaya tiap ada tabel/fungsi
// baru, CLAUDE.md wajib diupdate dulu sebelum sesi dianggap selesai.
//
// Jalankan manual: node scripts/check-claude-md.mjs
// Exit 0 = lengkap. Mode hook (stdin JSON dari Claude Code): kalau ada yang
// belum tercatat, cetak {"decision":"block", ...} supaya Claude melengkapinya.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const read = p => fs.readFileSync(p, 'utf8');
const codeFiles = [...walk(path.join(ROOT, 'src'), ['.ts', '.tsx']), ...walk(path.join(ROOT, 'api'), ['.ts', '.js'])];
const sqlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.sql')).map(f => path.join(ROOT, f));
const code = codeFiles.map(read).join('\n');
// Komentar SQL dibuang dulu supaya teks di komentar tidak ikut terbaca sebagai objek
const sql = sqlFiles.map(read).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*#.*$/gm, '')
  .replace(/--.*$/gm, '');

const found = new Map(); // kategori -> Set(nama)
const add = (cat, name) => {
  if (!name) return;
  if (!found.has(cat)) found.set(cat, new Set());
  found.get(cat).add(name);
};
const each = (re, text, fn) => { for (const m of text.matchAll(re)) fn(m); };

// Tabel (bukan storage.from)
each(/(?<!storage\s*)\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g, code, m => add('Tabel', m[1]));
// RPC
each(/\.rpc\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g, code, m => add('Fungsi RPC', m[1]));
// Bucket storage
each(/storage\s*\.from\(\s*['"`]([a-z0-9_-]+)['"`]/g, code, m => add('Bucket storage', m[1]));
each(/bucket=["']([a-z0-9_-]+)["']/g, code, m => add('Bucket storage', m[1]));
each(/getSignedUrls?\(\s*['"`]([a-z0-9_-]+)['"`]/g, code, m => add('Bucket storage', m[1]));
each(/_BUCKET\s*=\s*['"`]([a-z0-9_-]+)['"`]/g, code, m => add('Bucket storage', m[1]));
each(/insert\s+into\s+storage\.buckets[^;]*?values\s*\(\s*'([a-z0-9_-]+)'/gi, sql, m => add('Bucket storage', m[1]));
// Endpoint API
each(/app\.(?:get|post|put|patch|delete)\(\s*['"`](\/api\/[^'"`]+)['"`]/g, code, m => add('Endpoint API', m[1]));
// Route halaman
each(/path=["'](\/[^"'*]+)["']/g, code, m => add('Route halaman', m[1]));
// Objek SQL
each(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)/gi, sql, m => add('Tabel', m[1].toLowerCase()));
each(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)/gi, sql, m => add('Fungsi/trigger SQL', m[1].toLowerCase()));
each(/create\s+(?:or\s+replace\s+)?trigger\s+"?([a-z_][a-z0-9_]*)/gi, sql, m => add('Fungsi/trigger SQL', m[1].toLowerCase()));
each(/alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi, sql,
  m => add('Kolom', `${m[1].toLowerCase()}.${m[2].toLowerCase()}`));
// Kolom dari src/types.ts (interface = cerminan tabel)
const typesPath = path.join(ROOT, 'src', 'types.ts');
if (fs.existsSync(typesPath)) {
  const types = read(typesPath);
  each(/export interface (\w+)\s*\{([\s\S]*?)\n\}/g, types, m => {
    each(/^\s+([a-z_][a-z0-9_]*)\??\s*:/gm, m[2], f => add('Kolom', `${m[1]}.${f[1]}`));
  });
}
// File sumber (komponen, hook, lib)
for (const f of codeFiles) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (/^src\/(components|hooks|lib)\//.test(rel)) add('File src', path.basename(rel));
}

const md = fs.existsSync(CLAUDE_MD) ? read(CLAUDE_MD) : '';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const documented = name => new RegExp(`(^|[^A-Za-z0-9_-])${esc(name)}($|[^A-Za-z0-9_-])`).test(md);

const missing = [];
for (const [cat, names] of found) {
  for (const n of [...names].sort()) {
    // Kolom cukup tercatat nama kolomnya (tabel.kolom atau kolom saja)
    const key = cat === 'Kolom' ? n.split('.')[1] : n;
    if (!documented(key) && !documented(n)) missing.push(`${cat}: ${n}`);
  }
}

let stdin = '';
try { if (!process.stdin.isTTY) stdin = fs.readFileSync(0, 'utf8'); } catch { /* manual run */ }
let hookInput = null;
try { hookInput = stdin ? JSON.parse(stdin) : null; } catch { hookInput = null; }

if (!missing.length) {
  if (!hookInput) console.log('CLAUDE.md lengkap: semua tabel/fungsi/bucket/endpoint/route/file sudah tercatat.');
  process.exit(0);
}

const list = missing.map(m => `- ${m}`).join('\n');
if (hookInput) {
  // Cegah loop: kalau Claude sudah sekali dipaksa lanjut di giliran ini, cukup ingatkan user.
  if (hookInput.stop_hook_active) {
    console.log(JSON.stringify({ systemMessage: `CLAUDE.md masih belum mencatat ${missing.length} item (jalankan node Inventory_GA/scripts/check-claude-md.mjs).` }));
    process.exit(0);
  }
  console.log(JSON.stringify({
    decision: 'block',
    reason: `Inventory_GA/CLAUDE.md belum mencatat item berikut yang dipakai di kode/SQL. Tambahkan ke bagian yang sesuai di CLAUDE.md (tabel+kolom di "Skema Supabase", fungsi SQL/RPC/bucket/endpoint di bagian terkait, file di "Struktur Folder") beserta penjelasan singkat, lalu selesai:\n${list}`,
  }));
  process.exit(0);
}
console.log(`CLAUDE.md belum mencatat ${missing.length} item:\n${list}`);
process.exit(1);
