// 質問ログ（.claude/state/qa-log/）を、セッションごとの「学びのまとめ」にする。頼まれたときに手で実行する。
// 使い方: node scripts/qa-summarize.js [開始日] [終了日] [--dry-run]
//   日付は YYYY-MM-DD。省略時は今日だけ。開始日だけなら、その日だけ。
//   --dry-run: claude を呼ばず、渡すプロンプトを表示する（確認用）。
// 例:     node scripts/qa-summarize.js 2026-11-01 2026-11-03
// 出力:   .claude/state/qa-log/summary/<開始日>[_<終了日>].md（gitignore 済みで GitHub に載らない）
// まとめは claude -p（haiku、ツールなし）で作る。QA_LOG_DISABLE を付けて、子の claude で質問ログが動かないようにする。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..');
const logDir = path.join(root, '.claude', 'state', 'qa-log');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const from = dates[0] || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const to = dates[1] || from;

if (!fs.existsSync(logDir)) {
  console.log(`質問ログがありません: ${logDir}`);
  process.exit(0);
}

// セッションごとに質問と回答を集める。見出しの 〔s:ID〕 を使い、無い古い記録は回答欄の #時刻-ID の ID を使う
const sessions = new Map();
for (const file of fs.readdirSync(logDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort()) {
  const date = file.replace('.md', '');
  if (date < from || date > to) continue;
  for (const entry of fs.readFileSync(path.join(logDir, file), 'utf8').split(/^## /m).slice(1)) {
    const [head, ...rest] = entry.trim().split('\n');
    const question = (rest.find((l) => l.startsWith('質問:')) || '').replace('質問:', '').trim();
    const answer = (rest.find((l) => l.startsWith('回答:')) || '').replace('回答:', '').trim();
    if (!question) continue;
    const id = (head.match(/〔s:([\w-]+)〕/) || answer.match(/#\d{6}-([\w-]+)/) || [])[1] || '不明';
    const time = head.split(' ')[0];
    if (!sessions.has(id)) sessions.set(id, []);
    sessions.get(id).push(`- ${date} ${time} 質問: ${question}\n  回答: ${answer}`);
  }
}

if (!sessions.size) {
  console.log(`${from === to ? from : `${from}〜${to}`} の質問ログはありません`);
  process.exit(0);
}

const log = [...sessions].map(([id, items]) => `### セッション ${id}\n${items.join('\n')}`).join('\n\n');
const prompt = `以下は、プログラミング学習中の受講生が Claude Code に質問した記録です（セッションごと）。
これを、本人があとで振り返るための「学びのまとめ」にしてください。

出力は Markdown だけ。前置き・後書きは書かない。形式:

## セッションごと
### <セッション ID>（<最初の日時>〜<最後の時刻>）
- やったこと: 作業の流れを1〜2行
- 学んだこと: 技術・概念の理解に当たる質問から、学びを箇条書き（なければ「なし」）

## テーマ別の学び
- 【テーマ】 学びの要点（複数セッションにまたがるものはまとめる）

## 次に深めるとよいこと
- 記録から読み取れる範囲で 1〜3 個

守ること:
- 質問や確認を返さず、必ず上の形式で出力する。最初の行は「## セッションごと」にする。
- セッション ID が「不明」のものは、ID を記録する前の古い記録。1つのセッションとして扱う。
- 回答が「（未記入 …）」のものは、質問の中身だけから判断する。
- 記録に書かれていないことは足さない。推測で埋めない。
- 回答欄の【区分】は機械的に付けたもので、間違っていることがある。質問の中身で判断する。
- パスワード・API キー・接続文字列・個人情報は書かない。

# 記録
${log}
`;

if (dryRun) {
  console.log(prompt);
  process.exit(0);
}

// Windows では claude は claude.cmd なので shell を使う。コマンドは固定の文字列で、記録は標準入力で渡す
const r = spawnSync('claude -p --model haiku --tools "" --no-session-persistence', {
  input: prompt,
  shell: true,
  encoding: 'utf8',
  env: { ...process.env, QA_LOG_DISABLE: '1' },
  maxBuffer: 10 * 1024 * 1024,
});
if (r.status !== 0 || !r.stdout.trim()) {
  console.error(`まとめを作れませんでした（終了コード ${r.status}）\n${r.stderr || ''}`);
  process.exit(1);
}
// 前置きの行は捨てる。形式どおりでない出力（質問を返してきた場合など）は保存しない
const start = r.stdout.indexOf('## セッションごと');
const body = start < 0 ? '' : r.stdout.slice(start).trim();
if (!body) {
  console.error(`まとめが形式どおりではないため、保存しませんでした。もう一度実行してください。\n---\n${r.stdout.trim().slice(0, 300)}`);
  process.exit(1);
}

const outDir = path.join(logDir, 'summary');
const out = path.join(outDir, `${from === to ? from : `${from}_${to}`}.md`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, `# 学びのまとめ ${from === to ? from : `${from}〜${to}`}\n\n${body}\n`, 'utf8');
console.log(`保存しました: ${path.relative(root, out)}（${sessions.size} セッション）`);
