# 進捗ダッシュボード（dashboard）の質問と設定

`dashboard` を選んだときに、`interview.md`（チーム名・メンバー）のあとで行う。1 つずつ聞いて、答えの直後に書き込む。仕組みと書き方は `docs/dashboard.md`、画面の言葉は `docs/dashboard-wording.md`。

## 前提の確認

- リポジトリが public か、Pages を使えるプランか。Free プランの private では、公開できない。公開できないときは、データだけ書いて、公開の設定（下の 4・5）は飛ばし、理由を伝える。
- `interview.md` のメンバーとチーム名が、埋まっていること。埋まっていなければ、先にそちらを行う（埋まるまで、画面は「サンプル表示」のまま）。

## 質問（`dashboard/data/schedule.yml` と `links.json`）

| 順 | 質問 | 書き込み | 確認 |
| --- | --- | --- | --- |
| 1 | 発表・提出・レビューなどの予定（1 件ずつ。なければ飛ばす） | `schedule.yml` の `events` に、Edit で追記する。日付は引用符で囲む | 日付の形式（YYYY-MM-DD）。種類は presentation・deadline・review・other |
| 2 | その予定に、会議の URL はあるか | `meet` に書く | Google Meet・Zoom・Teams の https だけ。**公開ページに載る**ので、誰でも入れる会議なら、書かない（参加承認制にするよう伝える） |
| 3 | 資料のリンク（Google Drive など。1 件ずつ。なければ飛ばす） | `links.json` の `links` に追記する | https の URL。共有設定が、組織内のみ（`org`）か、リンクを知る全員（`anyone`）か。`anyone` は、公開してよい資料かを確認する |
| 4 | WBS のタスクは、今あるか | あれば、1 件ずつ `tasks` に追記する。なければ、空のまま（あとで追加できると伝える） | 担当者は、メンバーの GitHub ID。マイルストーンは、GitHub の名前と同じ |

書き終えたら、`sample: true` の行を、`schedule.yml` と `links.json` から消す（内容を、自分たちのものに書き換えたときだけ）。そのあと、`node scripts/build-dashboard.js --check` を実行し、出力を見せる。エラーが出たら、直して、もう一度実行する。

## GitHub 側の設定（1 項目ずつ承認を得て実行する）

`references/github-settings.md` の「5. Pages」と「6. DASHBOARD_ENABLED」を使う。順番は、データの検査が通ったあと。

公開のあとで、Actions の `dashboard-pages` を実行し、結果（成功か失敗か、公開された URL）を、読み取りで確認して報告する。実行できていないこと、確認できていないことは、「未確認」と書く。
