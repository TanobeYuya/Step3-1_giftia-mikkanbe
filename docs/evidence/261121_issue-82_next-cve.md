# Next.js などの脆弱性の対応（2026-11-21）

- 対応：#82
- 確かめた日・人：2026-11-21、べー（Claude Code が実行）
- 対象：`fix/issue-82-next-cve`（`origin/main` の 2760505 に、依存の更新を足したもの）

## 結論

GitHub の Dependabot が出していた moderate の警告5件（CVE は4件）を、依存の更新で直した。`npm audit` は 0 件になった。
いまのコードでは、どれも実際には悪用できなかった。それでも直したのは、将来キャッシュの機能を使った時点で危なくなるからである。警告を残すと、本当に危ない警告が埋もれる。

| パッケージ | 更新前 | 更新後 | 使われ方 |
| --- | --- | --- | --- |
| next | 16.4.3 | 16.4.5 | 直接使う（画面の本体） |
| eslint-config-next | 16.4.3 | 16.4.5 | 直接使う（開発用。next と版をそろえる） |
| typescript-eslint | 8.72.0 | 8.73.0 | 間接（ESLint の中。`npm audit fix` で更新） |
| minimatch（typescript-estree の下） | 10.2.6 | 11.0.9 | 間接（ESLint の中。`npm audit fix` で更新） |

`package.json` の next・eslint-config-next は、これまでどおり版を固定した（`^` を付けない）。

## CVE ごとの内容

| CVE | パッケージ | 起きること | Giftia に当てはまるか | 公式 |
| --- | --- | --- | --- | --- |
| CVE-2026-119350 | next 16.4.0〜16.4.4 | Cache Components の共有のひな形（fallback shell）が、リクエストに含まれた値で汚される。ほかの利用者に、汚れたページが返る | 当てはまらない。`next.config.ts` で Cache Components を有効にしていない | [GHSA-vvgp-ww4w-46vf](https://github.com/advisories/GHSA-vvgp-ww4w-46vf)・[CVE](https://www.cve.org/CVERecord?id=CVE-2026-119350) |
| CVE-2026-119351 | next 16.2.0〜16.4.4 | 入れ子の `use cache` 関数で、root param の値が違うキャッシュが混ざって返る | 当てはまらない。`app/`・`lib/` に `use cache` がない | [GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8)・[CVE](https://www.cve.org/CVERecord?id=CVE-2026-119351) |
| CVE-2026-119790 | next 16.3.0〜16.4.4 | `unstable_cache()` から `use cache` の関数を呼ぶと、別の root param の情報が見える | 当てはまらない。`unstable_cache` を使っていない | [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h)・[CVE](https://www.cve.org/CVERecord?id=CVE-2026-119790) |
| CVE-2026-118764 | minimatch 7.0.0〜11.0.0 | 細工したパターンを渡すと、処理が極端に重くなる（DoS：サービスを止める攻撃） | 当てはまらない。ESLint の中だけで動き、本番の画面には入らない。パターンを外から受け取る経路もない | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)・[CVE](https://www.cve.org/CVERecord?id=CVE-2026-118764) |

Dependabot の警告は、next の CVE-2026-119350 が `package.json` と `package-lock.json` の両方で出たため、5件になっていた。

当てはまるかは、次の方法で確かめた。

- `app/`・`lib/`・`next.config.ts` を `use cache`・`unstable_cache`・`cacheComponents` で検索した（該当なし）
- `npm ls minimatch` で、minimatch の依存元が eslint と typescript-eslint だけであることを確かめた

## 直す必要があった理由

- キャッシュは、ページを速くするために使いたくなる機能である。使い始めた時点で、上の3件が実際の問題になる
- 更新前の next 16.4.3 では、`npm run build` が Next.js の脆弱性チェック（`SecurityFatalError`）で止まった（[build-before.log](261121_issue-82/build-before.log)）。コンパイルは通っていたが、ビルドのコマンドは失敗として終わる
- next の更新は末尾の数字だけが上がるもの（パッチ）で、バグ修正だけを含む。壊れる心配は小さい

## 更新後の確認

| 確認 | 結果 | 証拠 |
| --- | --- | --- |
| `npm audit` | found 0 vulnerabilities | [audit-after.log](261121_issue-82/audit-after.log) |
| `npm run build` | 成功（exit 0。Next.js 16.4.5。ルートは /・/_not-found・/about の3つ） | [build-after.log](261121_issue-82/build-after.log) |
| `npm run lint` | 成功（exit 0。指摘なし） | [lint-after.log](261121_issue-82/lint-after.log) |
| 画面と API の HTTP | `/`・`/about`・JS がすべて 200。`/api/search`（母・誕生日）が 200。商品の詳細 G3759 が 200、G9999 が 404 | [http-check.log](261121_issue-82/http-check.log) |
| 画面の操作（検索とモーダル） | べーがブラウザで確かめた。母・誕生日で検索して結果カードが出て、カードからレビューのモーダルが開いた | 目視（スクリーンショットは残していない） |

## 確認していないこと

- 画面の操作の自動の確認。#60 の確認用スクリプトは playwright を使うが、この PC には入っていなかったため、人が目で確かめた
