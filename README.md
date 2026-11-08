# Step3-1 Giftia 実装（みっかんべー）

Tech0 Step3-1。毎週配布されるコードをもとに、`giftia/` 配下で自分でコードを書き、ギフト EC の Giftia を実装する。

## 構成

| 場所 | 役割 |
| --- | --- |
| `giftia/giftia-frontend/` | Next.js のフロントエンド |
| `giftia/backend/` | FastAPI のバックエンド |
| `dashboard/` | 進捗ダッシュボード（GitHub Pages） |
| `.claude/`、`scripts/` | Claude Code の設定とひな形 |

## 進捗ダッシュボード

チーム MTG と成果発表の予定、Issue と PR の状況を、1 枚のページで見られる。

<https://tanobeyuya.github.io/Step3-1_giftia-mikkanbe/>

## 班のルール

人が守るルールをここにまとめる。AI（Claude Code）に守らせるルールの詳細は [AGENTS.md](AGENTS.md) にある。

### 最初に1回だけやること

clone したら、リポジトリのフォルダで次を実行する（Mac・Windows 共通）。`.env` のコミットと、main への直接 push を git が止めるようになる。SourceTree で操作したときも止まる。

```bash
git config core.hooksPath .githooks
```

### 変更の流れ

1. main を pull してから、作業ブランチを切る。main に直接 commit・push しない
2. 変更して commit し、作業ブランチを push する
3. PR を出す。本文はテンプレートの枠に沿って書き、解決する Issue があれば `Closes #番号` を書く
4. 本人以外が Approve してから merge する。Approve の前に merge しない
5. merge したら Slack で知らせ、全員が main を pull する

### ブランチ名とコミットメッセージ

| 種類 | ブランチ名 | コミットメッセージの例 |
| --- | --- | --- |
| 機能の追加 | `feature/issue-{Issue番号}-{英語の短い名前}` | `feat(frontend): 贈る相手で絞り込む (#20)` |
| バグの修正 | `fix/issue-{Issue番号}-{英語の短い名前}` | `fix(backend): 検索が0件で落ちるのを直す (#25)` |
| 文書 | `docs/{英語の短い名前}` | `docs(docs): 定例MTG の議事録を追加する` |
| 設定・その他 | `chore/{英語の短い名前}` | `chore(claude): フックの設定を直す` |

- 機能の追加とバグの修正は、先に Issue を立てる
- Claude Code で操作すると、規約に合わない名前は止まる。SourceTree では止まらないので、自分で確かめる

### レビューが必要な変更

| 変更するもの | merge の条件 |
| --- | --- |
| `giftia/` のコード | コードオーナー（べー・みかんさん・あかぷさん）のうち、作成者以外の1人が Approve する。GitHub の設定でも止まる |
| 要求定義書・要件定義書（`docs/要求定義書/`・`docs/要件定義書/`） | あかぷさん・みかんさんの両方が Approve する。実装の根拠になるため、軽微な変更として扱わない |
| 上記以外（議事録・README など） | 本人以外の1人が Approve する。GitHub の設定では止まらないので、人が守る |

### してはいけないこと

- `.env`・`.env.local` を commit しない。API キー・パスワード・接続文字列を、コード・文書・Slack に書かない。誤って commit したら、すぐ班長に伝えて接続情報を変える
- 個人情報などの実データをテストに使わない。ダミーの値だけ使う
- 配布コードの原本は書き換えない。`giftia/` にコピーして直す
- このリポジトリは public なので、本名・連絡先を書かない
