// UserPromptSubmit: ユーザーの質問を .claude/state/qa-log/YYYY-MM-DD.md に追記する（回答欄は「未記入」）。
// Stop: 回答欄が未記入なら、質問と回答から区分・テーマ・要点を機械的に作り、フック自身が回答欄を書き換える。
//       LLM もサブエージェントも使わない。メインの Claude には何も指示しないので、完了通知も届かない。
// 見出しにセッション ID を書くので、あとで scripts/qa-summarize.js がセッションごとにまとめられる。
// ログは .claude/state/ の下にあり、gitignore で GitHub に載らない。ux.qaLog が false なら何もしない。
// QA_LOG_DISABLE が設定されていても何もしない（qa-summarize.js が起動する claude で二重に記録しないため）。
const fs = require('fs');
const path = require('path');
const { readInput, projectDir, loadConfig } = require('./lib');

const input = readInput();
const dir = projectDir(input);
const cfg = loadConfig(dir);
if (!cfg || cfg._error) process.exit(0);
if (((cfg.ux || {}).qaLog) === false) process.exit(0);
if (input.agent_id) process.exit(0);
if (process.env.QA_LOG_DISABLE) process.exit(0);

const logDir = path.join(dir, '.claude', 'state', 'qa-log');
const session = String(input.session_id || 'unknown').replace(/[^\w-]/g, '');
const pendingFile = path.join(logDir, 'pending', `${session}.json`);
const MAX_QUESTION = 200;
const MAX_GIST = 100;

// 区分は質問文のキーワードで決める。学習語を先に見る（「バグ修正の違いは？」は学習）。迷ったら【その他】
const LEARN = /なぜ|違い|とは|解説|説明|理解|仕組み|意味|メリット|デメリット|読み方|考え方/;
const WORK = /進めて|実装|作って|作成|修正|直して|追加|設定|変更|試作|反映|起票|コミット|マージ|書き換|更新|削除|移動|インストール|実行して/;
// テーマは最初に当たったものを1つだけ付ける
const THEMES = [
  [/FastAPI/i, 'FastAPI'],
  [/Next\.?js|React|フロント/i, 'Next.js'],
  [/SSL|TLS/i, 'SSL'],
  [/SQL|テーブル|データベース/i, 'SQL'],
  [/\bgit\b|GitHub|hotfix|ブランチ|\bPR\b/i, 'git'],
  [/フック|hook|settings|CLAUDE\.md|スキル|エージェント/i, 'Claude設定'],
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function readPending() {
  try {
    return JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
  } catch {
    return null;
  }
}

// 秘密情報らしき文字列を伏せる
function maskSecrets(text) {
  let out = text;
  for (const p of (cfg.guards || {}).secretPatterns || []) {
    const flags = (p.flags || '').includes('g') ? p.flags : `${p.flags || ''}g`;
    out = out.replace(new RegExp(p.pattern, flags), '（省略）');
  }
  return out;
}

// 直前の回答の本文。入力に last_assistant_message があればそれを、なければ transcript の最後の assistant 発言を使う
function lastAnswer() {
  if (typeof input.last_assistant_message === 'string' && input.last_assistant_message.trim()) return input.last_assistant_message;
  try {
    const lines = fs.readFileSync(input.transcript_path, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const o = JSON.parse(lines[i]);
      if (o.type !== 'assistant' || o.isSidechain) continue;
      const content = (o.message || {}).content;
      const text = Array.isArray(content) ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : String(content || '');
      if (text.trim()) return text;
    }
  } catch {}
  return '';
}

function classify(question) {
  if (LEARN.test(question)) return '【学習】';
  if (WORK.test(question)) return '【作業】';
  return '【その他】';
}

function theme(question) {
  const hit = THEMES.find(([re]) => re.test(question));
  return hit ? `【${hit[1]}】` : '';
}

// 回答から、結論（最初の文）と、次にやること（「次に」「お知らせ」などを含む最後の行の文）を取り出して100字以内にする
function summarize(answer) {
  const lines = answer
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(#|\||>|---|<|Written for:)/.test(l))
    .map((l) =>
      l
        .replace(/^([-*]|\d+\.)\s+/, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*`]/g, ''),
    );
  const sentence = (l) => (l.match(/^.*?[。！？]/) || [l])[0];
  const first = lines.length ? sentence(lines[0]) : '';
  const next = [...lines].reverse().find((l) => /次に|お知らせ|ください|しますか/.test(l));
  const tail = next && next !== lines[0] ? sentence(next) : '';
  const gist = [first, tail].filter(Boolean).join(' ');
  return gist.length > MAX_GIST ? `${gist.slice(0, MAX_GIST - 1)}…` : gist;
}

// ログの「回答: （未記入 #ID）」の行を書き換える。未記入の行がなければ false
function fillAnswer(pending, line) {
  const text = fs.readFileSync(pending.file, 'utf8');
  const marker = `回答: （未記入 #${pending.id}）`;
  if (!text.includes(marker)) return false;
  fs.writeFileSync(pending.file, text.replace(marker, () => line), 'utf8');
  return true;
}

if (input.hook_event_name === 'UserPromptSubmit') {
  // IDE が自動で挟むタグ（開いているファイル・選択範囲など）は質問ではないので取り除く
  const raw = String(input.prompt || '')
    .replace(/<(ide_[a-z_]+|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/g, '')
    .trim();
  // スラッシュコマンド、空の発言、サブエージェントやタスクの通知（<agent-message …> など）は質問ではないので残さない
  if (!raw || raw.startsWith('/') || /^<(agent-message|task-notification|system-reminder)\b/.test(raw)) process.exit(0);

  // 秘密情報らしき文字列を含む質問は、中身を残さない
  const leaked = ((cfg.guards || {}).secretPatterns || []).some((p) => new RegExp(p.pattern, p.flags || '').test(raw));
  let question = raw.replace(/\s+/g, ' ');
  if (leaked) question = '（秘密情報らしき文字列を含むため省略）';
  else if (question.length > MAX_QUESTION) question = `${question.slice(0, MAX_QUESTION)}…`;

  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const id = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${session.slice(0, 4)}`;
  const file = path.join(logDir, `${date}.md`);

  try {
    fs.mkdirSync(path.join(logDir, 'pending'), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, `# 質問ログ ${date}\n`, 'utf8');
    fs.appendFileSync(file, `\n## ${time} 〔s:${session.slice(0, 8)}〕\n\n質問: ${question}\n回答: （未記入 #${id}）\n`, 'utf8');
    fs.writeFileSync(pendingFile, JSON.stringify({ file, id, question }), 'utf8');
  } catch {}
  process.exit(0);
}

if (input.hook_event_name === 'Stop') {
  const pending = readPending();
  // 質問がない、記入済み（二重に書かない）のときは何もしない
  if (!pending || pending.requested) process.exit(0);

  const question = String(pending.question || '');
  const gist = maskSecrets(summarize(lastAnswer())) || '（要点を取れませんでした）';
  try {
    if (!fillAnswer(pending, `回答: ${classify(question)}${theme(question)} ${gist}`)) process.exit(0);
    fs.writeFileSync(pendingFile, JSON.stringify({ ...pending, requested: true }), 'utf8');
  } catch {}
}
