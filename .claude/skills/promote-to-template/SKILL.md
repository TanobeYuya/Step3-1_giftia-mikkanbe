---
name: promote-to-template
description: 記録された考え方（ひな形の Issue、ラベル template-idea）や派生プロジェクトでの変更を、汎化してひな形のリポジトリに PR で反映する。ユーザーが /promote-to-template で明示的に実行したときだけ使う。
disable-model-invocation: true
argument-hint: "[Issue 番号（template-idea）]"
---

# promote-to-template — ひな形への反映

ひな形の取得元は `.claude/project.json` の `template.source`。空なら、このリポジトリはひな形そのものなので、このスキルは使わず、gh-flow の手順で Issue に対応する。

対象: $ARGUMENTS

## 1. 対象を決める

- `OWNER/REPO` は `template.source` から決める（GitHub の URL ならそこから取り出し、ローカルのパスなら `git -C <パス> remote get-url origin` の URL から取り出す）。
- 引数に Issue 番号があれば、`gh issue view <番号> -R OWNER/REPO --comments` で記録（考え方・背景・反映先の候補・記録元）を読み、それを反映の対象にする。記録元のプロジェクトがこのリポジトリなら、変更したファイルも読む。
- 引数がなければ、反映する変更（ファイルと該当箇所）をユーザーと確認する。
- ひな形と同じ名前のファイル（`update.sh` の取り込み対象）は「既存部品の改善」、ひな形にないファイルは「追加」として扱う。

## 2. ひな形の作業用 clone を用意する

作業場所は `.claude/state/template-work/`（git 管理外）。`scripts/init.sh` はここでは実行しない（origin が改名されてしまう）。

```bash
# 初回
git clone "<template.source>" .claude/state/template-work
# 2回目以降
cd .claude/state/template-work && git switch main && git pull
```

ブランチを切る。名前は、ひな形の `.claude/project.json` の `git.branchPatterns` に合わせる（例: `chore/promote-<概要>`）。

```bash
cd .claude/state/template-work && git switch -c chore/promote-<概要>
```

## 3. 汎化して書き込む

プロジェクト固有の情報は、ひな形に持ち込まない。

| 固有の情報 | 置き換え先 |
| --- | --- |
| 人名、GitHub 名、役割 | `project.json` の `team` を参照する書き方にする |
| 固有のパス、サービス名、デプロイ先 | `project.json` の項目にする（新しい項目を足すなら `_comment` と README の表も更新する）か、`{{…}}` の置き換え欄にする |
| 閾値、業務ルール、正本文書の名前 | 一般化した表現にする。一般化できなければ反映しない |
| 社名、案件名、日付、PR・Issue の番号 | 削除する |

- CLAUDE.md への追記は、毎回読み込まれる量が増える。スキルや `paths` 付きの rules に置けないかを先に考える。ひな形の CLAUDE.md は 4KB 以内を目安にする。
- フックを変えたら、`scripts/test-hooks.js` にテストを足し、`cd .claude/state/template-work && node scripts/test-hooks.js` が全件 OK になることを確認する。
- README の構成表・項目表に、追加したものを反映する。

## 4. コミット・事前レビュー・PR

ひな形のリポジトリの規約で行う（フックは `cd .claude/state/template-work && …` で始まるコマンドを、ひな形の規約で判定する）。

1. コミットする（例: `feat(claude): <概要>`）。
2. `pre-pr-review` スキルを、引数に `.claude/state/template-work` を付けて実行する。「プロジェクト固有の情報が残っていないか」を観点に加えるよう指示する。
3. 要対応がなければ push して PR を出す。本文には、記録元（Issue 番号とプロジェクト名）、汎化で置き換えた内容、テストの結果、事前レビューの要約を書く。Issue から反映した場合は `Closes #番号` を書く。

```bash
cd .claude/state/template-work && git push -u origin chore/promote-<概要>
cd .claude/state/template-work && gh pr create --base main --title "feat(claude): <概要>" --body "..."
```

4. PR の URL をユーザーに返す。マージはユーザーが判断する。マージ後に他のプロジェクトへ入れるときは、各プロジェクトで `sh scripts/update.sh` を実行する。
