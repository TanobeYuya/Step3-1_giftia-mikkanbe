---
name: gh-flow
description: Git/GitHub の操作（作業開始時のブランチ作成、コミット、push、Issue 起票・アサイン・クローズ、PR 作成、レビュー、マージ、マージ後の片付け）をするときに必ず使う。規約の値は .claude/project.json の git と team から読む。
---

# gh-flow — GitHub Flow の手順

最初に `.claude/project.json` の `git` と `team` を読む。空欄の値は推測で埋めない。担当者の指定が必要なのに該当の枠が空なら、AskUserQuestion で質問する。

## 前提

- GitHub Flow。恒久ブランチは `git.baseBranch` だけ。`develop` 等は作らない。
- GitHub の操作は `gh` CLI で行う。
- フック `guard-bash` が次を止める: 保護ブランチへのコミット・push、規約外のブランチ名・コミットメッセージ、事前レビューなしの PR 作成、`commandRules` に合わないデプロイ。未承認のマージと自分の PR の Approve は、軽微な変更（`git.lightChangePaths` だけ）なら通し、それ以外はユーザーに確認を求める。止められたら回避せず、理由をユーザーに伝える。
- 作業者本人の役割（`team.members` の `self` の `role`）は、プロジェクトごとに変わる。役割によって判断が変わる場面で空なら、質問する。
- レビューは PR 上のコメントと Approve で完結させる。レビュー専用の Issue は立てない。

## 場面別の手順（該当するファイルだけ読む）

| 場面 | 読むファイル |
| --- | --- |
| 作業開始、ブランチ作成、コミット | [references/branch-commit.md](references/branch-commit.md) |
| Issue の起票・アサイン・クローズ | [references/issue.md](references/issue.md) |
| 事前レビュー、push、PR 作成 | [references/pr.md](references/pr.md) |
| レビュー、マージ、マージ後の片付け、デプロイ | [references/merge.md](references/merge.md) |

一覧や状態の確認だけなら `/gh-status`（haiku で実行）を使い、このスキルの手順は不要。

## 報告

Issue・PR・コミットに触れるときは、番号だけでなくタイトルとリンクを添える。Issue・PR の本文とコミットメッセージの日本語は `.claude/rules/japanese-writing.md` に従う（本文はファイルを触らないので自動では読み込まれない。書く前に読む）。実行した gh・git コマンドの出力（URL・番号・状態）を証拠として示す。
