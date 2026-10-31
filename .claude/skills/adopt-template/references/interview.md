# 必要事項の質問（core）

1 つずつ聞いて、答えの直後に書き込む。書いた値を、そのまま見せる。聞く順番は次のとおり。

| 順 | 質問 | 書き込み | 確認 |
| --- | --- | --- | --- |
| 1 | プロジェクト名 | `node scripts/project-config.js set project.name "<名前>"`。あわせて CLAUDE.md 先頭の `{{プロジェクト名}}` を、Edit で置き換える | — |
| 2 | プロジェクトの目的（1〜2 行） | `node scripts/project-config.js set project.purpose "<目的>"`。CLAUDE.md の目的の `{{…}}` も置き換える | — |
| 3 | チーム名 | `node scripts/project-config.js set team.name "<チーム名>"` | — |
| 4 | メンバー（作業者本人から。1 人ずつ） | 下のとおり | 下のとおり |
| 5 | 完了確認の担当（任意） | `node scripts/project-config.js set team.issueCloser "<役割名>"` | — |

## メンバー（質問 4）

0. はじめに、`node scripts/project-config.js get team.members` で、すでに入っている人を見せる。clone で始めた場合は、ひな形の作者が `self` として残っていることがある。作業者本人と違うなら、「今のメンバーを空にして聞き直す」ことを提案し、承認を得てから `node scripts/project-config.js clear-members` を実行する。`apply.sh` で初めて導入したときは、枠はもう空になっている。
1. 本人から始める。`gh api user --jq .login`（読み取り）で GitHub ID の候補を出し、「あなたはこの ID ですか」と確認する。
2. 1 人ごとに、次の順で聞く。
   - **GitHub ID**: 聞いたら `gh api users/<ID> --jq .login`（読み取り）で実在を確認する。見つからなければ聞き直す。
   - **ニックネーム**: 「本名ではなく、公開ページに出てよい呼び名」と伝えて聞く。
   - **役割**（例: PM、Backend、Frontend）と、**担当範囲**（任意）。
3. 書き込み: `node scripts/project-config.js add-member --name "<ニックネーム>" --github <ID> --role "<役割>" --scope "<担当範囲>"`。本人には `--self` を付ける。形式が合わないとエラーになるので、メッセージを読んで聞き直す。
4. 「次のメンバーはいますか」と聞いて、いなくなるまで繰り返す。
5. 終わったら、`node scripts/project-config.js get team.members` で登録内容を見せる。

## あとで埋める箇所

CLAUDE.md の `{{…}}`（正本の優先順位、構成、プロジェクト固有の禁止事項など）と、project.json の `docs.canonical`・`test.commands` は、導入の時点では聞かない。`sh scripts/init.sh` が出す未記入の一覧を、そのまま報告する。
