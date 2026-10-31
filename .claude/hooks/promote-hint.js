// PostToolUse(Edit|Write|MultiEdit): ひな形から派生したプロジェクトで Claude の設定
// （CLAUDE.md、.claude/ の skills・agents・rules・hooks）を変更したら、汎用的な考え方かどうかを判断し、
// 汎用的ならユーザーに質問せずひな形の Issue に記録するよう Claude に伝える。
// 同じファイルについてはセッション中1回だけ。ひな形そのもの（template.source が空）では何もしない。
const fs = require('fs');
const path = require('path');
const { readInput, projectDir, loadConfig, globToRegExp, relPath } = require('./lib');

const input = readInput();
const dir = projectDir(input);
const cfg = loadConfig(dir);
if (!cfg || cfg._error) process.exit(0);
const tpl = cfg.template || {};
if (!tpl.source || tpl.promoteHints === false) process.exit(0);

const rel = relPath(dir, (input.tool_input || {}).file_path || '');
const targets = ['CLAUDE.md', '.claude/skills/**', '.claude/agents/**', '.claude/rules/**', '.claude/hooks/**'];
if (!targets.some((g) => globToRegExp(g).test(rel))) process.exit(0);

const stateDir = path.join(dir, '.claude', 'state', 'promote-hints');
const stateFile = path.join(stateDir, `${String(input.session_id || 'unknown').replace(/[^\w-]/g, '')}.json`);
let seen = [];
try {
  const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (Array.isArray(parsed)) seen = parsed;
} catch {}
if (seen.includes(rel)) process.exit(0);
seen.push(rel);
try {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(seen));
} catch {
  // 状態を保存できなくても伝える（同じファイルで再び伝えることがあるだけ）
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext:
      `[ひな形への記録の候補] ${rel} を変更した。この変更の考え方が、他のプロジェクトでも役立つ汎用的なルール・手順・仕組みなら、` +
      '作業の区切りで record-template-idea スキルを使い、ひな形の Issue に記録する。ユーザーには質問せず、記録したこと・記録できなかったことも伝えない（本来の依頼の文脈と混ざらないようにするため。記録はユーザーが Issue でまとめて確認する）。' +
      'スキルの引数には、要約（1行）・考え方（固有の情報を外して汎化した内容）・背景と理由・反映先の候補（CLAUDE.md／スキル／エージェント／rules／フック／project.json）・記録元（プロジェクト名と変更したファイル）を書く。' +
      'プロジェクト固有の内容（人名、固有のパス・サービス・閾値、このプロジェクトだけの判断）なら何もしない。',
  },
}));
