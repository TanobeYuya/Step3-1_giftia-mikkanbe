---
name: gh-status
description: 未マージの PR と Open の Issue を一覧にしたいとき、または特定の PR・Issue の状態（承認・CI・担当）を確認したいときに使う。読み取りだけ。
context: fork
agent: gh-clerk
---

`gh` CLI で読み取りだけを行い、次の形で日本語で返してください。書き込みのコマンド（create・edit・merge・close・review・comment）は実行しないでください。

- `.claude/project.json` の `team.members` のうち `self: true` の人を「自分」とする
- 並び順: 自分宛て → 宛先なし → 他の人宛て
- 各行: `#番号 タイトル（リンク）` / 担当 / 状態（PR は reviewDecision と checks）/ 最終更新日

使うコマンドの例:

```bash
gh pr list --state open --json number,title,url,author,assignees,reviewDecision,updatedAt
gh issue list --state open --json number,title,url,assignees,updatedAt
```

対象の指定: $ARGUMENTS
