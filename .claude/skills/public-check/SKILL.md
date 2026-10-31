---
name: public-check
description: リポジトリを public にする前、または public で開発を始める前に使う。履歴の機密スキャンと GitHub 側の保護設定を読み取りだけで確認し、公開してよいかを判定する。設定は変更しない。
---

# public-check — 公開してよいかの確認

読み取りだけを行う。設定の変更、履歴の書き換え、環境変数ファイルの読み取りはしない。基準は `docs/public-repo-checklist.md`。

## 手順

1. `gh repo view --json nameWithOwner,visibility` で、対象と今の公開設定を確認する。
2. 履歴を調べる: `node scripts/scan-history.js`。見つかった内容は、値を繰り返さず、出力のまま（先頭 4 文字と長さ）報告する。
3. 設定を読む（読み取りのみ）。
   - `gh api repos/<owner>/<repo> --jq '{visibility, pull_request_creation_policy, has_issues, security_and_analysis}'`
   - `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` でデフォルトブランチの名前を取り、`gh api repos/<owner>/<repo>/branches/<デフォルトブランチ>/protection`（404 は「保護なし」）
   - private で Free プランのとき、`security_and_analysis` は null になる。「無効」とは限らないので、「確認できない」と書く。
   - `pull_request_creation_policy` は、項目の存在は確認済みで、既定値は `all`。collaborator に限定したときの値の名前は未確認なので、`all` 以外なら、値をそのまま報告して、画面で確認するよう伝える。Issue の作成制限は API で読めないので、「画面で確認が必要」と書く。
   - `scan-history.js` が shallow clone のエラー（終了コード 2）を返したら、「履歴の一部しかないため判定できない」と報告し、`git fetch --unshallow` を案内する。
4. チェックリストの表に当てはめて、合格・要対応・確認できないを一覧にする。
5. 判定を返す。「公開してよい」か「要対応あり」のどちらかにする。要対応には、直す手順（`adopt-template` の `references/github-settings.md` の該当項目）を添える。

## 報告

各項目に、実行したコマンドと出力の要点（値は伏せる）を添える。確認できなかった項目は「未確認」と書く。
