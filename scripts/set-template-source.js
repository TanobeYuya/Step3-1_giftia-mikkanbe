// project.json の template.source と template.version を書き換える（他の値と書式は保つ）。
// 使い方: node scripts/set-template-source.js <取得元> <版>
const fs = require('fs');
const path = require('path');

const [source, version] = process.argv.slice(2);
const file = path.join(process.cwd(), '.claude', 'project.json');
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
cfg.template = { ...(cfg.template || {}), source, version };
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
