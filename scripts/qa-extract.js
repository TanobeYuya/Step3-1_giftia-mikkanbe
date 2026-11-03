// 質問ログ（.claude/state/qa-log/）から、区分で絞って質問と回答を抜き出す。
// 使い方: node scripts/qa-extract.js [区分] [テーマ]
//   区分: 学習（省略時）・作業・その他。テーマ: 回答行の 【SSL】 のようなタグ（省略可）。
// 例:     node scripts/qa-extract.js 学習 SSL
const fs = require('fs');
const path = require('path');

const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..');
const logDir = path.join(root, '.claude', 'state', 'qa-log');
const category = process.argv[2] || '学習';
const theme = process.argv[3];

if (!fs.existsSync(logDir)) {
  console.log(`質問ログがありません: ${logDir}`);
  process.exit(0);
}

const hits = [];
for (const file of fs.readdirSync(logDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort()) {
  const date = file.replace('.md', '');
  const entries = fs.readFileSync(path.join(logDir, file), 'utf8').split(/^## /m).slice(1);
  for (const entry of entries) {
    const [time, ...rest] = entry.trim().split('\n');
    const body = rest.filter((l) => l.trim());
    const answer = body.find((l) => l.startsWith('回答:')) || '';
    if (!answer.includes(`【${category}】`)) continue;
    if (theme && !answer.includes(`【${theme}】`)) continue;
    hits.push(`### ${date} ${time}\n${body.join('\n')}`);
  }
}

console.log(hits.length ? hits.join('\n\n') : `【${category}】${theme ? `【${theme}】` : ''} の記録はありません`);
