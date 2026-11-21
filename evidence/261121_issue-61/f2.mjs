// F2（#61）の画面確認。検索（/api/search）の応答を Playwright で差し替えて、TC-27 と TC-30 の①を確かめる。
// 使い方: node f2.mjs <出力フォルダ>   （フロントを http://localhost:3000 で起動しておく）
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.argv[2];
const BASE = "http://localhost:3000";
fs.mkdirSync(OUT, { recursive: true });
const CORS = { "access-control-allow-origin": "*" };
const results = [];
const ok = (name, cond, note = "") => { results.push({ name, pass: !!cond, note }); console.log(cond ? "PASS" : "FAIL", name, note); };

const gift = (id, name) => ({ id, category: "食品", brand: "確認用", name, price: 1000, rating: 4.2, reviewCount: 3, tags: [] });
const body = (name) => JSON.stringify({ total: 1, results: [gift("G" + name, name)] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, colorScheme: "light" });
  return { ctx, page: await ctx.newPage() };
};
const btn = (page) => page.locator("form.form button[type=submit]");

// ---- TC-27：検索中の表示と、最後の検索の結果だけを出す ----
{
  const { ctx, page } = await newPage();
  const calls = [];
  await page.route("**/api/search**", async (r) => {
    const q = new URL(r.request().url()).searchParams.get("q");
    calls.push(q);
    if (q === "slow") await sleep(2500); // 1回目：遅い応答（後から届く）
    else await sleep(300);               // 2回目：速い応答
    await r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: body(q === "slow" ? "結果A_遅い" : "結果B_速い") });
  });
  await page.goto(BASE);
  const q = page.locator("input.q");
  await q.fill("slow");
  await btn(page).click();
  await page.waitForFunction(() => document.querySelector("form.form button[type=submit]")?.textContent === "検索中…");
  ok("TC-27 検索中はボタンの文字が「検索中…」", (await btn(page).innerText()) === "検索中…");
  ok("TC-27 検索中はボタンが押せない（disabled）", await btn(page).isDisabled());
  await page.screenshot({ path: `${OUT}/TC-27_searching.png` });

  // 押せないボタンを強制クリックしても、2回目の検索は送られない
  await btn(page).click({ force: true, timeout: 1000 }).catch(() => {});
  await sleep(200);
  ok("TC-27 検索中にボタンを押しても、API は1回しか呼ばれない", calls.length === 1, `calls=${JSON.stringify(calls)}`);

  // 競合を起こす：画面のボタンは押せないので、フォームを直接送って「条件を変えた2回目」を作る（古い応答を捨てる処理の確認）
  await q.fill("fast");
  await page.evaluate(() => document.querySelector("form.form").requestSubmit());
  await page.getByText("上位 1 件").waitFor();
  await page.getByText("結果B_速い").waitFor();
  ok("TC-27 2回目（最後）の検索の結果が出る", await page.getByText("結果B_速い").isVisible());
  // 遅い1回目の応答が届くまで待つ
  await sleep(3000);
  ok("TC-27 遅れて届いた1回目の応答で書き換わらない", (await page.getByText("結果B_速い").count()) === 1 && (await page.getByText("結果A_遅い").count()) === 0,
    `A=${await page.getByText("結果A_遅い").count()} B=${await page.getByText("結果B_速い").count()}`);
  ok("TC-27 結果が出たあとはボタンが「検索」に戻り、押せる", (await btn(page).innerText()) === "検索" && (await btn(page).isEnabled()));
  await page.screenshot({ path: `${OUT}/TC-27_latest-only.png` });
  ok("TC-27 API の呼び出しは slow → fast の2回", JSON.stringify(calls) === JSON.stringify(["slow", "fast"]), JSON.stringify(calls));
  await ctx.close();
}

// ---- TC-30 ①：422 のときの文言 ----
{
  const { ctx, page } = await newPage();
  let mode = "ok";
  await page.route("**/api/search**", (r) => {
    if (mode === "ok") return r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: body("前の結果") });
    if (mode === "422") return r.fulfill({ status: 422, headers: CORS, contentType: "application/json", body: JSON.stringify({ detail: [{ type: "string_too_long" }] }) });
    return r.fulfill({ status: 500, headers: CORS, contentType: "application/json", body: "{}" });
  });
  await page.goto(BASE);
  await btn(page).click();
  await page.getByText("前の結果").waitFor();

  mode = "422";
  await btn(page).click();
  const msg = "検索の条件を確かめてください（キーワードは100文字までです）。";
  await page.getByText(msg).waitFor();
  const txt = await page.locator("main").innerText();
  ok("TC-30① 422 のとき指定の文言が出る", txt.includes(msg));
  ok("TC-30① 「APIにつながりません」は出ない", !txt.includes("APIにつながりません"));
  ok("TC-30① 前の検索結果は消える", (await page.getByText("前の結果").count()) === 0);
  ok("TC-30① 失敗後はボタンが「検索」に戻る", (await btn(page).innerText()) === "検索" && (await btn(page).isEnabled()));
  await page.screenshot({ path: `${OUT}/TC-30-1_422.png` });

  mode = "500"; // 422 以外は、いままでどおりの文言
  await btn(page).click();
  await page.getByText(/APIにつながりません/).waitFor();
  const t2 = await page.locator("main").innerText();
  ok("422 以外（500）はいままでどおり「APIにつながりません：HTTP 500」", t2.includes("APIにつながりません：HTTP 500") && !t2.includes(msg), t2.split("\n").find((l) => l.includes("API")) ?? "");
  await ctx.close();
}

// ---- 入力できない：キーワード欄は100文字まで（SP-23 の①） ----
{
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  const q = page.locator("input.q");
  ok("キーワード欄に maxlength=100 が付いている", (await q.getAttribute("maxlength")) === "100");
  await q.click();
  await page.keyboard.insertText("あ".repeat(101)); // 貼り付けと同じ（ユーザー入力として入れる）
  const len = (await q.inputValue()).length;
  ok("101文字を入れても100文字までしか入らない", len === 100, `length=${len}`);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
