# GitHub 側の設定

`<owner>/<repo>` は `gh repo view --json nameWithOwner --jq .nameWithOwner` で取る。1 項目ずつ、次の流れで進める。

1. 何を変えるか、変えるとどうなるかを伝える。
2. コマンドを見せて、承認を得る。
3. 実行する。
4. 読み取りで確認して、結果（出力の要点）を見せる。変わっていなければ、「変わらなかった」と伝えて、画面での手順を案内する。

公開設定とプランによって、使えない項目がある。使えない場合は、HTTP エラーの内容を伝えて飛ばす。

## 1. secret scanning と push protection

push する前に、キーらしき文字列を GitHub が止める。public のリポジトリは無料で使える。private は有料プランが必要。

```bash
gh api -X PATCH repos/<owner>/<repo> --input - <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON
```

確認: `gh api repos/<owner>/<repo> --jq .security_and_analysis`

## 2. main ブランチの保護（PR を必須にする）

デフォルトブランチへの直接 push を止める。private のリポジトリでは、Free プランだと使えない（HTTP 403）。

実行の前に、デフォルトブランチの名前と、今の設定を読む。`PUT` は既存の設定を置き換えるので、すでに設定があれば、内容を見せて、置き換えてよいかを聞く。

- `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`（以下の `main` は、この名前に置き換える）
- `gh api repos/<owner>/<repo>/branches/main/protection`（404 は設定なし）

```bash
gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'JSON'
{"required_status_checks":null,"enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":1},"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
JSON
```

`enforce_admins` が false だと、管理者は承認なしでマージできる。1 人で開発するときはこのままにする。チームで管理者にも承認を求めるなら、true にするかを聞く。

確認: `gh api repos/<owner>/<repo>/branches/main/protection --jq '.required_pull_request_reviews'`

## 3. 外部の人の PR を止める

collaborator（書き込み権限のある人）だけが PR を作れるようにする。

```bash
gh api -X PATCH repos/<owner>/<repo> -f pull_request_creation_policy=collaborators_only
```

確認: `gh api repos/<owner>/<repo> --jq .pull_request_creation_policy`。値は、設定前が `all`。`collaborators_only` という値名は未確認なので、エラーや「変わらなかった」ときは、画面で設定する: Settings → General → Features → Pull requests → 「Collaborators only」。

## 4. 外部の人の Issue を止める

collaborator だけが Issue を作れるようにする。この設定に対応する API の項目は未確認なので、画面の手順を案内する: Settings → General → Features → Issues で、作成を collaborator に限る設定を選ぶ。画面に項目が無ければ、その旨を伝える。

## 5. Pages の公開元を GitHub Actions にする（`dashboard` を入れたとき）

進捗ダッシュボードを、ワークフローから公開する。public のリポジトリ、または Pages を private で使えるプランが必要。

実行の前に、今の設定を読む: `gh api repos/<owner>/<repo>/pages`（404 は、まだ無効）。

```bash
gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow     # まだ無効のとき
gh api -X PUT repos/<owner>/<repo>/pages -f build_type=workflow      # すでに有効のとき（公開元の切り替え）
```

確認: `gh api repos/<owner>/<repo>/pages --jq .build_type`（`workflow` になる）。実行していない間は「未確認」と書く。エラーのときは、画面で設定する: Settings → Pages → Source → 「GitHub Actions」。

## 6. ダッシュボードの公開を有効にする（`dashboard` を入れたとき）

リポジトリ変数 `DASHBOARD_ENABLED` を `true` にする。変数が `true` のときだけ、公開と検査のワークフローが動く。データの検査（`node scripts/build-dashboard.js --check`）が通ってから実行する。

```bash
gh variable set DASHBOARD_ENABLED --body true -R <owner>/<repo>
```

リポジトリが private（internal を含む）のときは、生成が止まる。公開ページに Issue・PR のタイトルと担当者の ID が載ってよいか、ユーザーに確認し、了承を得たときだけ `gh variable set DASHBOARD_ALLOW_PRIVATE --body true -R <owner>/<repo>` を実行する。確認なしに設定しない。

確認: `gh variable list -R <owner>/<repo>`。そのあと、Actions の `dashboard-pages` を手で実行して（`gh workflow run pages.yml -R <owner>/<repo>`）、結果を読み取りで確認する（`gh run list --workflow pages.yml -R <owner>/<repo> -L 1`）。

## 公開設定ごとの目安

| 設定 | 1 | 2 | 3 | 4 | 5・6 |
| --- | --- | --- | --- | --- | --- |
| public | 実行する | 実行する | 実行する | 案内する | 実行する |
| private（Free プラン） | 使えない | 使えない | 実行して確認する | 案内する | 公開できない。データだけ書く |
| あとで public | public にする直前に、`public-check` スキルで確認してから実行する | 同左 | 今でもよい | 同左 | public にしたあとで実行する |
