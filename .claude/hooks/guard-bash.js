// PreToolUse(Bash): 取り消せない操作と、Git/GitHub の規約違反を実行前に止める。
// 規約の値は .claude/project.json の git / team / guards から読む。
const fs = require('fs');
const path = require('path');
const { readInput, projectDir, loadConfig, deny, ask, selfMember, isLightChange, run } = require('./lib');

const input = readInput();
const cmd = (input.tool_input && input.tool_input.command) || '';
if (!cmd) process.exit(0);

// 1) 取り消せない操作。どのリポジトリを操作する場合でも、project.json の有無に関係なく止める。
//    settings.json の deny は先頭一致なので、複合コマンドでもすり抜けないよう二重化する
const hard = [
  [/\bgit\s+push\b[^;&|\n]*\s(--force\b|--force-with-lease\b|-f\b)/, 'git push --force'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard'],
  [/\bgit\s+clean\b/, 'git clean'],
  [/(^|\s)--no-verify\b/, '--no-verify'],
  [/\brm\s+-[a-zA-Z]*(r[a-zA-Z]*f|f[a-zA-Z]*r)/, 'rm -rf'],
];
for (const [re, name] of hard) {
  if (re.test(cmd)) deny(`「${name}」は使わない規約です。別の方法をユーザーに提案してください。`);
}

// 別のリポジトリを操作するときは、そのリポジトリの状態（ブランチ等）と規約で判定する。
// 対象にするのは、コマンドの先頭が `cd <dir> &&`（または ;）のときと、区切り（&& ; |）を含まない
// 単独の `git -C <dir> ...` のときだけ。<dir> はリポジトリ内のサブディレクトリでもよい。
// ~ や $VAR を含むパスは解決しないので、元のプロジェクトで判定する。
// 対象のリポジトリに project.json がなければ、元のプロジェクトの規約を使う。
function targetDir(base) {
  const m = cmd.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))\s*(?:&&|;)/) ||
    (!/&&|;|\|/.test(cmd) && cmd.match(/^\s*git\s+-C\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/));
  if (!m) return base;
  let p = m[1] || m[2] || m[3];
  if (process.platform === 'win32') p = p.replace(/^\/([a-zA-Z])(\/|$)/, '$1:/');
  const top = run('git', ['rev-parse', '--show-toplevel'], path.resolve(base, p));
  return top ? path.resolve(top) : base;
}
const baseDir = projectDir(input);
let dir = targetDir(baseDir);
let cfg = loadConfig(dir);
if (!cfg || cfg._error) cfg = loadConfig(baseDir);
if (!cfg || cfg._error) process.exit(0);

const git = cfg.git || {};
const guards = cfg.guards || {};
const me = selfMember(cfg).github;

// 2) 保護ブランチへの直接コミット・push
const protectedBranches = git.protectedBranches || ['main', 'master'];
const current = run('git', ['branch', '--show-current'], dir);
const onProtected = current && protectedBranches.includes(current);

if (/\bgit\s+(?:-C\s+\S+\s+)?commit\b/.test(cmd) && onProtected) {
  deny(`保護ブランチ「${current}」に直接コミットできません。gh-flow スキルの手順で作業ブランチを切ってください。`);
}
const push = cmd.match(/\bgit\s+push\b([^;&|\n]*)/);
if (push) {
  const args = push[1].trim().split(/\s+/).filter((t) => t && !t.startsWith('-'));
  const targetsProtected = args.some((t) => protectedBranches.some((b) => t === b || t.endsWith(':' + b)));
  if (targetsProtected || (onProtected && args.length <= 1)) {
    deny(`保護ブランチ（${protectedBranches.join(', ')}）へ直接 push できません。作業ブランチを push して PR にしてください。`);
  }
}

// 3) ブランチ名の規約
const nb = cmd.match(/\bgit\s+(?:checkout\s+-b|switch\s+(?:-c|--create))\s+([^\s;&|]+)/);
if (nb && (git.branchPatterns || []).length) {
  const ok = git.branchPatterns.some((p) => {
    const re = p
      .replace(/[.+^$()|[\]\\]/g, '\\$&')
      .replace(/\{n\}/g, '\\d+')
      .replace(/\{[a-z]+\}/g, '[^\\s/]+');
    return new RegExp('^' + re + '$').test(nb[1]);
  });
  if (!ok) deny(`ブランチ名「${nb[1]}」が規約に合いません。使える形: ${git.branchPatterns.join(' / ')}`);
}

// 4) コミットメッセージの形式（-m またはヒアドキュメントで渡された1行目だけを見る）
function commitSubject(c) {
  const h = c.match(/<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1\b/);
  if (h) return (h[2].split('\n').find((l) => l.trim()) || '').trim();
  const m = c.match(/\s-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/);
  if (m) return ((m[1] !== undefined ? m[1] : m[2]).split('\n')[0] || '').trim();
  return null;
}
if (/\bgit\s+(?:-C\s+\S+\s+)?commit\b/.test(cmd) && (git.commitTypes || []).length) {
  const subject = commitSubject(cmd);
  if (subject !== null) {
    const types = git.commitTypes.join('|');
    const scopes = Object.keys(git.commitScopes || {});
    const scopePart = scopes.length ? `\\((?:${scopes.join('|')})\\)` : '(?:\\([^)]+\\))?';
    const issuePart = git.requireIssueNumberInCommit ? '.*\\(#\\d+\\)$' : '.+';
    if (!new RegExp(`^(?:${types})${scopePart}!?: ${issuePart}`).test(subject)) {
      deny(
        `コミットメッセージ「${subject}」が規約に合いません。形式: {type}({scope}): {概要} (#{Issue番号})\n` +
          `type: ${git.commitTypes.join(' / ')}` +
          (scopes.length ? `\nscope: ${scopes.join(' / ')}` : '')
      );
    }
  }
}

// 5) PR 作成前の別エージェントによるレビュー（pre-pr-review スキルが .claude/state/reviews/<HEAD>.md を残す）
const prCreate = /\bgh\s+pr\s+create\b/.test(cmd);
if (prCreate && (git.prePrReview || 'code') !== 'off') {
  const base = git.baseBranch || 'main';
  const files = (run('git', ['diff', '--name-only', `origin/${base}...HEAD`], dir) || '').split('\n').filter(Boolean);
  const skip = git.prePrReview !== 'all' && isLightChange(cfg, files);
  if (!skip) {
    const head = run('git', ['rev-parse', 'HEAD'], dir);
    const record = path.join(dir, '.claude', 'state', 'reviews', `${head}.md`);
    if (!head || !fs.existsSync(record)) {
      deny('PR を出す前に pre-pr-review スキルで別エージェントのレビューを受けてください（現在のコミットのレビュー記録がありません）。');
    }
    if (/判定:\s*要対応あり/.test(fs.readFileSync(record, 'utf8'))) {
      ask(`事前レビューで「要対応」が残っています（${path.relative(dir, record)}）。修正して再レビューするか、このまま PR を出すかをユーザーが判断してください。`);
    }
  }
}

// 6) 未承認の PR のマージ・自分の PR の承認。軽微な変更（git.lightChangePaths だけ）は通し、それ以外は確認を求める
function prInfo(args) {
  const num = (args.match(/(?:^|\s)#?(\d+)\b/) || [])[1];
  const out = run('gh', ['pr', 'view', ...(num ? [num] : []), '--json', 'number,reviewDecision,author,files'], dir);
  if (!out) return null;
  const pr = JSON.parse(out);
  pr.light = isLightChange(cfg, (pr.files || []).map((f) => f.path));
  return pr;
}
const merge = cmd.match(/\bgh\s+pr\s+merge\b([^;&|\n]*)/);
if (merge) {
  if (git.mergeMethod && !new RegExp(`--${git.mergeMethod}\\b`).test(merge[1])) {
    deny(`マージ方法は --${git.mergeMethod} を指定してください。`);
  }
  if (git.requireApprovalBeforeMerge !== false) {
    const pr = prInfo(merge[1]);
    if (!pr) ask('PR の承認状態を gh pr view で確認できませんでした。マージしてよいかユーザーが判断してください。');
    if (pr.reviewDecision !== 'APPROVED' && !pr.light) {
      ask(`PR #${pr.number} はコード等の変更を含み、Approve されていません（reviewDecision: ${pr.reviewDecision || 'なし'}）。マージしてよいかユーザーが判断してください。`);
    }
  }
}
const review = cmd.match(/\bgh\s+pr\s+review\b([^;&|\n]*)/);
if (review && /(^|\s)(--approve|-a)\b/.test(review[1]) && me) {
  const pr = prInfo(review[1]);
  if (pr && pr.author.login === me && !pr.light) {
    ask(`PR #${pr.number} は自分が作成した、コード等の変更を含む PR です。自分で Approve してよいかユーザーが判断してください。`);
  }
}

// 7) プロジェクト固有の条件付きコマンド（デプロイ等）。"{self}" は作業者本人の GitHub 名に置き換える
for (const rule of guards.commandRules || []) {
  if (!new RegExp(rule.match).test(cmd)) continue;
  if (rule.block) deny(rule.reason || `このコマンドは禁止されています: ${rule.match}`);
  if (rule.requireBranch && current !== rule.requireBranch) {
    deny(`${rule.reason || ''}\n実行できるのは ${rule.requireBranch} ブランチだけです（現在: ${current}）。`);
  }
  if (rule.requireLastCommitAuthorEmailIncludes) {
    const want = rule.requireLastCommitAuthorEmailIncludes.replace('{self}', me || '');
    if (!want) deny(`${rule.reason || ''}\n条件の作者（{self}）が project.json で未設定です。ユーザーに確認してください。`);
    const email = run('git', ['log', '-1', '--format=%ae'], dir) || '';
    if (!email.includes(want)) {
      deny(`${rule.reason || ''}\n最新コミットの作者メール: ${email || '取得できませんでした'}`);
    }
  }
}

process.exit(0);
