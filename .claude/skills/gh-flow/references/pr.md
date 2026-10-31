# 事前レビュー・push・PR 作成

## 1. 事前レビュー（別エージェント）

PR を出す前に、実装した本人とは別のエージェントのレビューを受ける。レビューアーの PM などによる差し戻しを減らすためのもの。

1. 変更をすべてコミットしてから、`pre-pr-review` スキルを実行する。会話の履歴を持たない spec-reviewer エージェントが差分をレビューし、`.claude/state/reviews/<HEAD>.md` に記録を残す。
2. 「要対応あり」なら、指摘を直してコミットし、もう一度 `pre-pr-review` を実行する。コミットが変わると記録も取り直しになる。
3. 指摘に同意できない場合は、直さずに指摘と自分の見解をユーザーに見せ、判断を仰ぐ。

`git.lightChangePaths` だけを変える軽微な PR は省略してよい（`git.prePrReview` が `all` なら省略しない）。フック `guard-bash` は、レビュー記録がないと `gh pr create` を止め、「要対応あり」が残っていればユーザーに確認を求める。

## 2. push

push の前に `git fetch` し、`origin/{baseBranch}` より遅れていれば pull（または rebase）する。そのあと作業ブランチを push する: `git push -u origin <ブランチ名>`。rebase でコミットが変わったら、事前レビューを取り直す。

## 3. PR 作成

base は `git.baseBranch`、タイトルはコミットメッセージと同じ形式（`{type}({scope}): {概要} (#{Issue番号})`）にする。

本文に必ず書くもの:

- 対応する文書の ID（`docs.canonical` の文書にある要件・仕様・テスト設計などの ID）
- 証拠（テスト出力、ログやスクリーンショットのパス。`/evidence` の結果を使う）
- 事前レビューの要約（pre-pr-review が返した要約と、残した「推奨」への対応）
- 解決する Issue ごとに `Closes #番号`。完了確認の担当（`team.issueCloser`）の確認が済んでいない Issue は、`Closes` を書かずに番号だけを記載する
- 末尾に、会話で指定された生成元の表記（attribution）

```bash
gh pr create --base main --title "feat(backend): 週次目安の計算を追加 (#12)" --body "$(cat <<'EOF'
## 対応する ID
- F-03 / SP-05 / U-07

## 変更内容

## 証拠
- evidence/261019-1030_backend-test.log（pytest 12 passed）

## 事前レビュー（spec-reviewer）
- 判定: 要対応なし。推奨1件（変数名の表記ゆれ）は修正済み

Closes #12
EOF
)"
```

PR を作ったら、URL を報告する。
