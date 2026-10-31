# 公開リポジトリのチェックリスト

private のリポジトリを public にする前と、public で開発を始める前に使う。確認は `public-check` スキルが読み取りだけで行う。設定の変更は、1 項目ずつ承認を得てから実行する。

## 公開すると起きること

- 過去のコミット、全ブランチ、Issue、PR、コメントが、誰にでも見える。
- 一度見られた値は、あとで消しても戻らない。機密が見つかったら、履歴の書き換えではなく、キー・パスワードの再発行で対処する。
- public から private に戻しても、すでに取得された複製と、外部の Fork は残る。
- Free プランでは、private にすると GitHub Pages が非公開になり、secret scanning と push protection も使えなくなる。

## 公開前に確認すること

| 項目 | 確認の方法 | 合格の条件 |
| --- | --- | --- |
| 履歴に機密がない | `node scripts/scan-history.js` | 「見つかりませんでした」 |
| 環境変数ファイルがコミットされていない | 同上（履歴も調べる） | 見つからない |
| secret scanning が有効 | `gh api repos/<owner>/<repo> --jq .security_and_analysis` | `secret_scanning` が `enabled` |
| push protection が有効 | 同上 | `secret_scanning_push_protection` が `enabled` |
| デフォルトブランチ（通常は `main`）が保護されている | `gh api repos/<owner>/<repo>/branches/<デフォルトブランチ>/protection`（名前は `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` で取る） | 取得できる（PR 必須） |
| 外部の人が PR・Issue を作れない | `gh api repos/<owner>/<repo> --jq .pull_request_creation_policy` | collaborator に限定されている（未確認: 項目は実在し、既定値は `all`。限定したときの値の名前は確認できていない。Issue の制限は API で読めないので、画面で確認する） |
| 公開してよい内容だけを載せている | project.json、README、docs を目で確認 | 本名・顧客名・社内情報がない |

## 公開後に守ること

- 値は GitHub Secrets と、デプロイ先の環境変数に置く。環境変数ファイルは `.gitignore` に入れたままにする（変数名の見本は `.env.sample` に書く）。
- Issue と PR のタイトル・本文に、顧客名や認証情報を書かない。
- 万一コミットしたら、まずキーを再発行する。そのあとで履歴を整理するかを決める。
