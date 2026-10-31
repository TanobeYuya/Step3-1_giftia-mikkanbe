# Issue の起票・アサイン・クローズ

## 起票

- タイトルの先頭に、担当領域の接頭辞（`git.issuePrefixes`、例: `[Front]`）を付ける。type（feat・fix 等）はまだ決まらないことが多いので付けない。
- 本文は次の3つの節を必ず書く。Issue フォームの必須チェックは Web UI でしか効かないので、gh で起票するときも同じ構成にする。

```bash
gh issue create --title "[Back] 週次目安の計算" --body "$(cat <<'EOF'
## 背景・目的

## 対応する文書 ID

## 完了条件（Done の定義）
EOF
)"
```

- 起票する前に、タイトルと本文の案をユーザーに見せる（GitHub に公開されるため）。

## アサイン

- 担当者は `team.members` の `role` と `scope` から選び、`github` の値でアサインする（`--assignee`）。
- 該当する枠の `github` が空なら、推測せず AskUserQuestion で質問する。答えをもらったら、project.json の枠を埋めるかどうかも聞く。
- `team.advisors` の人は、相談役なのでアサインしない。

## クローズ

- 完了確認の担当（`team.issueCloser` のロール）が確認してからクローズする。確認が済んでいない Issue は、PR に `Closes` を書かず、番号だけを記載する（[pr.md](pr.md)）。
