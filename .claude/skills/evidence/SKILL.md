---
name: evidence
description: テスト・ビルド・lint を実行し、出力を証拠ファイルとして保存したいときに使う。実装の完了報告や PR 作成の前に使う。
context: fork
agent: evidence-runner
---

`.claude/project.json` の `test.commands` から、次で指定されたコマンドを実行してください（指定がなければ全部）: $ARGUMENTS

- 出力（stdout と stderr）は `docs.evidenceDir` に `{yymmdd-HHMM}_{コマンド名}.log` として保存する。1行目に実行したコマンドと日時を書く。
- コマンドが失敗しても、修正はしない。テストの期待値も変えない。
- 返す内容: コマンドごとの成否、件数（passed・failed など）、ログのパス、失敗したテストの名前と最初のエラー行。
- `test.commands` が空なら、「project.json に test.commands が登録されていません」とだけ返す。
