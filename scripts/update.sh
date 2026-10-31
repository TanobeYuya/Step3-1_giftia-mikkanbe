#!/bin/sh
# ひな形の最新版から、導入済みの機能の「共通部品」を取り込む。プロジェクト固有のファイルは上書きしない。
# 使い方（Mac・Windows の Git Bash 共通）: sh scripts/update.sh [取得元のパスまたは URL]
#   取得元を省略すると、project.json の template.source を使う。
#   導入済みの機能は project.json の template.modules（記録がなければ core だけ）。
#
# 上書きする  : 導入済みの機能の、projectFiles 以外のファイル（フック、スキル、エージェント、規約、git フック、scripts など）
# 上書きしない: projectFiles（CLAUDE.md、.claude/project.json、.claude/settings.json）。差分だけ表示する。
# .gitignore  : 機能が求める行のうち、無いものだけ追記する。
# 取り込んだあとは git diff で確認してからコミットする（元に戻すときは git restore）。
set -eu
dst=$(git rev-parse --show-toplevel)
cd "$dst"

src=${1:-$(node -p 'require("./.claude/project.json").template.source')}
[ -n "$src" ] || { echo "取得元が分かりません。sh scripts/update.sh <パスまたは URL> で指定してください"; exit 1; }
modules=$(node -p '((require("./.claude/project.json").template || {}).modules || ["core"]).join(",")')

if [ -d "$src" ]; then
  work=$src
else
  work=$(mktemp -d)
  git clone -q --depth 1 "$src" "$work"
  echo "取得元を一時ディレクトリに clone しました: $work"
fi
version=$(git -C "$work" rev-parse HEAD)
echo "取り込む版: $version（$src）"
echo "導入済みの機能: $modules"
[ -f "$work/scripts/modules.json" ] || { echo "この版のひな形には scripts/modules.json がありません。機能ごとの更新ができないため、中止しました。"; exit 1; }

for m in $(echo "$modules" | tr ',' ' '); do
  echo "== 機能: $m"
  node "$work/scripts/sync-module.js" update --src "$work" --dst "$dst" "$m"
done

# まだ入れていない機能を知らせる
node "$work/scripts/list-module-files.js" --root "$work" --json | node -e '
const have = process.argv[1].split(",");
let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const rest = JSON.parse(s).filter((m) => !have.includes(m.name));
  if (rest.length) {
    console.log("\nまだ入れていない機能:");
    rest.forEach((m) => console.log(`  ${m.name}: ${m.title}（${m.summary}）`));
    console.log("  入れるには adopt-template スキル、または sh <ひな形>/scripts/apply.sh --modules <機能,...> . を使う");
  }
});' "$modules"

node scripts/set-template-source.js "$src" "$version"
echo
echo "完了。git status と git diff で変更を確認してからコミットしてください。"
