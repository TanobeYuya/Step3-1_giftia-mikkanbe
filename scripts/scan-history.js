// リポジトリの全履歴（全ブランチ・全コミット）から、機密情報らしき文字列と、コミットされた環境変数ファイルを探す。
// private から public に切り替える前に使う。読み取りだけで、リポジトリは変更しない。
// 使い方（リポジトリの直下で実行）: node scripts/scan-history.js
// 検出パターンは .claude/project.json の guards.secretPatterns を使う（guard-write と同じ）。
// 値は全部を表示せず、先頭の 4 文字と長さだけを出す。見つかったら、履歴の書き換えではなく、キーの再発行（ローテーション）で対処する。
// 終了コード: 0=見つからなかった／ 1=見つかった／ 2=実行できなかった
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, execFileSync } = require('child_process');

const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
const ENV_OK = /\.(example|sample|template)$/;

function loadPatterns(root) {
  const file = path.join(root, '.claude', 'project.json');
  if (!fs.existsSync(file)) throw new Error('.claude/project.json がありません。検出パターンを読めません');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = ((cfg.guards || {}).secretPatterns || []).map((p) => ({ name: p.name, re: new RegExp(p.pattern, 'g' + (p.flags || '').replace(/g/g, '')) }));
  if (!list.length) throw new Error('project.json の guards.secretPatterns が空です');
  return list;
}

function mask(s) {
  return `${s.slice(0, 4)}…（${s.length} 文字）`;
}

// git は、日本語・空白・引用符を含むファイル名を、引用符つきの C 形式（"b/\343\201…"）で出すことがある。元の文字列に戻す。
function unquote(s) {
  const body = s.replace(/^"/, '').replace(/"$/, '');
  const escapes = { t: '\t', n: '\n', r: '\r', '"': '"', '\\': '\\' };
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') { bytes.push(...Buffer.from(body[i])); continue; }
    const next = body[++i];
    if (/[0-7]/.test(next)) {
      const oct = body.slice(i).match(/^[0-7]{1,3}/)[0];
      bytes.push(parseInt(oct, 8));
      i += oct.length - 1;
    } else {
      bytes.push(...Buffer.from(escapes[next] !== undefined ? escapes[next] : next));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

// 差分の見出し行（+++ b/パス）から、パスを取り出す。削除されたファイル（/dev/null）は空文字を返す。
function parseTarget(text) {
  let p = text.slice(4).replace(/\t.*$/, ''); // 名前に空白があると、末尾にタブが付く
  if (p === '/dev/null') return '';
  if (p.startsWith('"')) p = unquote(p);
  return p.startsWith('b/') ? p.slice(2) : p;
}

function scan(root, patterns, onDone) {
  const findings = [];
  const seen = new Set();
  const add = (f) => {
    const key = `${f.commit}|${f.file}|${f.kind}|${f.value || ''}`;
    if (!seen.has(key)) { seen.add(key); findings.push(f); }
  };
  // -m: マージコミット自身の差分（競合の解決で入った行）も調べる。quotePath=false: 日本語のファイル名をそのまま出す
  const git = spawn('git', ['-c', 'core.quotePath=false', 'log', '--all', '-m', '--no-color', '-p', '-U0', '--format=@@COMMIT@@%H'], { cwd: root });
  let commit = '';
  let file = '';
  let line = 0;
  let inHeader = false; // 見出し行（diff --git … から最初の @@ まで）の中だけ、+++ を見出しとして読む
  const rl = readline.createInterface({ input: git.stdout, crlfDelay: Infinity });
  rl.on('line', (text) => {
    if (text.startsWith('@@COMMIT@@')) { commit = text.slice(10); file = ''; inHeader = false; return; }
    if (text.startsWith('diff --git ') || text.startsWith('diff --cc ')) { inHeader = true; file = ''; return; }
    if (inHeader && text.startsWith('rename to ')) {
      // 内容を変えない名前の変更（.env.sample → .env など）は、+++ の行が出ないので、ここで調べる
      const renamed = text.slice(10).startsWith('"') ? unquote(text.slice(10)) : text.slice(10);
      if (ENV_FILE.test(renamed) && !ENV_OK.test(renamed)) add({ commit, file: renamed, kind: '環境変数ファイルがコミットされている', line: 0 });
      return;
    }
    if (inHeader && text.startsWith('+++ ')) {
      file = parseTarget(text);
      if (file && ENV_FILE.test(file) && !ENV_OK.test(file)) add({ commit, file, kind: '環境変数ファイルがコミットされている', line: 0 });
      return;
    }
    const hunk = /^@@ -\S+ \+(\d+)/.exec(text);
    if (hunk) { inHeader = false; line = Number(hunk[1]) - 1; return; }
    if (!inHeader && text.startsWith('+')) {
      line += 1;
      // パスが分からなくても読み飛ばさない（見逃しを防ぐ）
      const where = file || '(パス不明)';
      for (const p of patterns) {
        p.re.lastIndex = 0;
        const m = p.re.exec(text.slice(1));
        if (m) add({ commit, file: where, kind: p.name, line, value: mask(m[0]) });
      }
    }
  });
  git.on('error', (e) => onDone(e));
  git.on('close', (code) => (code === 0 ? onDone(null, findings) : onDone(new Error(`git log が失敗しました（終了コード ${code}）`))));
}

module.exports = { scan, loadPatterns, mask, unquote, parseTarget };

if (require.main === module) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const patterns = loadPatterns(root);
    // shallow clone は履歴の一部しかない。「見つからなかった」と誤解しないよう、調べずに終わる
    if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim() === 'true') {
      console.error('エラー: このリポジトリは shallow clone で、履歴の一部しかありません。git fetch --unshallow のあとに、もう一度実行してください。');
      process.exit(2);
    }
    const commits = execFileSync('git', ['rev-list', '--all', '--count'], { cwd: root, encoding: 'utf8' }).trim();
    scan(root, patterns, (err, findings) => {
      if (err) { console.error(`エラー: ${err.message}`); process.exit(2); }
      console.log(`履歴を調べました: ${commits} コミット、検出パターン ${patterns.length} 件`);
      if (!findings.length) { console.log('機密情報らしき文字列は見つかりませんでした。'); process.exit(0); }
      console.log(`\n見つかった: ${findings.length} 件`);
      for (const f of findings) {
        console.log(`  ${f.commit.slice(0, 7)} ${f.file}${f.line ? `:${f.line}` : ''}  ${f.kind}${f.value ? `  ${f.value}` : ''}`);
      }
      console.log('\n対処: 該当のキー・パスワードを再発行して無効にしてください（履歴を書き換えても、すでに取得された値は戻りません）。');
      console.log('公開してよいと判断できるまでは、public にしないでください。');
      process.exit(1);
    });
  } catch (e) {
    console.error(`エラー: ${e.message}`);
    process.exit(2);
  }
}
