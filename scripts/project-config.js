// .claude/project.json の値を、検証つきで書き換える（書式は他のスクリプトと同じ: 2 スペース字下げ・末尾に改行）。
// 使い方（導入先のリポジトリの直下で実行する）:
//   node scripts/project-config.js get <項目>                      例: team.name
//   node scripts/project-config.js set <項目> <値>                  書き換えてよい項目だけ（下の ALLOWED）
//   node scripts/project-config.js add-member --name <ニックネーム> --github <ID> [--role <役割>] [--scope <担当範囲>] [--self]
//   node scripts/project-config.js set-self <ID>                    作業者本人を切り替える
//   node scripts/project-config.js clear-members                    メンバーの枠をすべて空にする（4 枠）
//   node scripts/project-config.js set-modules <機能,機能,...>      導入済みの機能を記録する（置き換える。core が必須）
//   node scripts/project-config.js add-modules <機能,機能,...>      記録済みの機能に足す（apply.sh が使う）
// 名前（name）には、本名ではなくニックネームを入れる。公開ページに表示されるため。
const fs = require('fs');
const path = require('path');

// 書き換えてよい項目と、その型。string は、数字だけの値（例: プロジェクト名 2024）も文字列のまま保存する
const ALLOWED = {
  'project.name': 'string',
  'project.purpose': 'string',
  'team.name': 'string',
  'team.issueCloser': 'string',
  'template.promoteHints': 'boolean',
  'ux.progressEvery': 'count',
};
const GITHUB_ID = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const SLOTS = 4;

const file = path.join(process.cwd(), '.claude', 'project.json');
const fail = (msg) => { process.stderr.write(`エラー: ${msg}\n`); process.exit(1); };
if (!fs.existsSync(file)) fail('.claude/project.json がありません。導入先のリポジトリの直下で実行してください');
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const save = () => fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
const emptyMember = () => ({ name: '', github: '', role: '', scope: '' });
const isEmpty = (m) => !m.name && !m.github;

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  parent[last] = value;
}
function options(args) {
  const o = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--self') o.self = true;
    else if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i];
    else fail(`不明な引数: ${args[i]}`);
  }
  return o;
}

const [cmd, ...args] = process.argv.slice(2);
cfg.team = cfg.team || {};
cfg.team.members = cfg.team.members || [];

if (cmd === 'get') {
  const v = getPath(cfg, args[0] || fail('項目を指定してください'));
  process.stdout.write((typeof v === 'string' ? v : JSON.stringify(v, null, 2)) + '\n');
} else if (cmd === 'set') {
  const [key, raw] = args;
  if (!key || raw === undefined) fail('項目と値を指定してください');
  const type = Object.prototype.hasOwnProperty.call(ALLOWED, key) ? ALLOWED[key] : undefined; // constructor などの継承された名前を除く
  if (!type) fail(`この項目は書き換えられません: ${key}（書き換えられる項目: ${Object.keys(ALLOWED).join(', ')}）`);
  let value = raw;
  if (type === 'boolean') {
    if (raw !== 'true' && raw !== 'false') fail(`${key} には true か false を指定してください`);
    value = raw === 'true';
  } else if (type === 'count') {
    if (!/^\d+$/.test(raw)) fail(`${key} には 0 以上の整数を指定してください`);
    value = Number(raw);
  }
  setPath(cfg, key, value);
  save();
  console.log(`${key} = ${JSON.stringify(getPath(cfg, key))}`);
} else if (cmd === 'add-member') {
  const o = options(args);
  const name = (o.name || '').trim();
  const github = (o.github || '').trim();
  if (!name) fail('--name（ニックネーム）が必要です');
  if (name.length > 20) fail('名前が長すぎます（20 文字まで）。ニックネームを入れてください');
  if (/[\u0000-\u001f]/.test(name)) fail('名前に制御文字は使えません');
  if (!GITHUB_ID.test(github)) fail(`GitHub ID の形式が正しくありません: ${github || '（空）'}`);
  const members = cfg.team.members;
  if (members.some((m) => (m.github || '').toLowerCase() === github.toLowerCase())) fail(`すでに登録されています: ${github}`);
  if (o.self && members.some((m) => m.self)) fail('作業者本人（self）はすでにいます。切り替えるときは set-self を使ってください');
  const member = { name, github, role: (o.role || '').trim(), scope: (o.scope || '').trim() };
  if (o.self) member.self = true;
  const slot = members.findIndex(isEmpty);
  if (slot >= 0) members[slot] = member; else members.push(member);
  save();
  console.log(`メンバーを登録しました: ${name}（@${github}）${o.self ? ' ・作業者本人' : ''}`);
} else if (cmd === 'set-self') {
  const github = (args[0] || '').toLowerCase();
  const target = cfg.team.members.find((m) => (m.github || '').toLowerCase() === github);
  if (!target) fail(`メンバーにいません: ${args[0] || '（空）'}`);
  cfg.team.members.forEach((m) => { delete m.self; });
  target.self = true;
  save();
  console.log(`作業者本人を切り替えました: ${target.name}（@${target.github}）`);
} else if (cmd === 'clear-members') {
  cfg.team.members = Array.from({ length: SLOTS }, emptyMember);
  save();
  console.log(`メンバーの枠を空にしました（${SLOTS} 枠）`);
} else if (cmd === 'set-modules' || cmd === 'add-modules') {
  // add-modules: すでに記録されている機能に、足す（機能を省略した再実行で、記録が減らないようにする）
  let names = (args[0] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (cmd === 'add-modules') names = [...((cfg.template || {}).modules || []), ...names];
  if (!names.includes('core')) fail('core は必須です');
  const manifestFile = path.join(process.cwd(), 'scripts', 'modules.json');
  if (fs.existsSync(manifestFile)) {
    const known = Object.keys(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).modules);
    const bad = names.filter((n) => !known.includes(n));
    if (bad.length) fail(`不明な機能: ${bad.join(', ')}（${known.join(', ')}）`);
  }
  cfg.template = { ...(cfg.template || {}), modules: [...new Set(names)] };
  save();
  console.log(`導入済みの機能: ${cfg.template.modules.join(', ')}`);
} else {
  fail('使い方は、このファイルの先頭のコメントを見てください');
}
