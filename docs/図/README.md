# 図

チームの要件定義書の図。正本は [drawio/](drawio/) の draw.io のファイル（.drawio）で、図を直すときはこちらを直す。

## draw.io のファイル（正本）

| ファイル | ページ | 中身 | 要件定義書での場所 |
| --- | --- | --- | --- |
| [ER図.drawio](drawio/ER図.drawio) | 1_変更前 | いまの DB のER図（7テーブル） | 5.1 |
| [ER図.drawio](drawio/ER図.drawio) | 2_変更後 | 変更前と同じ配置に、Phase1 で手を加えた部分をオレンジで強調した図 | 5.1 |
| [構成図.drawio](drawio/構成図.drawio) | 1_構成図 | 画面の部品・API の処理・DB のテーブルのつながり（Azure のアイコン入り） | 7.1 |
| [構成図.drawio](drawio/構成図.drawio) | 2_シーケンス図_検索 | 贈る相手とシーンを選んで検索したときの、画面・API・DB の動き | 7.2 |
| [構成図.drawio](drawio/構成図.drawio) | 3_シーケンス図_データ作成 | review_to_mother の行を作る手順（開発が月1回） | 7.2 |

図の決まり

- フォント：BIZ UDGothic
- 色：Azure の青（#0078D4）がいまのまま、Azure のオレンジ（#D83B01）と★がチーム版で足す・変えるもの
- アイコン：draw.io の Azure（azure2）のアイコン

## PNG（ページごとに1枚）

[png/](png/) に、draw.io の各ページを幅 2400px で書き出したもの。draw.io を直したら書き出し直す。

| ファイル | 元のページ |
| --- | --- |
| [ER図_1_変更前.png](png/ER図_1_変更前.png) | ER図.drawio の 1_変更前 |
| [ER図_2_変更後.png](png/ER図_2_変更後.png) | ER図.drawio の 2_変更後 |
| [構成図_1_構成図.png](png/構成図_1_構成図.png) | 構成図.drawio の 1_構成図 |
| [構成図_2_シーケンス図_検索.png](png/構成図_2_シーケンス図_検索.png) | 構成図.drawio の 2_シーケンス図_検索 |
| [構成図_3_シーケンス図_データ作成.png](png/構成図_3_シーケンス図_データ作成.png) | 構成図.drawio の 3_シーケンス図_データ作成 |

draw.io のデスクトップ版で書き出すコマンド（Git Bash。`-p` はページ番号）:

```bash
"/c/Users/<ユーザー名>/AppData/Local/Programs/draw.io/draw.io.exe" -x -f png --width 2400 -b 20 -p 2 -o png/ER図_2_変更後.png drawio/ER図.drawio
```

拡大率（`-s`）で指定すると、Windows の表示倍率の影響で図が拡大され、右と下が切れることがある。幅（`--width`）で指定する。

## 開き方・画像にする方法

- VS Code：拡張「Draw.io Integration」で .drawio を開くと、編集できる
- 画像（PNG・SVG）にする：draw.io で開き、ファイル → エクスポート
- BIZ UDGothic が入っていないパソコンでは、別のフォントで表示される（Windows 10 以降には標準で入っている）
