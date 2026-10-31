// フック共通処理。.claude/project.json が無いプロジェクトでは各フックは何もしない。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd();
}

function loadConfig(dir) {
  const p = path.join(dir, '.claude', 'project.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { _error: `.claude/project.json を読めません: ${e.message}` };
  }
}

// PreToolUse で実行を止める（理由は Claude に返る）
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

// 実行前にユーザーへ確認を求める（警告。ユーザーが許可すれば実行される）
function ask(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function selfMember(cfg) {
  return ((cfg.team || {}).members || []).find((m) => m.self) || {};
}

// すべてのパスが軽微な変更（git.lightChangePaths）に当たるか
function isLightChange(cfg, paths) {
  const globs = ((cfg.git || {}).lightChangePaths || []).map(globToRegExp);
  return paths.length > 0 && globs.length > 0 && paths.every((p) => globs.some((g) => g.test(p)));
}

// 失敗時は null を返す（フック自体は落とさない）
function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20000,
    }).trim();
  } catch {
    return null;
  }
}

// "app/frontend/**" や "**/tests/**" 形式の glob を正規表現にする
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

function relPath(dir, file) {
  if (!file) return '';
  const abs = path.isAbsolute(file) ? file : path.join(dir, file);
  return path.relative(dir, abs).split(path.sep).join('/');
}

module.exports = { readInput, projectDir, loadConfig, deny, ask, selfMember, isLightChange, run, globToRegExp, relPath };
