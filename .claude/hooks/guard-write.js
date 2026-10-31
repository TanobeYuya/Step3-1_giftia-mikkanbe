// PreToolUse(Edit|Write|MultiEdit): .env の編集、秘密情報らしき文字列、
// パスごとの禁止語（例: フロントエンドに service_role）を書き込み前に止める。
const { readInput, projectDir, loadConfig, deny, globToRegExp, relPath } = require('./lib');

const input = readInput();
const ti = input.tool_input || {};
const dir = projectDir(input);
const cfg = loadConfig(dir);
if (!cfg || cfg._error) process.exit(0);

const guards = cfg.guards || {};
const rel = relPath(dir, ti.file_path || ti.notebook_path || '');
const text = [ti.content, ti.new_string, ...(ti.edits || []).map((e) => e.new_string)]
  .filter(Boolean)
  .join('\n');
// 値の見本を書けるファイル: 従来どおり .example で終わるもの。.sample・.template は、環境変数ファイルの見本（.env.sample など）だけ
const isExample = /\.example$/.test(rel) || /(^|\/)\.env(\.[^/]*)?\.(sample|template)$/.test(rel);

if (/(^|\/)\.env(\.[^/]*)?$/.test(rel) && !isExample) {
  deny('.env 系ファイルは読み書きしない規約です。変数名は .env.example（または .env.sample）を見てください。');
}

if (!isExample) {
  for (const p of guards.secretPatterns || []) {
    if (new RegExp(p.pattern, p.flags || '').test(text)) {
      deny(`秘密情報らしき文字列（${p.name}）が含まれています。値は環境変数に置き、コードや文書には書かないでください。`);
    }
  }
}

for (const rule of guards.forbiddenInPaths || []) {
  const hit = (rule.paths || []).some((g) => globToRegExp(g).test(rel));
  if (hit && new RegExp(rule.pattern).test(text)) {
    deny(rule.reason || `${rel} に「${rule.pattern}」は書けません。`);
  }
}

process.exit(0);
