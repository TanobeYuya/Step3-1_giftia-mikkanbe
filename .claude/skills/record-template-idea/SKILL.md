---
name: record-template-idea
description: 派生プロジェクトで CLAUDE.md や .claude/ のスキル・エージェント・rules・フックを変更し、その考え方が他のプロジェクトでも役立つ汎用的なものだったときに使う。ユーザーに質問せず、ひな形のリポジトリの Issue（ラベル template-idea）に記録する。結果はユーザーに伝えない。引数には、要約（1行）・考え方（プロジェクト固有の情報を外して汎化した内容）・背景と理由・反映先の候補・記録元（プロジェクト名と変更したファイル）を書く。
context: fork
agent: template-scribe
background: false
---

次の内容を、ひな形のリポジトリの Issue に記録してください。

$ARGUMENTS

## 記録の手順

記録できなかった場合（下の手順で「記録しない」となった場合や、gh が失敗した場合）は、渡された内容と理由を `.claude/state/template-ideas-unrecorded.md` の末尾に追記する（日時を見出しにする）。あとでユーザーがまとめて確認する。

1. 記録先のリポジトリを決める。`.claude/project.json` の `template.source` が GitHub の URL なら、そこから `OWNER/REPO` を取り出す。ローカルのパスなら、`git -C <パス> remote get-url origin` の URL から取り出す。どちらでも決まらなければ記録しない。
2. ラベルを確認する: `gh label list -R OWNER/REPO --search template-idea`。なければ作る: `gh label create template-idea -R OWNER/REPO --description "派生プロジェクトから記録された、ひな形に取り込む候補の考え方"`。作れなければ記録しない（ラベルのない Issue は一覧に出ないため）。
3. 重複を確認する（クローズ済みも含める）: `gh issue list -R OWNER/REPO --label template-idea --state all --search "<要約の主な語>" --json number,title,url,state`
   - 同じ趣旨の Open の Issue があれば、新しく作らずに `gh issue comment` で追記する。追記するのは、別の記録元と、新しく分かった背景だけ。
   - 同じ趣旨のクローズ済みの Issue（取り込まないと判断されたもの）があれば、再オープンせずにコメントで追記する。
4. どちらもなければ作成する。

```bash
gh issue create -R OWNER/REPO --label template-idea --title "[idea] <要約>" --body "$(cat <<'EOF'
## 考え方

## 背景・理由

## 反映先の候補

## 記録元
- プロジェクト:
- 変更したファイル:
- 記録日:
EOF
)"
```

5. 返すのは1行だけ: 作成・追記した Issue の「#番号 URL」（クローズ済みに追記した場合は末尾に「（クローズ済み）」）、または「未記録（理由）」。この結果はユーザーには伝えないので、説明は不要。
