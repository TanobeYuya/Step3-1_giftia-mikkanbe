// PreToolUse(Bash): 取り消せない操作と、Git/GitHub の規約違反を実行前に止める。
// 規約の値は .claude/project.json の git / team / guards から読む。
const fs = require('fs');
const path = require('path');
const { readInput, projectDir, loadConfig, deny, ask, selfMember, isLightChange, consensusRules, run } = require('./lib');

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
  // core.quotePath=false: 日本語のファイル名を引用符つきのエスケープ表記にしない（lightChangePaths と照合できるようにする）
  // --no-renames: 移動したファイルを「削除＋追加」として出し、移動前の場所も判定に含める
  const files = (run('git', ['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', `origin/${base}...HEAD`], dir) || '').split('\n').filter(Boolean);
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
// gh pr merge / review の引数から、PR の指定（番号・URL・ブランチ名）と -R/--repo を取り出し、そのまま gh pr view に渡す
// （番号だけを拾うと、URL やブランチ名で指定したときに、別の PR（今のブランチの PR）を調べてしまうため）
const VALUE_FLAGS = new Set(['-t', '--subject', '-b', '--body', '-F', '--body-file', '-A', '--author-email', '--match-head-commit']);
function prSelector(args) {
  const toks = args.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const sel = [];
  const repo = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const unq = (s) => (s || '').replace(/^["']|["']$/g, '');
    if (t === '-R' || t === '--repo') { repo.push('-R', unq(toks[++i])); continue; }
    if (t.startsWith('--repo=')) { repo.push('-R', unq(t.slice(7))); continue; }
    if (/^-R./.test(t)) { repo.push('-R', unq(t.slice(2))); continue; } // -Rowner/repo（値をくっつけた形）
    if (VALUE_FLAGS.has(t)) { i++; continue; }
    if (t.startsWith('-')) continue;
    sel.push(t.replace(/^["']|["']$/g, '').replace(/^#/, ''));
  }
  return [...sel.slice(0, 1), ...repo];
}
function prInfo(args) {
  const out = run('gh', ['pr', 'view', ...prSelector(args), '--json',
    'number,url,headRefOid,changedFiles,reviewDecision,author,files,latestReviews'], dir);
  if (!out) return null;
  const pr = JSON.parse(out);
  pr.paths = (pr.files || []).map((f) => f.path);
  // gh pr view の files は途中で切れることがあり、移動前の名前も入らない。API から全ページと移動前の名前（previous_filename）を取る
  const m = (pr.url || '').match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  const api = m && run('gh', ['api', '--paginate', `repos/${m[1]}/pulls/${m[2]}/files`,
    '--jq', '.[] | .filename, (.previous_filename // empty)'], dir);
  pr.fullPaths = api ? api.split('\n').filter(Boolean) : null;
  // レビュー：gh pr view の latestReviews はコミットが空で返るため、REST API から commit_id 付きで取る（古い順）。
  // 人ごとに最後の判断（コメントだけのレビューは除く）を残す
  const rv = m && run('gh', ['api', '--paginate', `repos/${m[1]}/pulls/${m[2]}/reviews`,
    '--jq', '.[] | [.user.login, .state, .commit_id] | @tsv'], dir);
  pr.decisions = rv === null || rv === undefined || !m ? null : {};
  for (const line of (rv || '').split('\n').filter(Boolean)) {
    const [login, state, commit] = line.split('\t');
    if (state !== 'COMMENTED') pr.decisions[login] = { state, commit };
  }
  if (pr.fullPaths) pr.paths = [...new Set([...pr.paths, ...pr.fullPaths])];
  // 一覧が全部そろったと言えないときは、軽微な変更として扱わない
  const complete = !!pr.fullPaths || (pr.changedFiles || 0) <= (pr.files || []).length;
  pr.light = complete && isLightChange(cfg, pr.paths);
  return pr;
}
const merge = cmd.match(/\bgh\s+pr\s+merge\b([^;&|\n]*)/);
if (merge) {
  if (git.mergeMethod && !new RegExp(`--${git.mergeMethod}\\b`).test(merge[1])) {
    deny(`マージ方法は --${git.mergeMethod} を指定してください。`);
  }
  // 合意が必須のパス（git.consensusRules）を含む PR は、承認者の全員の Approve がそろうまでマージしない（作成者本人は除く）
  if ((git.consensusRules || []).length) {
    // 判定で調べる PR とマージの対象を必ず一致させるため、マージは「番号＋決まったオプション」だけの単独のコマンドに限る。
    // URL・ブランチ名・-R・環境変数（GH_REPO など）・ほかのコマンドとのつなぎは、シェルの解釈とずれる余地があるので止める
    // 区切りは空白とタブだけ（改行を区切りに使わせない）。# ; & | $ ` \ と改行を含むものも止める。
    // --auto は、判定のあとに別のコミットがマージされうるので認めない
    const simple = /[#;&|$`\\\n\r]/.test(cmd) ? null
      : cmd.trim().match(/^gh[ \t]+pr[ \t]+merge[ \t]+(\d+)((?:[ \t]+(?:--squash|--merge|--rebase|--delete-branch|-d|--admin))*)[ \t]*$/);
    if (!simple || /GH_[A-Z_]*/.test(cmd)) {
      deny('合意が必須の文書を含むかを正しく判定するため、マージは「gh pr merge <番号> --squash」の形で、ほかのコマンドとつなげずに実行してください' +
        '（使えるオプション：--squash・--merge・--rebase・--delete-branch・-d・--admin。URL・ブランチ名・-R・環境変数・--auto は使わない）。');
    }
    // コマンドを実行するフォルダのリポジトリが、判定で調べるリポジトリ（プロジェクト）と違えば止める
    if (input.cwd) {
      const top = (d) => (run('git', ['rev-parse', '--show-toplevel'], d) || '').replace(/\\/g, '/').toLowerCase();
      if (top(input.cwd) !== top(dir)) {
        deny('コマンドを実行するフォルダのリポジトリが、プロジェクトのリポジトリと違うため、合意が必須の文書の判定ができません。プロジェクトのフォルダでマージしてください。');
      }
    }
    const pr = prInfo(simple[1]);
    if (!pr) deny('PR の変更ファイルと承認者を gh pr view で確認できませんでした。合意が必須の文書を含むかもしれないため、マージを止めます。');
    if (!pr.fullPaths) {
      deny(`PR #${pr.number} の変更ファイルの全一覧（移動前の名前を含む）を GitHub の API で取れませんでした。合意が必須の文書を含むかもしれないため、マージを止めます。`);
    }
    for (const rule of consensusRules(cfg, pr.paths)) {
      if (!pr.decisions) {
        deny(`PR #${pr.number} のレビューを GitHub の API で取れませんでした。合意が必須の文書を含むため、マージを止めます。`);
      }
      // 今の最新コミットに対する Approve だけを数える（Approve のあとに書き換えたら、もう一度 Approve が要る）
      const approved = new Set(Object.entries(pr.decisions)
        .filter(([, d]) => d.state === 'APPROVED' && d.commit === pr.headRefOid)
        .map(([login]) => login));
      const missing = (rule.approvers || []).filter((a) => a !== pr.author.login && !approved.has(a));
      if (missing.length) {
        deny(`PR #${pr.number} は合意が必須の文書を含みます（${(rule.paths || []).join('、')}）。` +
          `${rule.reason ? rule.reason + '。' : ''}最新のコミットに Approve していない承認者: ${missing.join('、')}。全員の Approve がそろってからマージしてください。`);
      }
    }
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
