// 機能（モジュール）ごとのファイル一覧を出す。apply.sh・update.sh・adopt-template スキルが使う。
// 使い方:
//   node scripts/list-module-files.js [--root <ひな形のパス>] <機能名> [--kind files|common|project|gitignore]
//   node scripts/list-module-files.js [--root <ひな形のパス>] --json     機能の一覧（名前・題名・要約・推奨）
// kind: files=すべて（既定）／ common=projectFiles を除いたもの／ project=projectFiles ／ gitignore=追記する行
const fs = require('fs');
const path = require('path');

// 一覧表のパスは、ひな形の中の相対パスだけ許す（.. や絶対パスで、導入先の外へ書き込まれないようにする）
function assertSafe(entry) {
  const p = String(entry).replace(/\/$/, '');
  if (!p || path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.includes('\\') || p.split('/').some((s) => s === '..' || s === '' || s === '.')) {
    throw new Error(`一覧表のパスが正しくありません: ${entry}`);
  }
}

function loadManifest(root) {
  const file = path.join(root, 'scripts', 'modules.json');
  if (!fs.existsSync(file)) throw new Error(`${file} がありません`);
  const modules = JSON.parse(fs.readFileSync(file, 'utf8')).modules;
  for (const m of Object.values(modules)) [...(m.files || []), ...(m.exclude || []), ...(m.projectFiles || [])].forEach(assertSafe);
  return modules;
}

// シンボリックリンクは辿らない（ひな形の外のファイルを取り込まないようにする）
function walk(root, rel) {
  const abs = path.join(root, rel);
  let st;
  try { st = fs.lstatSync(abs); } catch { return []; }
  if (st.isSymbolicLink()) return [];
  if (!st.isDirectory()) return [rel];
  return fs.readdirSync(abs).flatMap((name) => walk(root, `${rel}/${name}`));
}

function expand(root, entries) {
  return entries.flatMap((e) => walk(root, e.replace(/\/$/, '')));
}

function isExcluded(file, excludes) {
  return excludes.some((x) => (x.endsWith('/') ? file.startsWith(x) : file === x));
}

// base の機能は、他の機能が持つファイルを除く
function moduleFiles(root, name, modules = loadManifest(root)) {
  const m = modules[name];
  if (!m) throw new Error(`不明な機能: ${name}（${Object.keys(modules).join(', ')}）`);
  let files = expand(root, m.files).filter((f) => !isExcluded(f, m.exclude || []));
  if (m.base) {
    const others = new Set(
      Object.entries(modules)
        .filter(([n]) => n !== name)
        .flatMap(([, o]) => expand(root, o.files).filter((f) => !isExcluded(f, o.exclude || []))),
    );
    files = files.filter((f) => !others.has(f));
  }
  return [...new Set(files)].sort();
}

function listByKind(root, name, kind = 'files') {
  const modules = loadManifest(root);
  const all = moduleFiles(root, name, modules);
  const project = (modules[name].projectFiles || []).filter((f) => all.includes(f));
  if (kind === 'files') return all;
  if (kind === 'project') return project;
  if (kind === 'common') return all.filter((f) => !project.includes(f));
  if (kind === 'gitignore') return modules[name].gitignore || [];
  throw new Error(`不明な kind: ${kind}`);
}

module.exports = { loadManifest, moduleFiles, listByKind };

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let root = path.resolve(__dirname, '..');
    let kind = 'files';
    let json = false;
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--root') root = path.resolve(args[++i]);
      else if (args[i] === '--kind') kind = args[++i];
      else if (args[i] === '--json') json = true;
      else rest.push(args[i]);
    }
    if (json) {
      const modules = loadManifest(root);
      const out = Object.entries(modules).map(([name, m]) => ({ name, title: m.title, summary: m.summary, recommend: m.recommend, base: !!m.base }));
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    } else {
      if (!rest[0]) throw new Error('機能名を指定してください');
      const lines = listByKind(root, rest[0], kind);
      if (lines.length) process.stdout.write(lines.join('\n') + '\n');
    }
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
