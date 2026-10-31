#!/bin/sh
# ひな形から始めたリポジトリで1回だけ実行する。
# 使い方（Mac・Windows の Git Bash 共通）: sh scripts/init.sh
#  - git フック（.githooks）を有効にする
#  - clone 直後なら、ひな形の取得元と版を project.json に記録し、remote の origin を template に改名する
#  - 埋める必要がある箇所を一覧にする
set -eu
cd "$(git rev-parse --show-toplevel)"

git config core.hooksPath .githooks
echo "git フック: core.hooksPath=$(git config core.hooksPath)"

if ! command -v node >/dev/null 2>&1; then
  echo "警告: node が見つかりません。Claude Code のフック（.claude/hooks/*.js）が動きません。"
  exit 0
fi
echo "node: $(node --version)（Claude Code のフックに必要）"

# clone 直後（origin がひな形を指している）なら取得元を記録する
src=$(node -p 'require("./.claude/project.json").template.source' 2>/dev/null || echo "")
if [ -z "$src" ] && origin=$(git remote get-url origin 2>/dev/null); then
  version=$(git rev-parse HEAD)
  node scripts/set-template-source.js "$origin" "$version"
  git remote rename origin template
  echo "ひな形の取得元を記録しました: $origin ($version)"
  echo "remote の origin を template に改名しました。自分のリポジトリは git remote add origin <URL> で追加してください。"
fi

node -e 'const c = require("./.claude/project.json"); console.log("導入済みの機能: " + (((c.template || {}).modules) || ["（記録なし。core として扱う）"]).join(", "))'

echo
echo "埋める必要がある箇所:"
grep -n '{{' CLAUDE.md || echo "  CLAUDE.md: なし"
node -e '
const c = require("./.claude/project.json");
const empty = [];
if (!c.project.name) empty.push("project.name");
if (!c.team.name) empty.push("team.name");
c.team.members.forEach((m, i) => { if (!m.github || !m.role) empty.push(`team.members[${i}]${m.self ? "（本人）" : ""}`); });
if (!c.team.issueCloser) empty.push("team.issueCloser");
if (!c.docs.canonical.length) empty.push("docs.canonical");
if (!Object.keys(c.test.commands).length) empty.push("test.commands");
console.log(empty.length ? "  .claude/project.json: " + empty.join(", ") : "  .claude/project.json: なし");
'
