// F1（#60）の画面確認（実 API 版）。商品の詳細は、起動中の B3（/api/products/{id}）をそのまま使う。
// 検索（/api/search）だけ、確認したい商品を並べるために差し替える（検索は #59 の範囲外）。
// 期待値は、同じ API を直接呼んだ応答から計算する（画面が API の内容と一致することを確かめる）。
// 使い方: node f1-real.mjs <出力フォルダ> <IDの JSON>
//   IDの JSON 例: {"many":"G3759","small":"G0091","zero":"G0002","missing":"G9999","negative":"G..","neutral":"G.."}
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.argv[2];
const IDS = JSON.parse(process.argv[3]);
const BASE = "http://localhost:3000";
const API = "http://127.0.0.1:8001";
fs.mkdirSync(OUT, { recursive: true });
const CORS = { "access-control-allow-origin": "*" };

const results = [];
const ok = (name, cond, note = "") => { results.push({ name, pass: !!cond, note }); console.log(cond ? "PASS" : "FAIL", name, note); };

// 実 API から期待値を取る
const detail = async (id) => (await fetch(`${API}/api/products/${id}`)).json();
const D = {};
for (const [k, id] of Object.entries(IDS)) if (k !== "missing") D[k] = await detail(id);

// 検索の差し替え（結果カードに並べる商品）
const gift = (d) => ({ id: d.id, category: "食品", brand: "確認用", name: d.name, price: d.price, rating: 4.2, reviewCount: d.reviewTotal, tags: [] });
const unique = [...new Map(Object.values(D).map((d) => [d.id, d])).values()];
const cards = [...unique.map(gift), { ...gift(D.zero), id: IDS.missing, name: "存在しない商品（G9999）" }];
const searchBody = { total: cards.length, results: cards };

const BG = { positive: "rgb(232, 241, 251)", negative: "rgb(253, 236, 236)", mixed: "rgb(242, 243, 245)", neutral: "rgb(242, 243, 245)" };
const HEAD = { positive: "よかった点", negative: "気になる点", mixed: "よかった点・気になる点", neutral: null };
const fullText = (r) => r.segments.map((s) => s.text).join("");

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });

async function open(colorScheme = "light") {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme });
  const page = await ctx.newPage();
  const seen = [];
  page.on("response", (r) => { if (r.url().includes("/api/products/")) seen.push(`${r.status()} ${r.url().split("/").pop()}`); });
  await page.route("**/api/search**", (r) => r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(searchBody) }));
  await page.goto(BASE);
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByText(`上位 ${cards.length} 件`).waitFor();
  return { ctx, page, seen };
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const card = (page, name) => page.getByRole("button", { name: new RegExp(esc(name)) });

// 1 レビューが多い商品（TC-15・17・18・29、SP-14）
{
  const d = D.many;
  const { ctx, page, seen } = await open("light");
  await card(page, d.name).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("heading", { name: d.name }).waitFor();
  await dlg.locator("li.review").first().waitFor();
  const items = dlg.locator("li.review");
  const txt = await dlg.innerText();
  ok("実 API を呼んでいる（モックでない）", seen.some((s) => s === `200 ${d.id}`), seen.join(","));
  ok("TC-15 商品名・価格・説明文", txt.includes(`${d.price.toLocaleString()}円`) && txt.includes(d.description.split("\n")[0]));
  ok(`TC-15 見出しに件数（reviewTotal=${d.reviewTotal}）`, txt.includes(`${d.reviewTotal}件`));
  ok(`TC-29 最初は10件（API は ${d.reviews.length} 件を返した）`, (await items.count()) === 10, `件数=${await items.count()}`);
  ok("SP-14 注記（全件数 > 届いた件数）", d.reviewTotal > d.reviews.length && txt.includes("新しい順に") && txt.includes(`${d.reviews.length}件`), txt.match(/新しい順[^\n]*/)?.[0] ?? "注記なし");
  let orderOk = true, bgOk = true, headOk = true, bodyOk = true, markOk = true;
  for (let i = 0; i < 10; i++) {
    const r = d.reviews[i], it = items.nth(i);
    if ((await it.innerText()).includes("母に贈った人") !== r.toMother) orderOk = false;
    if ((await it.evaluate((e) => getComputedStyle(e).backgroundColor)) !== BG[r.sentiment]) bgOk = false;
    const head = await it.locator(".review-head").innerText();
    const want = HEAD[r.sentiment];
    if (want ? !head.includes(want) : head.includes("よかった点") || head.includes("気になる点")) headOk = false;
    if ((await it.locator(".review-body").innerText()) !== fullText(r)) bodyOk = false;
    if ((await it.locator("mark").count()) !== r.segments.filter((s) => s.mark).length) markOk = false;
  }
  ok("TC-15 母に贈った人の印が、API の toMother と先頭10件で一致", orderOk);
  ok("TC-17 背景色が、API の sentiment と先頭10件で一致", bgOk);
  ok("TC-17 文字（よかった点／気になる点…）が先頭10件で一致", headOk);
  ok("TC-28相当 画面の本文が、API の segments をつなげた原文と先頭10件で一致", bodyOk);
  ok("TC-18 mark の数が、API の mark=true の数と先頭10件で一致", markOk);
  const firstMark = items.locator("mark").first();
  if (await firstMark.count()) {
    const ms = await firstMark.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, w: getComputedStyle(e).fontWeight }));
    ok("TC-18 背景 #fcc419・太字", ms.bg === "rgb(252, 196, 25)" && Number(ms.w) >= 700, JSON.stringify(ms));
  } else ok("TC-18 背景 #fcc419・太字", false, "先頭10件に mark がない");
  await page.screenshot({ path: `${OUT}/TC-15_17_18_modal-light.png` });

  const n = d.reviews.length;
  ok(`TC-29 もっと見る（10 / ${n}）`, await dlg.getByRole("button", { name: `もっと見る（10 / ${n}）` }).isVisible());
  await dlg.getByRole("button", { name: `もっと見る（10 / ${n}）` }).click();
  ok(`TC-29 押すと20件・もっと見る（20 / ${n}）`, (await items.count()) === 20 && (await dlg.getByRole("button", { name: `もっと見る（20 / ${n}）` }).isVisible()));
  await dlg.getByRole("button", { name: `もっと見る（20 / ${n}）` }).click();
  ok(`TC-29 全部（${n}件）出たらボタンが消える`, (await items.count()) === n && (await dlg.getByRole("button", { name: /もっと見る/ }).count()) === 0);
  await page.screenshot({ path: `${OUT}/TC-29_more-all.png` });

  await dlg.getByRole("button", { name: "閉じる" }).click();
  ok("TC-15 ×で閉じる・検索結果が残る", (await page.getByRole("dialog").count()) === 0 && (await page.getByText(`上位 ${cards.length} 件`).isVisible()));
  await card(page, d.name).click();
  await page.getByRole("dialog").getByRole("heading", { name: d.name }).waitFor();
  await page.locator("li.review").first().waitFor();
  ok("TC-29 開き直すと10件に戻る", (await page.locator("li.review").count()) === 10);
  await page.keyboard.press("Escape");
  ok("TC-15 Esc で閉じる", (await page.getByRole("dialog").count()) === 0);
  await card(page, d.name).click();
  await page.getByRole("dialog").getByRole("heading", { name: d.name }).waitFor();
  await page.getByRole("dialog").click({ position: { x: 20, y: 200 } });
  ok("SP-12 モーダルの中を押しても閉じない", (await page.getByRole("dialog").count()) === 1);
  await page.mouse.click(5, 5);
  ok("TC-15 外側で閉じる", (await page.getByRole("dialog").count()) === 0);
  await ctx.close();
}

// 2 レビューが少ない商品（もっと見る・注記が出ない）
{
  const d = D.small;
  const { ctx, page } = await open("light");
  await card(page, d.name).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("li.review").first().waitFor();
  ok(`TC-29 ${d.reviews.length}件すべて出る・もっと見るなし・SP-14 の注記なし`,
    d.reviewTotal === d.reviews.length && (await dlg.locator("li.review").count()) === d.reviews.length && (await dlg.getByRole("button", { name: /もっと見る/ }).count()) === 0 && !(await dlg.innerText()).includes("新しい順に"));
  await ctx.close();
}

// 3 レビュー0件（TC-16）＋キーボード
{
  const d = D.zero;
  const { ctx, page } = await open("light");
  const c = card(page, d.name);
  await c.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.getByText("まだレビューがありません。").waitFor();
  const t = await page.getByRole("dialog").innerText();
  ok("SP-12 Enter で開く", true);
  ok("TC-16 「まだレビューがありません。」と説明文", t.includes("まだレビューがありません。") && t.includes(d.description.split("\n")[0]) && d.reviewTotal === 0, `reviewTotal=${d.reviewTotal}`);
  await page.screenshot({ path: `${OUT}/TC-16_no-reviews.png` });
  await page.keyboard.press("Escape");
  await c.focus();
  await page.keyboard.press("Space");
  await page.getByRole("dialog").waitFor();
  ok("SP-12 Space で開く", true);
  await ctx.close();
}

// 4 存在しない商品（TC-30②。実 API が 404 を返す）
{
  const { ctx, page, seen } = await open("light");
  await card(page, "存在しない商品").click();
  await page.getByRole("dialog").getByText("商品が見つかりませんでした。").waitFor();
  ok("TC-30② 実 API の 404 で「商品が見つかりませんでした。」・自動では閉じない", seen.includes(`404 ${IDS.missing}`) && (await page.getByRole("dialog").count()) === 1, seen.join(","));
  await page.screenshot({ path: `${OUT}/TC-30-2_not-found.png` });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
  ok("TC-30② 閉じると検索結果が残っている", await page.getByText(`上位 ${cards.length} 件`).isVisible());
  await ctx.close();
}

// 5 センチメントの negative・neutral（TC-17）。該当のレビューを含む商品で確かめる
for (const kind of ["negative", "neutral"]) {
  const d = D[kind];
  const r = d.reviews.find((x) => x.sentiment === kind);
  const { ctx, page } = await open("light");
  await card(page, d.name).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("li.review").first().waitFor();
  while (await dlg.getByRole("button", { name: /もっと見る/ }).count()) await dlg.getByRole("button", { name: /もっと見る/ }).click();
  const item = dlg.locator("li.review").nth(d.reviews.indexOf(r));
  const head = await item.locator(".review-head").innerText();
  const bg = await item.evaluate((e) => getComputedStyle(e).backgroundColor);
  const want = HEAD[kind];
  ok(`TC-17 ${kind} の背景色・文字（${d.id} の ${r.id}）`, bg === BG[kind] && (want ? head.includes(want) : !head.includes("よかった点") && !head.includes("気になる点")), `${bg} / ${head.replace(/\s+/g, " ")}`);
  await item.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/TC-17_${kind}.png` });
  await ctx.close();
}

// 6 ダークモード（TC-31）。実データで、ライトと同じ色になるか
{
  const d = D.many;
  const open1 = async (scheme) => { const o = await open(scheme); await card(o.page, d.name).click(); await o.page.locator("li.review").first().waitFor(); return o; };
  const L = await open1("light"), Dk = await open1("dark");
  const snap = (p) => p.evaluate(() => {
    const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor + "|" + getComputedStyle(e).color : null; };
    const sel = document.querySelector("form select");
    return { modal: g(".modal"), pos: g(".review-positive"), neg: g(".review-negative"), mix: g(".review-mixed"), mark: g("mark"), input: g(".q"), select: sel ? getComputedStyle(sel).backgroundColor + "|" + getComputedStyle(sel).color : null, scheme: getComputedStyle(document.documentElement).colorScheme };
  });
  const a = await snap(L.page), b = await snap(Dk.page);
  ok("TC-31 ダークでもライトと同じ色", JSON.stringify(a) === JSON.stringify(b), JSON.stringify(b));
  await L.page.screenshot({ path: `${OUT}/TC-31_light.png` });
  await Dk.page.screenshot({ path: `${OUT}/TC-31_dark.png` });
  await L.ctx.close(); await Dk.ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/result-real.json`, JSON.stringify(results, null, 2));
const fail = results.filter((r) => !r.pass);
console.log(`\n合計 ${results.length} 件、失敗 ${fail.length} 件`);
process.exit(fail.length ? 1 : 0);
