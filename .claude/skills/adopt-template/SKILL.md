---
name: adopt-template
description: 「ひな形の機能を反映して」「テンプレートを導入して」「ひな形に機能を追加して」と頼まれたときに使う。ひな形（claude-project-template）から、公開設定に合った機能を選んで、このリポジトリへ入れる。必要事項（チーム名・メンバーなど）は 1 つずつ質問して埋める。
---

# adopt-template — ひな形の機能を、このリポジトリへ反映する

ひな形の取得元は、依頼文に書かれた URL、または `.claude/project.json` の `template.source` から取る。どちらも無ければ質問する。

質問のしかた: 選択肢のある質問（公開設定、機能の選択、実行の承認）は AskUserQuestion で 1 問ずつ聞く。自由入力（名前、ID）は、チャットで 1 つだけ質問して返信を待つ。答えは、聞いた直後に書き込んで、書いた値を見せる。

## 手順

1. **現状を確認する（読み取りのみ）**
   - `git remote -v`、`gh repo view --json nameWithOwner,visibility`（リポジトリが GitHub にまだ無ければ、その旨を伝えて公開設定を質問する）。
   - `.claude/project.json` の有無と `template.modules`（導入済みの機能）。
2. **ひな形を一時フォルダに浅く clone する**: `mktemp -d` でフォルダを作り、`git clone --depth 1 <取得元> <作業フォルダ>` で取得する。プロジェクトの外に置く。`mktemp -d` が出したパスを控えて、以降のコマンドには、そのパス（以下の `<作業フォルダ>`）をそのまま書く。シェルの変数は、コマンドごとに消えるので使えない。clone 先のスクリプトは、この手順に書いたものだけ実行する。
3. **機能を選ぶ**
   - 機能の一覧: `node <作業フォルダ>/scripts/list-module-files.js --root <作業フォルダ> --json`。
   - 公開設定を聞く（public / private / あとで public）。public と「あとで public」には、`recommend` が `public` の機能（secrets など）を含めて提案する。`core` は必須。
   - 選んだ機能と理由を見せて、確認を取る。
4. **反映する**: `sh <作業フォルダ>/scripts/apply.sh --modules <機能,...> .`。すでに導入済みの機能は、省略しても記録から消えない（足されるだけ）。出力（copy・skip の一覧）をそのまま見せる。skip したファイルは、ひな形との差分を見せて、取り込むかを聞く。勝手に上書きしない。
5. **必要事項を聞く**: [references/interview.md](references/interview.md) の順に、1 つずつ。書き込みは `node scripts/project-config.js` と、CLAUDE.md の編集で行う。選んだ機能に専用の質問（`references/<機能>.md`。例: `dashboard` の [references/dashboard.md](references/dashboard.md)）があれば、そのあとに続けて行う。
6. **GitHub 側の設定をする**: [references/github-settings.md](references/github-settings.md)。1 項目ずつ、コマンドを見せて承認を得てから実行し、実行後に読み取りで確認する。公開設定に合わない項目（private の保護など）は、飛ばした理由を伝える。
7. **検証する**: `node scripts/test-hooks.js`、`sh scripts/init.sh`（未記入の一覧）。secrets を入れたなら、`node scripts/scan-history.js`。
8. **報告する**: 入れた機能、聞いて埋めた内容、実行したコマンドの出力（証拠）、未確認のこと、まだ埋まっていない箇所（CLAUDE.md の `{{…}}` など）。

## してはいけないこと

- `.env` 系のファイルを読み書きしない。
- 承認なしに、GitHub 側の設定を変更しない。
- 本名を聞かない。メンバーの名前は、公開ページに出てよいニックネームだけを使う。
- ひな形のファイルを、確認なしに上書きしない。
- 実行していないこと、確認できていないことを、完了として書かない。
