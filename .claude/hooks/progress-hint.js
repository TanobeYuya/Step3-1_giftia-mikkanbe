// UserPromptSubmit: ツール呼び出しの回数をリセットする。
// PostToolUse（全ツール）: 回数を数え、ux.progressEvery 回ごとに「日本語で進捗を伝える」よう Claude に指示する。
// サブエージェントの中のツール呼び出しは数えない（入力に agent_id がある場合）。
const fs = require('fs');
const path = require('path');
const { readInput, projectDir, loadConfig } = require('./lib');

const input = readInput();
const dir = projectDir(input);
const cfg = loadConfig(dir);
if (!cfg || cfg._error) process.exit(0);

const every = Number(((cfg.ux || {}).progressEvery) ?? 5);
if (!every || every < 1) process.exit(0);
if (input.agent_id) process.exit(0);

const stateDir = path.join(dir, '.claude', 'state', 'progress');
const stateFile = path.join(stateDir, `${String(input.session_id || 'unknown').replace(/[^\w-]/g, '')}.json`);

function save(count) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ count }));
  } catch {}
}

if (input.hook_event_name === 'UserPromptSubmit') {
  save(0);
  process.exit(0);
}

let count = 0;
try {
  const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (Number.isInteger(parsed.count)) count = parsed.count;
} catch {}
count += 1;
save(count);
if (count % every !== 0) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext:
      `[進捗の報告] この依頼でツールを ${count} 回使った。次のツールを呼ぶ前に、ユーザーに日本語で進捗を1〜3行で伝える。` +
      '書くこと: ここまでにやったこと、わかったこと、次にやること。考えている意図も日本語で書き、英語の思考をそのまま見せない。' +
      '前回の報告から大きな進展がなければ「〜を確認中」と1行でよい。最終回答の繰り返しにはしない。',
  },
}));
