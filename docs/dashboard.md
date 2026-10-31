# 進捗ダッシュボード

チーム、日程、WBS（ガントチャート）、Issue と PR の状況、資料リンクを、1 枚のページ（GitHub Pages）で見られる。データは、リポジトリのファイルと GitHub から自動で集める。用語の意味は [dashboard-wording.md](dashboard-wording.md) にまとめてある。

## 画面でできること

- 要約と「要注意」: 次の予定、完了率、担当者のいない Issue、遅れているタスク、滞留している PR を、先頭で確認する。
- 予定: カレンダーの日に触れると詳細が出る。会議の URL があれば、参加ボタンを押す。
- WBS: マイルストーンごとのガントチャート。タスク名は Issue へのリンク。
- 進み具合: マイルストーンの完了率と、Issue の起票・完了の推移。
- Issue と PR: メンバーと状態で絞り込む。
- メンバー、資料リンク、ライト・ダーク・システムの切り替え。スマホ幅では、ナビが上に固定され、カレンダーとメンバーは横にスワイプする。

## データの出どころ

| 内容 | 出どころ | 更新のしかた |
| --- | --- | --- |
| プロジェクト名、チーム名、メンバー | `.claude/project.json`（`project.name`・`team.name`・`team.members`） | PR で変更する |
| 予定、WBS | `dashboard/data/schedule.yml` | PR で変更する |
| 資料リンク | `dashboard/data/links.json` | PR で変更する |
| Issue、PR、マイルストーン | GitHub（自動で取得） | 手では触らない |

チーム情報（`project.name` とメンバー）を入れる前は、画面の上に「サンプル表示」と出て、仮のデータで表示される。`schedule.yml` と `links.json` の先頭の `sample: true` を消すと、その項目のサンプル表示が消える。

## 有効にする手順

Claude Code の `adopt-template` スキルが、質問しながら進める。手で行うときは次のとおり。

1. データを書く（下の「データの書き方」）。`node scripts/build-dashboard.js --check` で、誤りがないことを確かめる。
2. GitHub の Settings → Pages で、Source を「GitHub Actions」にする。
3. リポジトリ変数 `DASHBOARD_ENABLED` を `true` にする（`gh variable set DASHBOARD_ENABLED --body true`）。
4. `main` に merge するか、Actions の `dashboard-pages` を手で実行する。公開された URL は、Actions の実行結果に出る。

公開には、リポジトリが public であるか、Pages を private で使えるプランが必要。Free プランの private リポジトリでは、公開できない。

**private（internal を含む）のリポジトリでは、生成を止める。** 公開ページに、Issue と PR のタイトル、担当者の GitHub ID が載るため。載せてよいと判断した場合だけ、リポジトリ変数 `DASHBOARD_ALLOW_PRIVATE` を `true` にする（`gh variable set DASHBOARD_ALLOW_PRIVATE --body true`）。`true` 以外の値では許可しない。

## データの書き方

### project.json

`team.members[].name` には、本名ではなく、ニックネームを入れる。公開ページに表示される。`github` は GitHub の ID。

### schedule.yml

```yaml
events:
  - date: "2026-11-20"        # YYYY-MM-DD
    title: 中間発表
    type: presentation        # presentation | deadline | review | other
    time: "13:00-15:00"       # 任意
    meet: "https://meet.google.com/xxx-xxxx-xxx"   # 任意
tasks:
  - id: T1
    title: API の設計
    milestone: M1 設計        # GitHub のマイルストーンの名前と同じにする
    start: "2026-11-01"
    end: "2026-11-07"
    assignee: github-id       # project.json のメンバーから選ぶ
    issue: 12                 # 任意。紐づく Issue の番号
    status: doing             # todo | doing | done（Issue がないときの状態）
    depends_on: [T0]          # 任意
```

- 日付は、引用符で囲む。
- Issue を紐づけると、その Issue が完了したときに、タスクが「完了」になる。
- 公開ページに載るので、`meet` には、誰でも入れる会議の URL を書かない（参加承認制の会議だけにする）。使える URL は、Google Meet・Zoom・Teams の https。

### links.json

```json
{ "links": [
  { "title": "要件定義書", "url": "https://…", "category": "設計", "access": "org", "updated": "2026-11-01", "note": "" }
] }
```

`access` は `org`（組織内のみ。ログインが必要）か `anyone`（リンクを知る全員が開ける）。`anyone` の資料は、公開ページから誰でも開けるので、公開してよい内容だけにする。

## 手元での確認

```bash
node scripts/build-dashboard.js --check                       # データの検査だけ（ネットワークを使わない）
node scripts/build-dashboard.js --out _site --sample-github   # サンプルの Issue・PR で、公開用のフォルダを作る
cd _site && python -m http.server 8000                        # http://localhost:8000 で開く（ファイルを直接開くと、データを読めない）
```

PR では、`dashboard-check` が検査を自動で行い、誤りがあると失敗する（`DASHBOARD_ENABLED` が `true` のとき）。

## 更新のタイミング

`main` への merge、Issue とマイルストーンの更新、PR の作成・クローズ・レビュー依頼、3 時間ごとの定期実行で、ページが作り直される。リポジトリに 60 日間動きがないと、GitHub が定期実行を止める。画面の上に、データを取得した日時が出る。

## 公開前に確認すること

公開ページには、Issue と PR のタイトル、担当者の GitHub ID、ニックネーム、予定、資料の名前とリンクが載る。顧客名や認証情報を、Issue・PR のタイトルに書かない。公開前の確認は [public-repo-checklist.md](public-repo-checklist.md) を使う。
