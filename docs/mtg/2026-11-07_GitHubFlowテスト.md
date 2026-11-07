# 2026-11-07 GitHub Flow テスト（M3）

講師配布の「GitHub Flow Must 手順書」（STEP 0〜9）を、3人が1周ずつ通す。全員が「作成者」と「レビュアー」の両方を1回ずつ経験し、最後に全員の手元で動けば合格。

- 目安：60分（ウォームアップ10分＋1周15分×3）
- 操作：git の commit・push・merge は人が SourceTree で行う（手順書 STEP 2「AI にやらせないこと」）。AI はファイルの作成・変更の相談だけに使う。
- 前提：全員が clone 済みで、main を pull してある。
- 前提：全員が git フックを有効にしてある。clone しただけでは有効にならない。リポジトリのフォルダで次を1回実行する（Mac・Windows 共通）。

  ```bash
  git config core.hooksPath .githooks
  ```

  有効になると、`.env` のコミットと main への直接 push を、SourceTree の操作でも止める。

## 役割の割り当て

| 周 | 作成者 | レビュアー | 変更するもの | ブランチ名 |
| --- | --- | --- | --- | --- |
| 0（ウォームアップ） | Claude Code（べーの依頼） | みかんさん | 既存の PR #6（AGENTS.md）と #7（議事録） | 作成済み |
| 1 | べー | みかんさん | 自分の要求定義書（下の「注意」を参照） | `docs/requirements-be` |
| 2 | みかんさん | あかぷさん | 自分の要求定義書 | `docs/requirements-mikan` |
| 3 | あかぷさん | べー | 自分の要求定義書 | `docs/requirements-akapu` |

- テストでは、新しいファイルを追加するだけにする。既存の文書は変えない。
- README の班ルールは、M3 の課題そのもの（テストではない）。べーが別の PR で出し、本人以外の Approve を受けて merge する。

- ブランチ名は `.claude/project.json` の規約（`docs/{slug}`、`feature/issue-{n}-{slug}` など）に合わせる。規約外の名前を止めるのは Claude Code で操作したときだけで、SourceTree では止まらない。自分で確かめる。
- 要求定義書の置き場所は `docs/requirements/<ニックネーム>.md` とする。別々のファイルなので、2周目と3周目は同時に進めても衝突しない。

## 周ごとの手順と合格条件

各周で、次の表を上から順に確かめる。

| STEP | 担当 | やること | 合格条件（目で確かめる） |
| --- | --- | --- | --- |
| 0 | 作成者 | Issue を立てる（タイトル1行、本文に「なぜ／やること／やらないこと」） | Issue 番号（#n）が付く |
| 1 | 作成者 | main を pull し、作業ブランチを切る | SourceTree の現在のブランチが作業ブランチになっている |
| 2 | 作成者＋AI | Claude Code と相談して、ファイルを追加・変更する | 変更したのは割り当てのファイルだけ |
| 3 | 作成者 | 差分を読み、今回のファイルだけをステージする | `.env`、`private/`、`giftia/` の未コミットの変更が入っていない |
| 4 | 作成者 | 「◯◯をする (#n)」で commit し、作業ブランチだけを push する | GitHub に作業ブランチが出る |
| 5 | 作成者 | PR を出す。本文に「何を／なぜ／確認手順」と `Closes #n` を書き、Slack で知らせる | base が `main`、compare が作業ブランチ |
| 6 | レビュアー | Conversation と Files changed を読む。fetch して作業ブランチをチェックアウトし、確認手順どおりに見る | 変更ファイルの数が本文と合う。`.env` がない |
| 7 | レビュアー | Submit review で、結果を一言書いて Approve する | Conversation に approved と出る |
| 8 | 作成者 | Approve を確かめて merge し、作業ブランチを消す。Slack で知らせる | Issue #n が自動で Closed になる |
| 9 | 全員 | main を pull して、フロントとバックを起動する。PR に「再現 OK」とコメントする | 3人分の「再現 OK」がそろう |

## 注意

- **Approve の前に merge しない。** main の保護設定では、`.md` と `docs/` の変更は Approve がなくても merge できてしまう（Approve 必須数が 0 で、CODEOWNERS の対象外のため）。M3 の条件「本人以外が Approve」は、人が守る。
- **コードを変える PR は、CODEOWNERS（べー・みかんさん）のうち、作成者以外の Approve が要る。** べーの PR はみかんさん、みかんさんの PR はべー、あかぷさんの PR はどちらかの Approve が必要。あかぷさんは CODEOWNERS にいないので、あかぷさんの Approve だけでは merge できない。今回のテストは `.md` だけなので影響しない。
- **要求定義書は public になる。** 班の DB（授業の配布データ）の件数や分析を含むなら、載せてよいかを先に確かめる。迷ったら、要求定義書の「顧客課題・提供価値・要求」の章だけを載せる。

## 困ったとき

| こんなとき | まずやること |
| --- | --- |
| main に push できない | 正常。作業ブランチを作って push し、PR を出す |
| commit や push が `[pre-commit]`・`[pre-push]` で止まった | git フックが `.env` か main への push を止めた。メッセージを読み、対象のファイルを外すか作業ブランチから push する |
| Conflict が起きた | 最新の main を作業ブランチに取り込み、`<<<<<<<` の箇所を直す |
| `.env` を commit した | すぐ班長に伝え、接続情報を変える。削除のコミットでは履歴から消えない |
| pull したら動かない | `npm install` と `pip install -r requirements.txt` をやり直す。だめなら PR にコメントする |

## 終わったら

- M3 の投稿の材料として、各自「学び・つまずいたポイント」と「覚えておくとよい Tips」を1つずつメモする。
- 任意（発展）：手順書の PR テンプレート（`.github/pull_request_template.md`）を、次回の PR で追加する。
