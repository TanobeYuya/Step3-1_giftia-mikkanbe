// フックの動作確認。一時ディレクトリに git リポジトリを作り、各フックに JSON を渡して判定を確かめる。
// 使い方: node scripts/test-hooks.js
// 一時ディレクトリは削除しない（最後にパスを表示する）。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const hooks = path.join(root, '.claude', 'hooks');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hook-test-'));

const cfg = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'project.json'), 'utf8'));
cfg.guards.forbiddenInPaths = [
  { paths: ['app/frontend/**'], pattern: 'service_role|SERVICE_ROLE', reason: 'フロントエンドに service_role を置かない' },
];
cfg.guards.commandRules = [
  { match: 'deploy-cli\\s+--prod', requireLastCommitAuthorEmailIncludes: '{self}', reason: '最新コミットの作者が本人でないとデプロイがブロックされる' },
];
cfg.team.members[0] = { name: 'テスト', github: 'test-self', role: '', self: true };
const templateCfg = JSON.parse(JSON.stringify(cfg));
cfg.template.source = 'https://example.com/claude-project-template.git';
fs.mkdirSync(path.join(tmp, '.claude'));
fs.writeFileSync(path.join(tmp, '.claude', 'project.json'), JSON.stringify(cfg, null, 2));

const git = (...a) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8' });
git('init', '-q', '-b', 'main');
git('-c', 'user.name=other', '-c', 'user.email=other@example.com', 'commit', '-q', '--allow-empty', '-m', 'init');

function runHook(file, toolInput) {
  const r = spawnSync('node', [path.join(hooks, file)], {
    input: JSON.stringify({ cwd: tmp, tool_input: toolInput }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    encoding: 'utf8',
  });
  if (!r.stdout.trim()) return 'allow';
  try {
    return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
  } catch {
    return r.stdout.trim();
  }
}

let fail = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'NG  '} ${label} → ${got}${ok ? '' : `（期待: ${want}）`}`);
}
const bash = (c) => runHook('guard-bash.js', { command: c });
const write = (f, content) => runHook('guard-write.js', { file_path: path.join(tmp, f), content });
const jwt = 'ey' + 'J' + 'a'.repeat(24) + '.' + 'b'.repeat(24);

console.log('--- guard-bash（main 上）');
check('main で git commit', bash('git commit -m "feat(backend): x (#1)"'), 'deny');
check('main で引数なし git push', bash('git push'), 'deny');
check('rm -rf', bash('rm -rf build'), 'deny');
check('複合コマンド内の git push --force', bash('cd x && git push --force origin a'), 'deny');
check('git reset --hard', bash('git reset --hard HEAD~1'), 'deny');
check('規約外のブランチ名', bash('git switch -c my_branch'), 'deny');
check('規約どおりのブランチ名', bash('git switch -c feature/issue-1-add-goal'), 'allow');
check('git status', bash('git status'), 'allow');

git('switch', '-q', '-c', 'feature/issue-1-add-goal');
console.log('--- guard-bash（作業ブランチ上）');
check('規約外のコミットメッセージ', bash('git commit -m "update"'), 'deny');
check('未定義の scope', bash('git commit -m "feat(api): x"'), 'deny');
check('規約どおりのコミット', bash('git commit -m "feat(backend): 目標を保存 (#1)"'), 'allow');
check('ヒアドキュメントのコミット', bash("git commit -m \"$(cat <<'EOF'\ndocs(docs): 手順を追記\n\nCo-Authored-By: x\nEOF\n)\""), 'allow');
check('作業ブランチを push', bash('git push -u origin feature/issue-1-add-goal'), 'allow');
check('main を明示して push', bash('git push origin HEAD:main'), 'deny');
check('作者が別人のままデプロイ（{self} 条件）', bash('deploy-cli --prod'), 'deny');
git('-c', 'user.name=me', '-c', 'user.email=1+test-self@users.noreply.github.com', 'commit', '-q', '--allow-empty', '-m', 'docs(docs): x');
check('作者が本人でデプロイ（{self} 条件）', bash('deploy-cli --prod'), 'allow');

console.log('--- guard-bash（PR 作成前の事前レビュー）');
const base = git('rev-list', '--max-parents=0', 'HEAD').trim();
git('update-ref', 'refs/remotes/origin/main', base);
const commitFile = (f) => {
  fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true });
  fs.writeFileSync(path.join(tmp, f), 'x\n');
  git('add', f);
  git('-c', 'user.name=me', '-c', 'user.email=me@example.com', 'commit', '-q', '-m', 'docs(docs): x');
};
commitFile('docs/guide.md');
check('文書だけの PR はレビューなしで作成可', bash('gh pr create --title t --body b'), 'allow');
commitFile('app/backend/main.py');
check('コード変更でレビュー記録なし', bash('gh pr create --title t --body b'), 'deny');
const head = git('rev-parse', 'HEAD').trim();
const reviews = path.join(tmp, '.claude', 'state', 'reviews');
fs.mkdirSync(reviews, { recursive: true });
fs.writeFileSync(path.join(reviews, `${head}.md`), '判定: 要対応あり\n');
check('レビューで要対応あり', bash('gh pr create --title t --body b'), 'ask');
fs.writeFileSync(path.join(reviews, `${head}.md`), '判定: 要対応なし\n');
check('レビューで要対応なし', bash('gh pr create --title t --body b'), 'allow');
commitFile('app/backend/util.py');
check('レビュー後に追加コミット（記録が古い）', bash('gh pr create --title t --body b'), 'deny');

console.log('--- guard-write');
check('.env を書く', write('app/backend/.env', 'A=1'), 'deny');
check('JWT らしき文字列を書く', write('app/backend/config.py', `KEY = "${jwt}"`), 'deny');
check('.env.example に書く', write('app/backend/.env.example', `KEY=${jwt}`), 'allow');
check('.env.sample に書く', write('app/backend/.env.sample', `KEY=${jwt}`), 'allow');
check('.env.template に書く', write('app/backend/.env.template', `KEY=${jwt}`), 'allow');
check('.env.production.example に書く', write('app/backend/.env.production.example', `KEY=${jwt}`), 'allow');
check('.env.production.sample に書く', write('app/backend/.env.production.sample', `KEY=${jwt}`), 'allow');
check('.env.d/ の中の .sample には鍵を書けない（見本ではない）', write('app/backend/.env.d/config.sample', `KEY=${jwt}`), 'deny');
check('.env.d/ の中の .template には鍵を書けない（見本ではない）', write('app/backend/.env.d/config.template', `KEY=${jwt}`), 'deny');
check('従来どおり .example で終わるファイルは値の見本を書ける', write('app/backend/settings.example', `KEY=${jwt}`), 'allow');
check('環境変数ファイル以外の .template には鍵を書けない', write('app/backend/config.template', `KEY=${jwt}`), 'deny');
check('環境変数ファイル以外の .sample には鍵を書けない', write('app/backend/config.sample', `KEY=${jwt}`), 'deny');
// 検出パターンに当たる文字列は、このファイル自体が検出されないよう、組み立てて作る
const azure = {
  'Azure Storage の AccountKey': 'Account' + 'Key=' + 'Ab1'.repeat(15),
  'Azure の共有アクセスキー': 'SharedAccess' + 'Key=' + 'Cd2'.repeat(15),
  'Azure の SAS トークン': 'https://acct.blob.core.windows.net/c/f?sv=2022-11-02&s' + 'ig=' + 'Ef3'.repeat(15) + '%3D',
  'Azure AD のクライアントシークレット': 'abc' + '8Q' + '~' + 'g'.repeat(34),
  'パスワード入りの SQL 接続文字列': 'Server=tcp:x.database.windows.net;Database=d;User Id=u;Pass' + 'word=Secret12345;',
  'Azure の発行プロファイルのパスワード': 'user' + 'PWD="' + 'p'.repeat(24) + '"',
  '小文字の s で始まるパスワードの SQL 接続文字列': 'Server=tcp:x.database.windows.net;Database=d;User Id=u;Pass' + 'word=sunshine123;',
  'server= の小文字の接続文字列': 'server=tcp:x.database.windows.net;database=d;user id=u;pass' + 'word=Secret12345;',
  'Host= 形式の接続文字列': 'Host=db.example.com;Port=5432;Pass' + 'word=Secret12345;',
  'SERVER= の大文字の接続文字列': 'SERVER=tcp:x.database.windows.net;DATABASE=d;PASS' + 'WORD=Secret12345;',
  '記号（$）で始まるパスワードの接続文字列': 'Server=tcp:x.database.windows.net;Database=d;Pass' + 'word=$ecret12345;',
  '記号（*）で始まるパスワードの接続文字列': 'Server=tcp:x.database.windows.net;Database=d;Pass' + 'word=*Secret99;',
  '閉じていない記号（%）で始まるパスワードの接続文字列': 'Server=tcp:x.database.windows.net;Database=d;Pass' + 'word=%secret99;',
  '説明用の値のあとに、実際のパスワードがある接続文字列': 'Server=x;Pass' + 'word=<your_password>;Pass' + 'word=Secret12345;',
  '説明用の形（<…>）のあとに文字が続くパスワード': 'Server=x;Pass' + 'word=<a>b123456;',
  '説明用の形（${…}）のあとに文字が続くパスワード': 'Server=x;Pass' + 'word=${A}suffix1234;',
  'Pwd= の接続文字列': 'Server=x;Pw' + 'd=Secret12345;',
  'Data Source= の接続文字列': 'Data Source=tcp:x;Pass' + 'word=Secret12345;',
};
for (const [label, value] of Object.entries(azure)) check(`${label}を書く`, write('app/backend/settings.py', `X = '${value}'`), 'deny');
check('説明用の値（${名前}）の接続文字列', write('app/backend/settings.py', "X = 'Server=tcp:x.database.windows.net;Database=d;Pass" + "word=${DB_PASSWORD};'"), 'allow');
check('説明用の形（${名前}）の直後が閉じ引用符（appsettings.json など）', write('app/backend/appsettings.json', '{ "Db": "Server=x;Database=d;Pass' + 'word=${DB_PASSWORD}" }'), 'allow');
check('説明用の形（%名前%）の直後が閉じ引用符', write('app/backend/settings.py', "X = 'Server=x;Pass" + "word=%DB_PASS%'"), 'allow');
check('説明用の形（{{名前}}）の接続文字列', write('app/backend/settings.py', "X = 'Server=x;Pass" + "word={{x}};'"), 'allow');
check('説明用の形（<…>）のあとに文字が続く（引用符の前でも止まる）', write('app/backend/settings.py', "X = 'Server=x;Pass" + "word=<a>b123456'"), 'deny');
check('説明用の値（%名前%）の接続文字列', write('app/backend/settings.py', "X = 'Server=tcp:x.database.windows.net;Database=d;Pass" + "word=%DB_PASS%;'"), 'allow');
check('説明用のパスワード（<…>）の接続文字列', write('app/backend/settings.py', "X = 'Server=tcp:x.database.windows.net;Database=d;Pass" + "word=<your_password>;'"), 'allow');
check('パスワードなしの接続文字列', write('app/backend/settings.py', "X = 'Server=tcp:x.database.windows.net;Database=d;Authentication=Active Directory Default;'"), 'allow');
check('frontend に service_role', write('app/frontend/lib/db.ts', 'const k = process.env.SUPABASE_SERVICE_ROLE_KEY'), 'deny');
check('backend に service_role', write('app/backend/db.py', 'k = os.environ["SUPABASE_SERVICE_ROLE_KEY"]'), 'allow');
check('普通のコード', write('app/frontend/page.tsx', 'export default function Page() {}'), 'allow');

console.log('--- guard-bash（cd で別のリポジトリを操作）');
const sub = path.join(tmp, '.claude', 'state', 'template-work');
fs.mkdirSync(path.join(sub, '.claude'), { recursive: true });
fs.writeFileSync(path.join(sub, '.claude', 'project.json'), JSON.stringify(templateCfg, null, 2));
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: sub });
check('別リポジトリの main でコミット（自分は作業ブランチ）', bash('cd .claude/state/template-work && git commit -m "feat(claude): x"'), 'deny');
check('別リポジトリの main でコミット（git -C）', bash('git -C .claude/state/template-work commit -m "feat(claude): x"'), 'deny');
check('引用符つきのパス', bash('cd ".claude/state/template-work" && git commit -m "feat(claude): x"'), 'deny');
check('別リポジトリのサブディレクトリへ cd', bash('cd .claude/state/template-work/.claude && git commit -m "feat(claude): x"'), 'deny');
check('git -C を含む複合コマンドは元のプロジェクトで判定', bash('git -C .claude/state/template-work status && git commit -m "feat(claude): x"'), 'allow');
check('メッセージ中の "git -C" で判定先が変わらない', bash('git commit -m "docs(docs): git -C .claude/state/template-work の説明"'), 'allow');
const bare = path.join(tmp, '.claude', 'state', 'bare-repo');
fs.mkdirSync(bare, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: bare });
check('project.json のない別リポジトリで rm -rf', bash('cd .claude/state/bare-repo && rm -rf x'), 'deny');
check('project.json のない別リポジトリで reset --hard', bash('cd .claude/state/bare-repo && git reset --hard'), 'deny');
check('project.json のない別リポジトリの main でコミット（元の規約で判定）', bash('cd .claude/state/bare-repo && git commit -m "feat(backend): x"'), 'deny');
check('.git のないディレクトリへ cd（元のプロジェクトで判定）', bash('cd app && git commit -m "feat(backend): x"'), 'allow');
if (process.platform === 'win32') {
  const posix = sub.replace(/^([A-Za-z]):\\/, (_, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/');
  check('/c/... 形式の絶対パス', bash(`cd ${posix} && git commit -m "feat(claude): x"`), 'deny');
}
execFileSync('git', ['switch', '-q', '-c', 'chore/promote-x'], { cwd: sub });
check('別リポジトリの作業ブランチでコミット', bash('cd .claude/state/template-work && git commit -m "feat(claude): x"'), 'allow');

console.log('--- promote-hint');
function hint(file, session, projectDir = tmp) {
  const r = spawnSync('node', [path.join(hooks, 'promote-hint.js')], {
    input: JSON.stringify({ cwd: projectDir, session_id: session, tool_input: { file_path: path.join(projectDir, file) } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
  if (!r.stdout.includes('additionalContext')) return 'none';
  const silent = r.stdout.includes('伝えない') && !r.stdout.includes('入れますか') && !r.stdout.includes('一言添える');
  return r.stdout.includes('record-template-idea') && silent ? 'hint' : 'bad-message';
}
check('CLAUDE.md を変更', hint('CLAUDE.md', 's1'), 'hint');
check('同じセッションで同じファイルをもう一度', hint('CLAUDE.md', 's1'), 'none');
check('スキルを追加', hint('.claude/skills/new-skill/SKILL.md', 's1'), 'hint');
check('アプリのコードを変更', hint('app/backend/main.py', 's1'), 'none');
check('作業用 clone の中を変更', hint('.claude/state/template-work/CLAUDE.md', 's1'), 'none');
check('別のセッションで CLAUDE.md', hint('CLAUDE.md', 's2'), 'hint');
check('ひな形そのもの（source が空）', hint('CLAUDE.md', 's3', sub), 'none');
fs.writeFileSync(path.join(tmp, '.claude', 'state', 'promote-hints', 's4.json'), '{"broken": true');
check('壊れた状態ファイルでも落ちない', hint('CLAUDE.md', 's4'), 'hint');
cfg.template.promoteHints = false;
fs.writeFileSync(path.join(tmp, '.claude', 'project.json'), JSON.stringify(cfg, null, 2));
check('promoteHints: false', hint('CLAUDE.md', 's5'), 'none');

console.log('--- progress-hint');
function progress(event, session, extra = {}) {
  const r = spawnSync('node', [path.join(hooks, 'progress-hint.js')], {
    input: JSON.stringify({ cwd: tmp, session_id: session, hook_event_name: event, tool_name: 'Bash', ...extra }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    encoding: 'utf8',
  });
  if (!r.stdout.includes('additionalContext')) return 'none';
  return r.stdout.includes('日本語で進捗') ? 'report' : 'bad-message';
}
progress('UserPromptSubmit', 'p1');
const firstFive = [1, 2, 3, 4, 5].map(() => progress('PostToolUse', 'p1'));
check('4回目までは何もしない', firstFive.slice(0, 4).every((v) => v === 'none') ? 'none' : 'report', 'none');
check('5回目で報告を促す', firstFive[4], 'report');
check('サブエージェントの呼び出しは数えない', [1, 2, 3, 4, 5].map(() => progress('PostToolUse', 'p1', { agent_id: 'sub' })).includes('report') ? 'report' : 'none', 'none');
const nextFive = [1, 2, 3, 4, 5].map(() => progress('PostToolUse', 'p1'));
check('10回目で再び報告を促す', nextFive[4], 'report');
progress('UserPromptSubmit', 'p1');
check('新しい発言でリセット（1回目）', progress('PostToolUse', 'p1'), 'none');
fs.writeFileSync(path.join(tmp, '.claude', 'state', 'progress', 'p2.json'), 'broken');
check('壊れた状態ファイルでも落ちない', progress('PostToolUse', 'p2'), 'none');
cfg.ux.progressEvery = 0;
fs.writeFileSync(path.join(tmp, '.claude', 'project.json'), JSON.stringify(cfg, null, 2));
check('progressEvery: 0 で無効', [1, 2, 3, 4, 5].map(() => progress('PostToolUse', 'p3')).includes('report') ? 'report' : 'none', 'none');

console.log('--- session-start の出力');
const s = spawnSync('node', [path.join(hooks, 'session-start.js')], {
  input: JSON.stringify({ cwd: tmp }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
  encoding: 'utf8',
});
console.log(s.stdout.trim());

console.log(`\n${fail === 0 ? '全件 OK' : `NG ${fail} 件`}（一時リポジトリ: ${tmp}）`);
process.exit(fail ? 1 : 0);
