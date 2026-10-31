// 機能（モジュール）のファイルを、導入先へコピー・更新する。apply.sh と update.sh から呼ばれる。
// 使い方: node scripts/sync-module.js <apply|update> --src <ひな形のパス> --dst <導入先のパス> <機能名>
//   apply : ない物だけコピーする。すでにある物は上書きせず、skip と表示する。
//   update: projectFiles 以外は、違えば上書きする。projectFiles は上書きせず、差分だけ表示する。
//   どちらも、機能が求める .gitignore の行のうち、無いものだけ追記する。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { listByKind } = require('./list-module-files');

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
const same = (a, b) => fs.readFileSync(a).equals(fs.readFileSync(b));

function mergeGitignore(dst, lines, log) {
  const file = path.join(dst, '.gitignore');
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const have = new Set(text.split(/\r?\n/));
  const add = lines.filter((l) => !have.has(l));
  if (!add.length) return;
  if (text && !text.endsWith('\n')) text += '\n';
  fs.writeFileSync(file, text + add.join('\n') + '\n');
  add.forEach((l) => log(`.gitignore に追記: ${l}`));
}

function applyModule(src, dst, name, log = console.log) {
  for (const f of listByKind(src, name, 'files')) {
    const to = path.join(dst, f);
    if (fs.existsSync(to)) {
      log(`skip（既にある。手で差分を取り込む）: ${f}`);
    } else {
      copy(path.join(src, f), to);
      log(`copy: ${f}`);
    }
  }
  mergeGitignore(dst, listByKind(src, name, 'gitignore'), log);
}

function updateModule(src, dst, name, log = console.log) {
  for (const f of listByKind(src, name, 'common')) {
    const from = path.join(src, f);
    const to = path.join(dst, f);
    if (!fs.existsSync(to)) {
      copy(from, to);
      log(`追加: ${f}`);
    } else if (!same(from, to)) {
      copy(from, to);
      log(`更新: ${f}`);
    }
  }
  mergeGitignore(dst, listByKind(src, name, 'gitignore'), log);
  for (const f of listByKind(src, name, 'project')) {
    const from = path.join(src, f);
    const to = path.join(dst, f);
    if (!fs.existsSync(to)) {
      copy(from, to);
      log(`追加: ${f}`);
    } else if (!same(from, to)) {
      log('');
      log(`=== ${f} はひな形と違います（上書きしていません。必要な部分だけ手で取り込んでください）`);
      const r = spawnSync('diff', ['-u', to, from], { encoding: 'utf8' });
      log((r.stdout || '').split('\n').slice(0, 60).join('\n'));
    }
  }
}

module.exports = { applyModule, updateModule };

if (require.main === module) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    let src = '';
    let dst = '';
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--src') src = path.resolve(args[++i]);
      else if (args[i] === '--dst') dst = path.resolve(args[++i]);
      else rest.push(args[i]);
    }
    if (!['apply', 'update'].includes(mode) || !src || !dst || !rest[0]) throw new Error('使い方は、このファイルの先頭のコメントを見てください');
    (mode === 'apply' ? applyModule : updateModule)(src, dst, rest[0]);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
