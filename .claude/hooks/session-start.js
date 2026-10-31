// SessionStart: 現在のブランチ・遅れ・未設定の担当枠を数行で知らせる（標準出力はコンテキストに入る）。
// ネットワークは使わない（fetch しない）ので、遅れは最後に fetch した時点の値。
const { readInput, projectDir, loadConfig, run } = require('./lib');

const input = readInput();
const dir = projectDir(input);
const cfg = loadConfig(dir);
if (!cfg) process.exit(0);
if (cfg._error) {
  console.log(`[project] ${cfg._error}。フックの規約チェックが無効になっています。`);
  process.exit(0);
}

const git = cfg.git || {};
const base = git.baseBranch || 'main';
const protectedBranches = git.protectedBranches || ['main', 'master'];
const lines = [];

const branch = run('git', ['branch', '--show-current'], dir);
if (branch) {
  let s = `ブランチ: ${branch}`;
  if (protectedBranches.includes(branch)) s += '（保護ブランチ。変更前に作業ブランチを切る）';
  const behind = run('git', ['rev-list', '--count', `${branch}..origin/${base}`], dir);
  if (behind && behind !== '0') s += ` / origin/${base} より ${behind} コミット遅れ（最後の fetch 時点）`;
  lines.push(s);
}

const members = (cfg.team || {}).members || [];
const self = members.find((m) => m.self);
if (self && !self.role) lines.push('作業者本人の役割が未設定（役割で判断が変わる場面では質問する）');
const empty = members.filter((m) => !m.self && (!m.github || !m.role)).length;
if (empty) lines.push(`未設定のチーム枠: ${empty} 件（担当の指定が必要になったら推測せず質問する）`);

lines.push('Git/GitHub 操作の前に gh-flow、実装の前に spec-gate を読む。状況の整理は /kickoff。');
console.log(`[${(cfg.project || {}).name || 'project'}] ` + lines.join('\n'));
