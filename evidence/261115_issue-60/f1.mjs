// F1（#60）の画面確認。API は Playwright で差し替える（DB・B3 には依存しない。ダミーデータだけ使う）
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.argv[2];
const BASE = "http://localhost:3000";
fs.mkdirSync(OUT, { recursive: true });
const CORS = { "access-control-allow-origin": "*" };

const gift = (id, name) => ({ id, category: "食品", brand: "ダミー店", name, price: 3980, rating: 4.2, reviewCount: 12, tags: [] });
const searchBody = { total: 3, results: [gift("G0001", "商品A（レビュー多め）"), gift("G0002", "商品B（レビュー0件）"), gift("G0003", "商品C（404になる）")] };

const seg = (t, m = false) => ({ text: t, mark: m });
const rv = (i, sentiment, toMother, segments) => ({ id: `RV${String(i).padStart(7, "0")}`, rating: 4, toMother, sentiment, segments });
const base = [
  rv(1, "positive", true, [seg("義母への母の日の贈りものに。"), seg("毎日使ってくれているようです。", true), seg("また選ぶと思います。")]),
  rv(2, "negative", true, [seg("少し小さかったです。")]),
  rv(3, "mixed", false, [seg("見た目はよいです。"), seg("ただ値段が高いです。")]),
  rv(4, "neutral", false, [seg("普通でした。")]),
];
const many = (n) => [...base, ...Array.from({ length: n - 4 }, (_, k) => rv(k + 5, "positive", false, [seg(`ダミーのレビュー${k + 5}件目です。`)]))];
const detail = (id, reviews, total = reviews.length) => ({ id, name: id === "G0001" ? "商品A（レビュー多め）" : "商品B（レビュー0件）", price: 3980, description: "説明文の1行目\n説明文の2行目", reviewTotal: total, reviews });

const results = [];
const ok = (name, cond, note = "") => { results.push({ name, pass: !!cond, note }); console.log(cond ? "PASS" : "FAIL", name, note); };

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });

async function open(colorScheme = "light", productHandler) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.route("**/api/search**", (r) => r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(searchBody) }));
  await page.route("**/api/products/**", productHandler);
  await page.goto(BASE);
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByText("上位 3 件").waitFor();
  return { ctx, page, dialogs };
}
const json = (body, status = 200) => ({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });

// TC-15・17・18・TC-29（レビュー多め）
{
  const { ctx, page } = await open("light", (r) => {
    const id = r.request().url().split("/").pop();
    if (id === "G0001") return r.fulfill(json(detail("G0001", many(25).slice(0, 25), 41)));
    if (id === "G0002") return r.fulfill(json(detail("G0002", [])));
    return r.fulfill(json({ detail: "商品がありません" }, 404));
  });
  await page.getByRole("button", { name: /商品A/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("heading", { name: "商品A（レビュー多め）" }).waitFor();
  ok("TC-15 商品名・価格・説明文", (await dlg.innerText()).includes("3,980円") && (await dlg.innerText()).includes("説明文の2行目"));
  const items = dlg.locator("li.review");
  ok("TC-29 最初は10件", (await items.count()) === 10, `件数=${await items.count()}`);
  ok("TC-15 先頭2件に「母に贈った人」", (await items.nth(0).innerText()).includes("母に贈った人") && (await items.nth(1).innerText()).includes("母に贈った人"));
  ok("TC-15 3件目以降に印なし", !(await items.nth(2).innerText()).includes("母に贈った人"));
  ok("TC-29 もっと見る（10 / 25）", await dlg.getByRole("button", { name: "もっと見る（10 / 25）" }).isVisible());
  ok("SP-14 30件超の注記", (await dlg.innerText()).includes("新しい順に25件を表示しています（母に贈ったレビューを先頭）"));
  // TC-17 色と文字
  const bg = (i) => items.nth(i).evaluate((e) => getComputedStyle(e).backgroundColor);
  ok("TC-17 positive=薄い青", (await bg(0)) === "rgb(232, 241, 251)", await bg(0));
  ok("TC-17 negative=薄い赤", (await bg(1)) === "rgb(253, 236, 236)", await bg(1));
  ok("TC-17 mixed=薄いグレー", (await bg(2)) === "rgb(242, 243, 245)", await bg(2));
  ok("TC-17 neutral=薄いグレー", (await bg(3)) === "rgb(242, 243, 245)", await bg(3));
  const t = async (i) => (await items.nth(i).locator(".review-head").innerText());
  ok("TC-17 文字：よかった点／気になる点／よかった点・気になる点／なし",
    (await t(0)).includes("よかった点") && (await t(1)).includes("気になる点") && (await t(2)).includes("よかった点・気になる点") &&
    !(await t(3)).includes("よかった点") && !(await t(3)).includes("気になる点"));
  // TC-18 ハイライト
  const mark = items.nth(0).locator("mark");
  ok("TC-18 mark は1か所だけ", (await items.nth(0).locator("mark").count()) === 1);
  const ms = await mark.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, w: getComputedStyle(e).fontWeight, text: e.textContent }));
  ok("TC-18 背景 #fcc419・太字", ms.bg === "rgb(252, 196, 25)" && Number(ms.w) >= 700, JSON.stringify(ms));
  ok("TC-18 本文は原文のまま", (await items.nth(0).locator(".review-body").innerText()) === "義母への母の日の贈りものに。毎日使ってくれているようです。また選ぶと思います。");
  await page.screenshot({ path: `${OUT}/TC-15_17_18_modal-light.png` });
  // TC-29 もっと見る
  await dlg.getByRole("button", { name: "もっと見る（10 / 25）" }).click();
  ok("TC-29 押すと20件・もっと見る（20 / 25）", (await items.count()) === 20 && (await dlg.getByRole("button", { name: "もっと見る（20 / 25）" }).isVisible()));
  await dlg.getByRole("button", { name: "もっと見る（20 / 25）" }).click();
  ok("TC-29 全部（25件）出たらボタンが消える", (await items.count()) === 25 && (await dlg.getByRole("button", { name: /もっと見る/ }).count()) === 0);
  await page.screenshot({ path: `${OUT}/TC-29_more-all.png` });
  // 閉じ方：×
  await dlg.getByRole("button", { name: "閉じる" }).click();
  ok("TC-15 ×で閉じる・検索結果が残る", (await page.getByRole("dialog").count()) === 0 && (await page.getByText("上位 3 件").isVisible()));
  // 開き直すと10件
  await page.getByRole("button", { name: /商品A/ }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "商品A（レビュー多め）" }).waitFor();
  ok("TC-29 開き直すと10件に戻る", (await page.locator("li.review").count()) === 10);
  // Esc
  await page.keyboard.press("Escape");
  ok("TC-15 Esc で閉じる", (await page.getByRole("dialog").count()) === 0);
  // 外側
  await page.getByRole("button", { name: /商品A/ }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "商品A（レビュー多め）" }).waitFor();
  await page.getByRole("dialog").click({ position: { x: 20, y: 200 } }); // モーダルの中は閉じない
  ok("SP-12 モーダルの中を押しても閉じない", (await page.getByRole("dialog").count()) === 1);
  await page.mouse.click(5, 5); // 外側
  ok("TC-15 外側で閉じる", (await page.getByRole("dialog").count()) === 0);
  // キーボード（Enter / Space）
  const card = page.getByRole("button", { name: /商品B/ });
  await card.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  ok("SP-12 Enter で開く", true);
  // TC-16 0件
  ok("TC-16 「まだレビューがありません。」と説明文", (await page.getByRole("dialog").innerText()).includes("まだレビューがありません。") && (await page.getByRole("dialog").innerText()).includes("説明文の1行目"));
  await page.screenshot({ path: `${OUT}/TC-16_no-reviews.png` });
  await page.keyboard.press("Escape");
  await card.focus();
  await page.keyboard.press("Space");
  await page.getByRole("dialog").waitFor();
  ok("SP-12 Space で開く", true);
  await page.keyboard.press("Escape");
  // TC-30② 404
  await page.getByRole("button", { name: /商品C/ }).click();
  await page.getByRole("dialog").getByText("商品が見つかりませんでした。").waitFor();
  ok("TC-30② モーダル内に「商品が見つかりませんでした。」・自動では閉じない", (await page.getByRole("dialog").count()) === 1);
  await page.screenshot({ path: `${OUT}/TC-30-2_not-found.png` });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
  ok("TC-30② 閉じると検索結果が残っている", await page.getByText("上位 3 件").isVisible());
  await ctx.close();
}

// TC-20 XSS
{
  const x = [rv(1, "neutral", false, [seg("<script>alert(1)</script>"), seg("<img src=x onerror=alert(2)>", true)])];
  const { ctx, page, dialogs } = await open("light", (r) => r.fulfill(json(detail("G0001", x))));
  await page.getByRole("button", { name: /商品A/ }).click();
  await page.locator("li.review").waitFor();
  await page.waitForTimeout(500);
  const body = await page.locator(".review-body").innerText();
  ok("TC-20 文字としてそのまま出る", body.includes("<script>alert(1)</script>") && body.includes("<img src=x onerror=alert(2)>"), body);
  ok("TC-20 alert が出ない・img が作られない", dialogs.length === 0 && (await page.locator(".review-body img").count()) === 0, `alert=${dialogs.length}`);
  await page.screenshot({ path: `${OUT}/TC-20_xss.png` });
  await ctx.close();
}

// 失敗（500）→「レビューを読み込めませんでした。」
{
  const { ctx, page } = await open("light", (r) => r.fulfill(json({ detail: "x" }, 500)));
  await page.getByRole("button", { name: /商品A/ }).click();
  await page.getByRole("dialog").getByText("レビューを読み込めませんでした。").waitFor();
  ok("SP-12 500 は「レビューを読み込めませんでした。」", true);
  await ctx.close();
}

// TC-31 ダークモード
{
  const h = (r) => r.fulfill(json(detail("G0001", base)));
  const L = await open("light", h);
  await L.page.getByRole("button", { name: /商品A/ }).click(); await L.page.locator("li.review").first().waitFor();
  const D = await open("dark", h);
  await D.page.getByRole("button", { name: /商品A/ }).click(); await D.page.locator("li.review").first().waitFor();
  const snap = (p) => p.evaluate(() => {
    const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor + "|" + getComputedStyle(e).color : null; };
    const sel = document.querySelector("form select");
    return { modal: g(".modal"), pos: g(".review-positive"), neg: g(".review-negative"), mix: g(".review-mixed"), mark: g("mark"), input: g(".q"), select: sel ? getComputedStyle(sel).backgroundColor + "|" + getComputedStyle(sel).color : null, scheme: getComputedStyle(document.documentElement).colorScheme };
  });
  const a = await snap(L.page), b = await snap(D.page);
  ok("TC-31 ダークでもライトと同じ色", JSON.stringify(a) === JSON.stringify(b), JSON.stringify(b));
  await L.page.screenshot({ path: `${OUT}/TC-31_light.png` });
  await D.page.screenshot({ path: `${OUT}/TC-31_dark.png` });
  await L.ctx.close(); await D.ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(results, null, 2));
const fail = results.filter((r) => !r.pass);
console.log(`\n合計 ${results.length} 件、失敗 ${fail.length} 件`);
process.exit(fail.length ? 1 : 0);
