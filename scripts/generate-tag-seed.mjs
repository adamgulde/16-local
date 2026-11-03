// Generates src/data/seed/tags.json from the backend's curated taxonomy migration (V4), so the
// on-device tag dictionary matches the server's. Usage:
//   node scripts/generate-tag-seed.mjs /path/to/V4__curated_tag_taxonomy.sql
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/generate-tag-seed.mjs <V4__curated_tag_taxonomy.sql>');
  process.exit(1);
}

const sql = readFileSync(src, 'utf8');
const sqlStr = (s) => s.replace(/''/g, "'");
const nullable = (s) => (s === 'NULL' ? null : sqlStr(s.slice(1, -1)));
// ('id', 'category', 'label', parent|NULL, level, icon|NULL, display_order, self_only, single_select)
const row = /^\('([^']+)', '((?:[^']|'')*)', '((?:[^']|'')*)', (NULL|'[^']*'), (\d+), (NULL|'[^']*'), (\d+), (TRUE|FALSE), (TRUE|FALSE)\)[,;]?$/;

const tags = [];
for (const line of sql.split('\n')) {
  const m = line.trim().match(row);
  if (!m) continue;
  tags.push({
    id: m[1],
    category: sqlStr(m[2]),
    label: sqlStr(m[3]),
    parentId: nullable(m[4]),
    level: Number(m[5]),
    icon: nullable(m[6]),
    displayOrder: Number(m[7]),
    selfOnly: m[8] === 'TRUE',
    singleSelect: m[9] === 'TRUE',
  });
}
if (tags.length === 0) {
  console.error('no tag rows found — has the V4 format changed?');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/data/seed/tags.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(tags, null, 1) + '\n');
console.log(`wrote ${tags.length} tags to ${out}`);
