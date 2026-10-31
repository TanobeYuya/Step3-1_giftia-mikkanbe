"use strict";
/* 進捗ダッシュボードの描画。
   データは data/*.json から読む。github.json が無いときは github.sample.json（サンプル）を使う。
   表示の「取得日」は端末の時計ではなく、github.json の generatedAt（データを取得した日時）。
   端末の時計を使うのは、会議の参加ボタンを「今日」だけ強調するときだけ。
   用語の意味は docs/dashboard-wording.md と、ページ下部の「用語の見方」に揃えてある。 */
(function () {
  var DAY = 86400000;
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  var STATE_LABEL = { done: "完了", doing: "進行中", todo: "未着手", late: "遅れ" };
  var EVENT_LABEL = { presentation: "発表", deadline: "締切", review: "レビュー", other: "その他" };
  var ISSUE_LABEL = { open: "未完了", done: "完了", skipped: "対象外" };
  var PR_LABEL = { draft: "下書き", open: "マージ前", merged: "マージ済み", rejected: "却下" };
  var MEET_HOSTS = { "meet.google.com": "Meet", "zoom.us": "Zoom", "teams.microsoft.com": "Teams", "teams.live.com": "Teams" };
  var STALE_DAYS = 3;                       // 「PR 滞留」とみなす日数
  var THEME_KEY = "dashboard-theme";

  /* ---------- 小さな道具 ---------- */
  function safeUrl(u) {
    try {
      var x = new URL(u, location.href);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : null;
    } catch (e) { return null; }
  }
  function h(tag, props) {
    var el = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "href") { var u = safeUrl(v); if (u) el.setAttribute("href", u); }
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function svg(tag, props) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(props || {}).forEach(function (k) { el.setAttribute(k, props[k]); });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function ext(href, text, cls) {
    return h("a", { href: href, class: cls, target: "_blank", rel: "noopener noreferrer", text: text });
  }
  function ymd(s) { var p = String(s).slice(0, 10).split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function md(t) { var d = new Date(t); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); }
  function wd(t) { return WD[new Date(t).getUTCDay()]; }
  function diff(a, b) { return Math.round((a - b) / DAY); }
  function count(arr, fn) { return arr.filter(fn).length; }
  var MOBILE = window.matchMedia ? window.matchMedia("(max-width: 560px)") : { matches: false };
  function onMobileChange(fn) { if (MOBILE.addEventListener) MOBILE.addEventListener("change", fn); else if (MOBILE.addListener) MOBILE.addListener(fn); }
  // 横にスワイプする列の下に、今どのカードを見ているかのドットを付ける（スマホ幅のみ表示）
  function dotsFor(scroller) {
    var cards = Array.prototype.slice.call(scroller.children);
    var dots = h("div", { class: "dots", "aria-hidden": "true" }, cards.map(function () { return h("i"); }));
    function sync() {
      if (!scroller.clientWidth) return;
      var sr = scroller.getBoundingClientRect(), best = 0, bd = Infinity;
      cards.forEach(function (c, i) { var d = Math.abs(c.getBoundingClientRect().left - (sr.left + 16)); if (d < bd) { bd = d; best = i; } });
      if (scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2) best = cards.length - 1;
      Array.prototype.forEach.call(dots.children, function (d, i) { d.className = i === best ? "on" : ""; });
    }
    scroller.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    setTimeout(sync, 0);
    return dots;
  }
  function nw(text) { return h("span", { class: "nw", text: text }); }   // 途中で改行させない（日付・「0 / 4 件」など）
  function pill(text, cls, hollow) { return h("span", { class: "pill " + cls + (hollow ? " hollow" : ""), text: text }); }
  function section(id, title, src) {
    var root = document.getElementById(id);
    root.textContent = "";
    root.append(h("header", {}, h("h2", { id: "h-" + id, text: title }), src ? h("span", { class: "src", text: "出どころ: " + src }) : null));
    return root;
  }

  /* ---------- 状態の定義（意味は一か所に集める） ---------- */
  // Issue: 未完了 / 完了 / 対象外（実施しないと決めて閉じたもの。GitHub の state_reason = not_planned）
  function issueKind(i) { return i.state === "open" ? "open" : i.state_reason === "not_planned" ? "skipped" : "done"; }
  // PR: 下書き / マージ前（確認中・修正中を含む） / マージ済み / 却下（マージせずに閉じたもの）
  function prKind(p) { return p.merged ? "merged" : p.state === "open" ? (p.draft ? "draft" : "open") : "rejected"; }
  // 完了率 = 完了 ÷（全体 − 対象外）
  function tally(issues) {
    var o = { open: 0, done: 0, skipped: 0 };
    issues.forEach(function (i) { o[issueKind(i)]++; });
    o.target = o.open + o.done;
    o.pct = o.target ? Math.round(o.done / o.target * 100) : 0;
    return o;
  }

  function load(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " を読めません（" + r.status + "）");
      return r.json();
    });
  }

  Promise.all([
    load("data/site.json"),
    load("data/schedule.json"),
    load("data/links.json"),
    load("data/github.json").catch(function () { return load("data/github.sample.json"); })
  ]).then(function (r) { render({ site: r[0], schedule: r[1], links: r[2], gh: r[3] }); })
    .catch(function (e) {
      document.getElementById("app").append(h("div", { class: "card error" },
        h("b", { text: "データを読み込めませんでした" }), h("p", { text: String(e.message || e) }),
        h("p", { class: "small", text: "ファイルを直接開かず、Pages の URL か、ローカルサーバー経由で開いてください。" })));
    });

  /* ---------- 全体 ---------- */
  function render(d) {
    // 項目が無くても動くように、空の配列を補う
    d.schedule.events = d.schedule.events || [];
    d.schedule.tasks = d.schedule.tasks || [];
    d.links.links = d.links.links || [];
    ["milestones", "issues", "pulls"].forEach(function (k) { d.gh[k] = d.gh[k] || []; });
    var asOf = ymd(d.gh.generatedAt);
    var members = d.site.team.members.filter(function (m) { return m.github; });
    var byId = {};
    members.forEach(function (m) { byId[m.github] = m; });
    var nick = function (id) { return byId[id] ? byId[id].name : id; };
    var ctx = { d: d, asOf: asOf, members: members, byId: byId, nick: nick };

    document.title = d.site.project.name + " 進捗";
    renderBanner(ctx);
    renderTop(ctx);
    renderSummary(ctx);
    renderAttention(ctx);
    renderNav(ctx);
    renderSchedule(ctx);
    renderGantt(ctx);
    renderProgress(ctx);
    renderWork(ctx);
    renderMembers(ctx);
    renderLinks(ctx);
    renderFooter(ctx);
  }

  function taskState(t, asOf) {
    if (t.status === "done") return "done";
    if (ymd(t.end) < asOf) return "late";
    return t.status === "doing" ? "doing" : "todo";
  }

  function renderBanner(c) {
    var names = [];
    if (c.d.site.sample) names.push("チーム情報");
    if (c.d.schedule.sample) names.push("日程・WBS");
    if (c.d.links.sample) names.push("資料リンク");
    if (c.d.gh.sample) names.push("Issue・PR");
    var el = document.getElementById("banner");
    if (!names.length) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = "";
    el.append(h("div", { class: "wrap" },
      h("strong", { text: "サンプル表示" }),
      h("span", { text: "次の項目は、チームの情報を反映する前の仮データです: " + names.join("、") })));
  }

  /* ---------- 表示モード（システム / ライト / ダーク） ---------- */
  function themeToggle() {
    var root = document.documentElement;
    var opts = [["system", "システム"], ["light", "ライト"], ["dark", "ダーク"]];
    var seg = h("div", { class: "seg theme", role: "group", "aria-label": "表示モード" });
    function current() { var a = root.getAttribute("data-theme"); return a === "light" || a === "dark" ? a : "system"; }
    function sync() {
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === current())); });
    }
    function apply(v) {
      if (v === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", v);
      try { if (v === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); } catch (e) { /* 保存できなくても表示は切り替わる */ }
      sync();
    }
    opts.forEach(function (o) { seg.append(h("button", { type: "button", "data-v": o[0], text: o[1], onclick: function () { apply(o[0]); } })); });
    sync();
    return seg;
  }

  function renderTop(c) {
    var s = c.d.site, gh = c.d.gh;
    var top = document.getElementById("top");
    top.textContent = "";
    // DOM の append に null を渡すと、「null」という文字が出る。null を読み飛ばす append（上の道具）を使う
    append(top, [h("div", { class: "top-row" },
      h("div", { class: "top-main" },
        h("h1", { text: s.project.name }),
        h("div", { class: "meta" },
          h("span", {}, "チーム: ", h("b", { text: s.team.name })),
          h("span", {}, "メンバー: ", h("b", { text: c.members.length + " 人" })),
          h("span", {}, "リポジトリ: ", ext("https://github.com/" + gh.repo, gh.repo)),
          h("span", { title: "Issue・PR の数や「あと N 日」は、この日時のデータで数えています" }, "データ取得: ",
            h("b", { text: md(c.asOf) + "（" + wd(c.asOf) + "）" + gh.generatedAt.slice(11, 16) })))),
      themeToggle()),
      purposeBlock(s.project.purpose)]);
  }

  // スマホ幅では目的の文を畳む（デスクトップ幅では常に開く）
  function purposeBlock(text) {
    if (!text) return null;
    var d = h("details", { class: "purpose-d" }, h("summary", { text: "プロジェクトの目的" }), h("p", { class: "purpose", text: text }));
    function sync() { d.open = !MOBILE.matches; }
    sync(); onMobileChange(sync);
    return d;
  }

  /* ---------- 会議リンク ---------- */
  function meetInfo(u) {
    try {
      var x = new URL(u);
      if (x.protocol !== "https:") return null;
      var host = x.hostname.toLowerCase(), name = MEET_HOSTS[host];
      if (!name && /\.zoom\.us$/.test(host)) name = "Zoom";
      return name ? { url: x.href, name: name } : null;
    } catch (e) { return null; }
  }
  function todayLocal() { var n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); }
  function joinButton(ev) {
    var m = ev.meet && meetInfo(ev.meet);
    if (!m) return null;
    var live = ymd(ev.date) === todayLocal();
    return h("a", { class: "btn" + (live ? " primary" : ""), href: m.url, target: "_blank", rel: "noopener noreferrer",
      title: "新しいタブで会議を開きます", text: (live ? "今すぐ " : "") + m.name + " に参加" });
  }

  /* ---------- 要約 ---------- */
  function stalePulls(c) {
    return c.d.gh.pulls.filter(function (p) { return prKind(p) === "open" && diff(c.asOf, ymd(p.created_at)) >= STALE_DAYS; });
  }

  function renderSummary(c) {
    var gh = c.d.gh, asOf = c.asOf;
    var next = c.d.schedule.events.filter(function (e) { return ymd(e.date) >= asOf; })
      .sort(function (a, b) { return ymd(a.date) - ymd(b.date); })[0];
    var t = tally(gh.issues);
    var beforeMerge = gh.pulls.filter(function (p) { var k = prKind(p); return k === "open" || k === "draft"; });
    var unassigned = count(gh.issues, function (i) { return issueKind(i) === "open" && !i.assignees.length; });
    var attn = attentionItems(c).length;

    var root = document.getElementById("summary");
    root.textContent = "";
    var box = h("div", { class: "card summary" });
    function cell(k, v, unit, sub, extra) {
      return h("div", {}, h("div", { class: "k", text: k }),
        h("div", { class: "v" }, v, unit ? h("small", { text: unit }) : null),
        sub ? h("div", { class: "s", text: sub }) : null, extra);
    }
    var days = next ? diff(ymd(next.date), asOf) : null;
    box.append(
      cell("次の予定", next ? "あと " + days : "なし", next ? "日" : "",
        next ? md(ymd(next.date)) + (next.time ? " " + next.time.slice(0, 5) : "") + " " + next.title : "予定が登録されていません",
        next ? joinButton(next) : null),
      cell("Issue の完了率", t.pct, "%", t.done + " / " + t.target + " 件が完了" + (t.skipped ? "（対象外 " + t.skipped + " 件を除く）" : ""),
        h("div", { class: "bar", role: "progressbar", "aria-valuenow": t.pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Issue の完了率" }, h("i", { style: "width:" + t.pct + "%" }))),
      cell("未完了の Issue", t.open, "件", "うち担当者なし " + unassigned + " 件"),
      cell("マージ前の PR", beforeMerge.length, "件", "うち " + STALE_DAYS + " 日以上 " + stalePulls(c).length + " 件"),
      cell("要注意", attn, "件", attn ? "下の一覧を確認" : "なし"));
    root.append(box);
  }

  /* ---------- ページ内ナビゲーション ---------- */
  var NAV_ITEMS = [["summary", "概要"], ["attention", "要注意"], ["schedule", "予定"], ["gantt", "WBS"], ["progress", "進み具合"], ["work", "Issue・PR"], ["members", "メンバー"], ["links", "資料"]];
  function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  function renderNav(c) {
    var nav = document.getElementById("nav"), ul = document.getElementById("nav-list");
    var attn = attentionItems(c).length;
    ul.textContent = "";
    var links = {};
    NAV_ITEMS.forEach(function (it) {
      var a = h("a", { href: "#" + it[0], "data-id": it[0] }, it[1]);
      if (it[0] === "attention" && attn) {
        a.append(h("span", { class: "badge", text: String(attn) }));
        a.setAttribute("aria-label", it[1] + " " + attn + " 件");
      }
      a.addEventListener("click", function (e) {
        e.preventDefault();
        forced = it[0];                       // 下端で止まっても、押した項目を選択中のままにする
        clearTimeout(forcedTimer);
        forcedTimer = setTimeout(function () { forced = null; update(); }, 900);
        update();
        var t = document.getElementById(it[0]);
        var y = it[0] === "summary" ? 0 : t.getBoundingClientRect().top + window.scrollY - nav.offsetHeight - 8;
        window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? "auto" : "smooth" });
        t.setAttribute("tabindex", "-1");
        t.focus({ preventScroll: true });
      });
      links[it[0]] = a;
      ul.append(h("li", {}, a));
    });

    var topBtn = h("button", { type: "button", class: "to-top", hidden: true, "aria-label": "ページの先頭へ戻る", text: "↑ 上へ",
      onclick: function () { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); } });
    document.body.append(topBtn);

    var current = null, ticking = false, forced = null, forcedTimer = null;
    function update() {
      ticking = false;
      var navH = nav.offsetHeight;
      document.documentElement.style.setProperty("--nav-h", navH + "px");
      var line = navH + 24, cur = NAV_ITEMS[0][0];
      NAV_ITEMS.forEach(function (it) { if (document.getElementById(it[0]).getBoundingClientRect().top <= line) cur = it[0]; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = NAV_ITEMS[NAV_ITEMS.length - 1][0];
      if (forced) cur = forced;
      if (cur !== current) {
        current = cur;
        Object.keys(links).forEach(function (id) { if (id === cur) links[id].setAttribute("aria-current", "true"); else links[id].removeAttribute("aria-current"); });
        var a = links[cur];
        ul.scrollTo({ left: a.offsetLeft - (ul.clientWidth - a.offsetWidth) / 2, behavior: reducedMotion() ? "auto" : "smooth" });
      }
      topBtn.hidden = window.scrollY < window.innerHeight * 0.8;
    }
    function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  /* ---------- 要注意 ---------- */
  function attentionItems(c) {
    var gh = c.d.gh, asOf = c.asOf, items = [];
    gh.issues.filter(function (i) { return issueKind(i) === "open" && !i.assignees.length; }).forEach(function (i) {
      items.push({ kind: "担当者なし", cls: "st-late", text: "#" + i.number + " " + i.title, url: i.url, who: "担当者を決めてください" });
    });
    c.d.schedule.tasks.forEach(function (t) {
      if (taskState(t, asOf) === "late") {
        items.push({ kind: "遅れ", cls: "st-late", text: t.title + "（予定終了日 " + md(ymd(t.end)) + "）", url: null,
          who: diff(asOf, ymd(t.end)) + " 日超過 ・ 担当 " + c.nick(t.assignee) });
      }
    });
    stalePulls(c).forEach(function (p) {
      items.push({ kind: "PR 滞留", cls: "st-todo", text: "#" + p.number + " " + p.title, url: p.url,
        who: "作成から " + diff(asOf, ymd(p.created_at)) + " 日、マージされていません ・ 作成 " + c.nick(p.author) });
    });
    return items;
  }

  function renderAttention(c) {
    var root = section("attention", "要注意", "Issue・PR（GitHub）、WBS（schedule）");
    var items = attentionItems(c);
    var box = h("div", { class: "card attn" });
    if (!items.length) box.append(h("p", { class: "none", text: "要注意の項目はありません。" }));
    else box.append(h("ul", {}, items.map(function (it) {
      return h("li", {},
        h("span", { class: "kind" }, pill(it.kind, it.cls)),
        h("span", { class: "body" }, it.url ? ext(it.url, it.text) : it.text),
        h("span", { class: "who", text: it.who }));
    })));
    root.append(box);
  }

  /* ---------- 予定（一覧・カレンダー・ホバー表示） ---------- */
  var pop = null, popTimer = null, popAnchor = null;
  function hidePop() { clearTimeout(popTimer); if (pop) pop.hidden = true; popAnchor = null; }
  function hideSoon() { clearTimeout(popTimer); popTimer = setTimeout(hidePop, 200); }
  function ensurePop() {
    if (pop) return pop;
    pop = h("div", { class: "pop", role: "dialog", "aria-label": "予定の詳細", hidden: true });
    pop.addEventListener("mouseenter", function () { clearTimeout(popTimer); });
    pop.addEventListener("mouseleave", hideSoon);
    document.body.append(pop);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hidePop(); });
    document.addEventListener("click", function (e) {
      if (pop.hidden) return;
      if (pop.contains(e.target) || (popAnchor && popAnchor.contains(e.target))) return;
      hidePop();
    });
    return pop;
  }
  function showPop(anchor, evs, t) {
    clearTimeout(popTimer);
    ensurePop();
    popAnchor = anchor;
    pop.textContent = "";
    evs.forEach(function (ev) {
      pop.append(h("div", { class: "pop-item" },
        h("b", { text: ev.title }),
        h("div", { class: "small muted", text: md(t) + "（" + wd(t) + "） " + (ev.time || "終日") }),
        h("div", { class: "pop-row" }, pill(EVENT_LABEL[ev.type] || EVENT_LABEL.other, "st-doing"), joinButton(ev)),
        ev.note ? h("p", { class: "small", text: ev.note }) : null));
    });
    pop.hidden = false;
    var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth;
    var left = window.scrollX + r.left + r.width / 2 - pw / 2;
    left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - 8));
    pop.style.left = left + "px";
    pop.style.top = (window.scrollY + r.bottom + 6) + "px";
  }

  function renderSchedule(c) {
    var root = section("schedule", "発表・提出の予定", "schedule");
    var events = c.d.schedule.events.slice().sort(function (a, b) { return ymd(a.date) - ymd(b.date); });
    var asOf = c.asOf;
    var wrap = h("div", { class: "cal" });

    var list = h("ul", { class: "events" });
    events.forEach(function (e) {
      var t = ymd(e.date), n = diff(t, asOf), join = joinButton(e);
      list.append(h("li", {},
        h("div", { class: "d" }, md(t), h("small", { text: "（" + wd(t) + "）" })),
        h("div", { class: "t" }, h("b", { text: e.title }),
          h("div", { class: "row" }, e.time ? h("span", { class: "small", text: e.time }) : null,
            pill(EVENT_LABEL[e.type] || EVENT_LABEL.other, "st-doing"),
            h("span", { class: n < 0 ? "muted small" : "small", text: n < 0 ? "終了" : n === 0 ? "今日" : "あと " + n + " 日" })),
          join ? h("div", { class: "row" }, join) : null)));
    });
    wrap.append(h("div", { class: "card events" }, h("h3", { text: "予定の一覧" }), events.length ? list : h("p", { class: "muted small", text: "予定は、まだ登録されていません。dashboard/data/schedule.yml の events に追加してください。" })));

    var evMap = {};
    events.forEach(function (e) { var t = ymd(e.date); (evMap[t] = evMap[t] || []).push(e); });
    var first = new Date(asOf), last = new Date(ymd(events.length ? events[events.length - 1].date : asOf));
    var y = first.getUTCFullYear(), m = first.getUTCMonth();
    var months = 0, box = h("div", { class: "cal-months", "aria-label": "月ごとのカレンダー（横にスワイプ）" });
    while ((y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth())) && months < 3) {
      box.append(monthGrid(y, m, asOf, evMap));
      m++; if (m > 11) { m = 0; y++; } months++;
    }
    wrap.append(box, dotsFor(box));
    root.append(wrap);
  }

  function monthGrid(y, m, asOf, evMap) {
    var firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    var days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var g = h("div", { class: "grid7", "aria-label": y + "年" + (m + 1) + "月" });
    WD.forEach(function (w) { g.append(h("div", { class: "h", text: w })); });
    for (var i = 0; i < firstDow; i++) g.append(h("div", { class: "c off", text: "0" }));
    for (var d = 1; d <= days; d++) {
      (function (t) {
        var dow = new Date(t).getUTCDay(), evs = evMap[t];
        var cls = "c" + (dow === 0 ? " sun" : "") + (t === asOf ? " today" : "") + (evs ? " ev" : "");
        var cell = h("div", { class: cls, text: String(new Date(t).getUTCDate()) });
        if (evs) {
          cell.setAttribute("tabindex", "0");
          cell.setAttribute("role", "button");
          cell.setAttribute("aria-label", md(t) + " " + evs.map(function (e) { return e.title; }).join("、"));
          cell.addEventListener("mouseenter", function () { showPop(cell, evs, t); });
          cell.addEventListener("mouseleave", hideSoon);
          cell.addEventListener("focus", function () { showPop(cell, evs, t); });
          cell.addEventListener("click", function () { showPop(cell, evs, t); });
        }
        g.append(cell);
      })(Date.UTC(y, m, d));
    }
    return h("div", { class: "card month" }, h("h3", { text: y + "年" + (m + 1) + "月" }), g,
      h("div", { class: "legend" }, m === new Date(asOf).getUTCMonth() ? h("span", { text: "枠: データ取得日" }) : null,
        h("span", { text: "青い日: 予定あり（触れると詳細）" })));
  }

  /* ---------- ガントチャート ---------- */
  function renderGantt(c) {
    var root = section("gantt", "WBS（ガントチャート）", "schedule（担当・期間）、マイルストーンの期限は GitHub");
    var tasks = c.d.schedule.tasks, asOf = c.asOf;
    if (!tasks.length) {
      root.append(h("div", { class: "card panel" }, h("p", { class: "muted", text: "WBS のタスクは、まだ登録されていません。dashboard/data/schedule.yml の tasks に追加してください。" })));
      return;
    }
    var msMeta = {};
    c.d.gh.milestones.forEach(function (m) { msMeta[m.title] = m; });

    var min = Math.min.apply(null, tasks.map(function (t) { return ymd(t.start); }).concat([asOf]));
    var max = Math.max.apply(null, tasks.map(function (t) { return ymd(t.end); })
      .concat(c.d.gh.milestones.filter(function (m) { return m.due_on; }).map(function (m) { return ymd(m.due_on); })).concat([asOf])); // 取得日が最後の期限より後でも、線が範囲に入る
    var rs = min - ((new Date(min).getUTCDay() + 6) % 7) * DAY;           // その週の月曜
    var re = max + ((7 - new Date(max).getUTCDay()) % 7) * DAY;            // その週の日曜
    var total = diff(re, rs) + 1, weeks = total / 7;
    var pos = function (t) { return (diff(t, rs) / total) * 100; };
    var todayP = (pos(asOf) + 0.5 / total * 100) / 100;

    var order = [];
    tasks.forEach(function (t) { if (order.indexOf(t.milestone) < 0) order.push(t.milestone); });
    order.sort(function (a, b) {
      var da = msMeta[a] && msMeta[a].due_on ? ymd(msMeta[a].due_on) : Infinity, db = msMeta[b] && msMeta[b].due_on ? ymd(msMeta[b].due_on) : Infinity;
      return da - db;
    });

    var card = h("div", { class: "card" });
    card.append(h("div", { class: "legend-row" },
      h("span", {}, h("i", { class: "sw done" }), "完了"), h("span", {}, h("i", { class: "sw doing" }), "進行中"),
      h("span", {}, h("i", { class: "sw todo" }), "未着手"), h("span", {}, h("i", { class: "sw late" }), "遅れ（予定終了日を過ぎても未完了）"),
      h("span", {}, h("i", { class: "dia" }), "マイルストーンの期限"), h("span", {}, h("i", { class: "tl" }), "データ取得日"),
      h("span", { class: "muted", text: "タスク名は Issue へのリンクです" })));

    var scroll = h("div", { class: "gantt-scroll" });
    var g = h("div", { class: "gantt", style: "--weeks:" + weeks + ";--p:" + todayP });
    var body = h("div", { class: "g-body" });

    var axis = h("div", { class: "g-row g-axis" }, h("div", { class: "g-label", text: "週の始まり（月曜）" }));
    var axTrack = h("div", { class: "g-track" });
    for (var w = 0; w < weeks; w++) axTrack.append(h("span", { class: "wk", style: "left:" + pos(rs + w * 7 * DAY) + "%", text: md(rs + w * 7 * DAY) }));
    axTrack.append(h("span", { class: "g-tag", style: "--p:" + todayP, text: "取得日 " + md(asOf) }));
    axis.append(axTrack);
    body.append(axis);

    order.forEach(function (name) {
      var meta = msMeta[name];
      var st0 = tally(c.d.gh.issues.filter(function (i) { return i.milestone === name; }));
      var head = h("div", { class: "g-row g-ms" },
        h("div", { class: "g-label" }, h("b", {}, meta ? ext(meta.url, name) : name),
          meta ? h("span", { class: "small muted" }, meta.due_on ? [nw("期限 " + md(ymd(meta.due_on))), " ・ "] : null, nw(st0.done + " / " + st0.target + " 件完了"))
            : h("span", { class: "small muted", text: "GitHub にマイルストーンがありません" })));
      var tr = h("div", { class: "g-track" });
      if (meta && meta.due_on) {
        var px = pos(ymd(meta.due_on)) + 0.5 / total * 100;
        tr.append(h("span", { class: "dia-mark", style: "left:" + px + "%" }));
        var txt = h("span", { class: "dia-txt", text: "期限 " + md(ymd(meta.due_on)) });
        if (px > 82) txt.style.right = (100 - px + 1.2) + "%"; else txt.style.left = (px + 1.2) + "%";
        tr.append(txt);
      }
      head.append(tr);
      body.append(head);

      tasks.filter(function (t) { return t.milestone === name; }).forEach(function (t) {
        var st = taskState(t, asOf);
        var l = pos(ymd(t.start)), wdt = ((diff(ymd(t.end), ymd(t.start)) + 1) / total) * 100;
        var tip = t.title + "\n" + md(ymd(t.start)) + " 〜 " + md(ymd(t.end)) + " ・ " + c.nick(t.assignee) + " ・ " + STATE_LABEL[st] +
          (t.depends_on && t.depends_on.length ? "\n先に必要: " + t.depends_on.join(", ") : "");
        var row = h("div", { class: "g-row" },
          h("div", { class: "g-label" }, pill(STATE_LABEL[st], "st-" + st, st === "todo"),
            h("span", { class: "title" }, t.issue ? ext(issueUrl(c, t.issue), t.title) : t.title),
            h("span", { class: "who", text: c.nick(t.assignee) })));
        var track = h("div", { class: "g-track" });
        track.append(h("span", { class: "bar-task " + st, style: "left:" + l + "%;width:" + wdt + "%", title: tip }));
        var rng = h("span", { class: "rng", text: md(ymd(t.start)) + "〜" + md(ymd(t.end)) });
        if (l + wdt > 84) rng.style.right = (100 - l + 0.8) + "%"; else rng.style.left = (l + wdt + 0.8) + "%";
        track.append(rng);
        row.append(track);
        body.append(row);
      });
    });

    body.append(h("div", { class: "g-grid" }), h("div", { class: "g-today" }));
    g.append(body);
    scroll.append(g);
    card.append(scroll);
    root.append(card);
  }

  function issueUrl(c, n) {
    var i = c.d.gh.issues.filter(function (x) { return x.number === n; })[0];
    return i ? i.url : "#";
  }

  /* ---------- マイルストーンと推移 ---------- */
  function renderProgress(c) {
    var root = section("progress", "進み具合", "マイルストーン・Issue（GitHub）");
    var two = h("div", { class: "two" });

    var ms = h("ul", { class: "ms" });
    c.d.gh.milestones.slice().sort(function (a, b) { return (a.due_on ? ymd(a.due_on) : Infinity) - (b.due_on ? ymd(b.due_on) : Infinity); }).forEach(function (m) {
      var t = tally(c.d.gh.issues.filter(function (i) { return i.milestone === m.title; }));
      var left = m.due_on ? diff(ymd(m.due_on), c.asOf) : null;
      var done = t.target > 0 && t.open === 0;
      // 状態の札は「完了」と「期限超過」だけ。「未着手」などは GitHub のデータから判断できないので出さない。
      var st = done ? pill("完了", "st-done") : left < 0 ? pill("期限超過", "st-late") : null;
      ms.append(h("li", {},
        h("div", { class: "r1" }, h("b", {}, ext(m.url, m.title)),
          h("span", { class: "small muted", text: m.due_on ? "期限 " + md(ymd(m.due_on)) + "（" + wd(ymd(m.due_on)) + "）" + (left >= 0 ? " ・ 期限まであと " + left + " 日" : "") : "期限なし" })),
        h("div", { class: "r2" },
          h("div", { class: "bar", role: "progressbar", "aria-valuenow": t.pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": m.title + " の完了率" }, h("i", { style: "width:" + t.pct + "%" })),
          h("span", { class: "cnt", text: t.done + " / " + t.target + " 件完了（" + t.pct + "%）" })),
        st || t.skipped ? h("div", { class: "r3" }, st, t.skipped ? h("span", { class: "small muted", text: "対象外 " + t.skipped + " 件は除く" }) : null) : null));
    });
    if (!c.d.gh.milestones.length) ms.append(h("li", {}, h("span", { class: "muted", text: "GitHub に、マイルストーンがまだありません。" })));
    two.append(h("div", { class: "card panel" }, h("h3", { text: "マイルストーン" }), h("p", { class: "sub", text: "完了率 = 完了した Issue ÷（全 Issue − 対象外）" }), ms));
    two.append(trendPanel(c));
    root.append(two);
  }

  /* 単調な滑らか曲線（累計は減らないので、行き過ぎ・戻りが出ない補間を使う） */
  function smoothPath(xs, ys) {
    var n = xs.length, i, dx = xs[1] - xs[0], m = [], t = [];
    for (i = 0; i < n - 1; i++) m.push((ys[i + 1] - ys[i]) / dx);
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : 2 * m[i - 1] * m[i] / (m[i - 1] + m[i]);
    var s = "M" + xs[0] + "," + ys[0];
    for (i = 0; i < n - 1; i++) {
      s += " C" + (xs[i] + dx / 3) + "," + (ys[i] + t[i] * dx / 3) + " " + (xs[i + 1] - dx / 3) + "," + (ys[i + 1] - t[i + 1] * dx / 3) + " " + xs[i + 1] + "," + ys[i + 1];
    }
    return s;
  }

  function trendPanel(c) {
    var issues = c.d.gh.issues, W = 640, H = 236, L = 34, R = 78, T = 14, B = 30;
    var iw = W - L - R, ih = H - T - B;
    if (!issues.length) {
      return h("div", { class: "card panel" }, h("h3", { text: "Issue の起票と完了（累計）" }), h("p", { class: "muted", text: "Issue が、まだありません。" }));
    }
    var start = Math.min.apply(null, issues.map(function (i) { return ymd(i.created_at); })) - DAY;
    var end = c.asOf;
    if (start >= end) start = end - DAY;   // 1 日分は、必ず取る（曲線を描くのに 2 点が要る）
    var days = diff(end, start);
    var opened = [], done = [], skipped = [];
    for (var d = 0; d <= days; d++) {
      var t = start + d * DAY;
      opened.push(count(issues, function (i) { return ymd(i.created_at) <= t; }));
      done.push(count(issues, function (i) { return issueKind(i) === "done" && ymd(i.closed_at) <= t; }));
      skipped.push(count(issues, function (i) { return issueKind(i) === "skipped" && ymd(i.closed_at) <= t; }));
    }
    var maxV = Math.max.apply(null, opened), step = 1;
    [1, 2, 5, 10, 20, 50, 100].some(function (s) { step = s; return maxV / s <= 5; });
    var ymax = Math.ceil(maxV / step) * step;
    var X = function (i) { return L + iw * i / days; };
    var Y = function (v) { return T + ih * (1 - v / ymax); };
    var path = function (arr) {
      return smoothPath(arr.map(function (_, i) { return X(i); }), arr.map(function (v) { return Y(v); }));
    };

    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Issue の起票数と完了数の累計。起票 " + opened[days] + " 件、完了 " + done[days] + " 件。" });
    for (var v = 0; v <= ymax; v += step) {
      s.append(svg("line", { class: "gl", x1: L, x2: W - R, y1: Y(v), y2: Y(v) }),
        svg("text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end" }, String(v)));
    }
    var ticks = [];
    for (var i = 0; i <= days; i++) if (new Date(start + i * DAY).getUTCDay() === 1) ticks.push(i);
    ticks.forEach(function (i) { s.append(svg("text", { x: X(i), y: H - 8, "text-anchor": "middle" }, md(start + i * DAY))); });
    s.append(svg("path", { class: "ln l1", d: path(opened) }), svg("path", { class: "ln l2", d: path(done) }));
    s.append(svg("circle", { class: "dot1", cx: X(days), cy: Y(opened[days]), r: 4 }), svg("circle", { class: "dot2", cx: X(days), cy: Y(done[days]), r: 4 }));
    s.append(svg("text", { class: "endl", x: X(days) + 10, y: Y(opened[days]) + 4 }, "起票 " + opened[days]),
      svg("text", { class: "endl", x: X(days) + 10, y: Y(done[days]) + 4 }, "完了 " + done[days]));

    var guide = svg("line", { class: "guide", y1: T, y2: T + ih, x1: 0, x2: 0, visibility: "hidden" });
    var g1 = svg("circle", { class: "dot1", r: 4, visibility: "hidden" }), g2 = svg("circle", { class: "dot2", r: 4, visibility: "hidden" });
    var hit = svg("rect", { x: L, y: T, width: iw, height: ih, fill: "transparent" });
    s.append(guide, g1, g2, hit);

    var tip = h("div", { class: "tip", hidden: true });
    var box = h("div", { class: "chart" }, s, tip);
    function show(ev) {
      var r = s.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width * W;
      var i = Math.max(0, Math.min(days, Math.round((x - L) / iw * days)));
      var t = start + i * DAY;
      guide.setAttribute("x1", X(i)); guide.setAttribute("x2", X(i));
      g1.setAttribute("cx", X(i)); g1.setAttribute("cy", Y(opened[i]));
      g2.setAttribute("cx", X(i)); g2.setAttribute("cy", Y(done[i]));
      [guide, g1, g2].forEach(function (e) { e.setAttribute("visibility", "visible"); });
      tip.textContent = "";
      tip.append(h("b", { text: md(t) + "（" + wd(t) + "）" }),
        h("div", {}, h("i", { class: "sw2", style: "background:var(--s1)" }), "起票（累計） " + opened[i]),
        h("div", {}, h("i", { class: "sw2", style: "background:var(--s2)" }), "完了（累計） " + done[i]),
        h("div", { class: "muted", text: "未完了 " + (opened[i] - done[i] - skipped[i]) + (skipped[i] ? " ・ 対象外 " + skipped[i] : "") }));
      tip.hidden = false;
      tip.style.left = (X(i) / W * 100) + "%";
      tip.classList.toggle("flip", X(i) / W > 0.55);
    }
    function hide() { tip.hidden = true; [guide, g1, g2].forEach(function (e) { e.setAttribute("visibility", "hidden"); }); }
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hide);

    var rows = ticks.map(function (i) { return [i, start + i * DAY]; });
    if (!ticks.length || ticks[ticks.length - 1] !== days) rows.push([days, end]);
    var table = h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "日付" }), h("th", { text: "起票（累計）" }), h("th", { text: "完了（累計）" }), h("th", { text: "未完了" }))),
      h("tbody", {}, rows.map(function (r) {
        return h("tr", {}, h("td", { text: md(r[1]) }), h("td", { text: String(opened[r[0]]) }), h("td", { text: String(done[r[0]]) }),
          h("td", { text: String(opened[r[0]] - done[r[0]] - skipped[r[0]]) }));
      })));

    return h("div", { class: "card panel" }, h("h3", { text: "Issue の起票と完了（累計）" }),
      h("p", { class: "sub", text: "2 本の線の間が、未完了の Issue の数です（対象外は除く）" }), box,
      h("div", { class: "keys" }, h("span", {}, h("i", { class: "sw2", style: "background:var(--s1)" }), "起票"), h("span", {}, h("i", { class: "sw2", style: "background:var(--s2)" }), "完了")),
      h("details", { class: "tbl" }, h("summary", { text: "表で見る" }), table));
  }

  /* ---------- Issue / PR（メンバーと状態で絞り込み） ---------- */
  function renderWork(c) {
    var root = section("work", "Issue と PR", "GitHub");
    var gh = c.d.gh, repo = "https://github.com/" + c.d.gh.repo;
    var filter = { member: null };
    var panels = [];

    var bar = h("div", { class: "filterbar" }, h("span", { class: "lbl", text: "メンバー" }));
    var chips = h("div", { class: "seg", role: "group", "aria-label": "メンバーで絞り込み" });
    var opts = [[null, "全員"]].concat(c.members.map(function (m) { return [m.github, m.name]; }));
    opts.forEach(function (o) {
      chips.append(h("button", { type: "button", "data-m": o[0] || "", text: o[1], onclick: function () { filter.member = o[0]; redraw(); } }));
    });
    bar.append(chips, h("span", { class: "small muted", text: "Issue は担当者、PR は作成者またはレビュアーで絞り込みます" }));

    function redraw() {
      Array.prototype.forEach.call(chips.children, function (b) { b.setAttribute("aria-pressed", String((b.dataset.m || null) === filter.member)); });
      panels.forEach(function (p) { p.draw(); });
    }

    var issuePanel = listPanel(c, {
      name: "Issue", items: gh.issues, kindOf: issueKind, labels: ISSUE_LABEL, openKeys: ["open"],
      states: [["all", "すべて"], ["open", "未完了"], ["done", "完了"], ["skipped", "対象外"]],
      memberMatch: function (i, id) { return i.assignees.indexOf(id) >= 0; },
      rank: { open: 0, done: 1, skipped: 2 }, row: issueRow, allUrl: repo + "/issues", openName: "未完了", initial: "open"
    }, filter);
    var prPanel = listPanel(c, {
      name: "PR", items: gh.pulls, kindOf: prKind, labels: PR_LABEL, openKeys: ["open", "draft"],
      states: [["all", "すべて"], ["before", "マージ前"], ["merged", "マージ済み"], ["rejected", "却下"]],
      memberMatch: function (p, id) { return p.author === id || p.reviewers.indexOf(id) >= 0; },
      rank: { open: 0, draft: 0, merged: 1, rejected: 2 }, row: prRow, allUrl: repo + "/pulls", openName: "マージ前", initial: "before"
    }, filter);
    panels.push(issuePanel, prPanel);

    root.append(bar, h("div", { class: "two" }, issuePanel.el, prPanel.el));
    redraw();
  }

  function listPanel(c, o, filter) {
    var LIMIT = 8, SHORT = 5, cur = o.initial, expanded = false;
    var limit = function () { return MOBILE.matches && !expanded ? SHORT : LIMIT; };
    var title = h("h3"), ul = h("ul", { class: "list" }), more = h("p", { class: "more" });
    var seg = h("div", { class: "seg", role: "group", "aria-label": o.name + "の状態で絞り込み" });
    function stateMatch(x, f) {
      var k = o.kindOf(x);
      if (f === "all") return true;
      if (f === "before") return k === "open" || k === "draft";
      return k === f;
    }
    function draw() {
      var mine = o.items.filter(function (x) { return !filter.member || o.memberMatch(x, filter.member); });
      var shown = mine.filter(function (x) { return stateMatch(x, cur); })
        .sort(function (a, b) { return (o.rank[o.kindOf(a)] - o.rank[o.kindOf(b)]) || b.number - a.number; });
      var openN = count(mine, function (x) { return o.openKeys.indexOf(o.kindOf(x)) >= 0; });
      title.textContent = o.name + "（" + o.openName + " " + openN + " 件 / 全 " + mine.length + " 件）";
      ul.textContent = ""; more.textContent = "";
      if (!shown.length) ul.append(h("li", { class: "empty", text: "該当する " + o.name + " はありません" }));
      shown.slice(0, limit()).forEach(function (x) { ul.append(o.row(c, x)); });
      more.append("最新 " + Math.min(limit(), shown.length) + " 件を表示（該当 " + shown.length + " 件）。 ", ext(o.allUrl, "GitHub で全件を見る"));
      if (MOBILE.matches && !expanded && shown.length > SHORT) {
        more.append(h("button", { type: "button", class: "more-btn", text: "あと " + (Math.min(LIMIT, shown.length) - SHORT) + " 件を表示", onclick: function () { expanded = true; draw(); } }));
      }
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.f === cur)); });
    }
    o.states.forEach(function (f) { seg.append(h("button", { type: "button", "data-f": f[0], text: f[1], onclick: function () { cur = f[0]; expanded = false; draw(); } })); });
    onMobileChange(draw);
    return { el: h("div", { class: "card panel" }, title, seg, ul, more), draw: draw };
  }

  var ISSUE_CLS = { open: "st-open", done: "st-done", skipped: "st-closed" };
  var PR_CLS = { draft: "st-draft", open: "st-open", merged: "st-merged", rejected: "st-closed" };

  function issueRow(c, i) {
    var k = issueKind(i), who = i.assignees.length ? i.assignees.map(c.nick).join("、") : null;
    var when = k === "open" ? "起票 " + md(ymd(i.created_at)) : ISSUE_LABEL[k] + " " + md(ymd(i.closed_at));
    return h("li", {}, h("span", { class: "no", text: "#" + i.number }), h("span", { class: "tt" }, ext(i.url, i.title)),
      pill(ISSUE_LABEL[k], ISSUE_CLS[k], k === "skipped"),
      h("span", { class: "sub" }, who ? h("span", { text: "担当 " + who }) : h("span", { class: k === "open" ? "nobody" : "", text: "担当者なし" }),
        i.milestone ? h("span", { text: i.milestone }) : null, h("span", { text: when })));
  }

  function prRow(c, p) {
    var k = prKind(p);
    var rv = p.reviewers.length ? "レビュー " + p.reviewers.map(c.nick).join("、") : "レビュアー未設定";
    var when = k === "merged" ? "マージ " + md(ymd(p.merged_at)) : k === "rejected" ? "却下 " + md(ymd(p.closed_at)) : "作成 " + md(ymd(p.created_at));
    return h("li", {}, h("span", { class: "no", text: "#" + p.number }), h("span", { class: "tt" }, ext(p.url, p.title)),
      pill(PR_LABEL[k], PR_CLS[k], k === "draft" || k === "rejected"),
      h("span", { class: "sub" }, h("span", { text: "作成 " + c.nick(p.author) }), h("span", { text: rv }), h("span", { text: when })));
  }

  /* ---------- メンバー（カードの中身は同じ位置・同じ高さに揃える） ---------- */
  function renderMembers(c) {
    var root = section("members", "メンバーごとの担当", "チーム情報（project.json）、Issue・PR（GitHub）");
    var gh = c.d.gh, wrap = h("div", { class: "members" });
    if (!c.members.length) {
      root.append(h("div", { class: "card panel" }, h("p", { class: "muted", text: "メンバーが、まだ登録されていません。.claude/project.json の team.members に追加してください。" })));
      return;
    }
    var SHOW = 3;
    c.members.forEach(function (m) {
      var mineOpen = gh.issues.filter(function (i) { return i.assignees.indexOf(m.github) >= 0 && issueKind(i) === "open"; });
      var beforeMerge = count(gh.pulls, function (p) { var k = prKind(p); return p.author === m.github && (k === "open" || k === "draft"); });
      var rv = count(gh.pulls, function (p) { return prKind(p) === "open" && p.reviewers.indexOf(m.github) >= 0; });
      var items = h("ul", { class: "items" });
      for (var k = 0; k < SHOW; k++) {
        var i = mineOpen[k];
        items.append(i
          ? h("li", {}, h("span", { class: "no", text: "#" + i.number }), ext(i.url, i.title.replace(/^\[[^\]]+\]\s*/, "")))
          : h("li", { class: "blank", text: k === 0 ? "未完了の Issue はありません" : "" }));
      }
      items.append(h("li", { class: "rest", text: mineOpen.length > SHOW ? "ほか " + (mineOpen.length - SHOW) + " 件" : "" }));
      wrap.append(h("div", { class: "card member" },
        h("div", { class: "who" }, h("span", { class: "chip", "aria-hidden": "true", text: m.name.slice(0, 1) }),
          h("div", { class: "id" }, h("b", { text: m.name }), ext("https://github.com/" + m.github, "@" + m.github, "small"))),
        h("div", { class: "role", text: m.role || "役割は未設定" }),
        h("div", { class: "nums" },
          h("div", {}, h("div", { class: "k", title: "担当者がこのメンバーで、まだ完了していない Issue", text: "未完了 Issue" }), h("div", { class: "v" }, h("b", { text: String(mineOpen.length) }), "件")),
          h("div", {}, h("div", { class: "k", title: "このメンバーが作成した、まだマージされていない PR", text: "マージ前 PR" }), h("div", { class: "v" }, h("b", { text: String(beforeMerge) }), "件")),
          h("div", {}, h("div", { class: "k", title: "レビュアーに指定されている、マージ前の PR", text: "レビュー依頼" }), h("div", { class: "v" }, h("b", { text: String(rv) }), "件"))),
        items));
    });
    root.append(wrap, dotsFor(wrap));
  }

  /* ---------- 資料リンク ---------- */
  function renderLinks(c) {
    var root = section("links", "資料リンク", "links");
    var ul = h("ul", { class: "links" });
    if (!c.d.links.links.length) {
      root.append(h("div", { class: "card panel" }, h("p", { class: "muted", text: "資料リンクは、まだ登録されていません。dashboard/data/links.json に追加してください。" })));
      return;
    }
    c.d.links.links.forEach(function (l) {
      var anyone = l.access === "anyone";
      ul.append(h("li", {}, h("span", { class: "cat", text: l.category || "" }), h("span", { class: "tt" }, ext(l.url, l.title)),
        pill(anyone ? "リンクを知る全員が開ける" : "組織内のみ（ログイン必要）", anyone ? "acc-anyone" : "acc-org"),
        h("span", { class: "small muted upd", text: l.updated ? "更新 " + md(ymd(l.updated)) : "" }),
        l.note ? h("span", { class: "note", text: l.note }) : null));
    });
    root.append(h("div", { class: "card" }, ul));
  }

  /* ---------- 用語の見方・出どころ ---------- */
  function renderFooter(c) {
    var f = document.getElementById("footer");
    f.textContent = "";
    var terms = [
      ["Issue", "作業や課題を記録したものです。状態は「未完了」「完了」「対象外」の 3 つです。GitHub の Open は未完了、Closed は完了または対象外に当たります。"],
      ["対象外", "実施しないと決めて閉じた Issue です（GitHub の「Close as not planned」）。完了率の計算から除いています。"],
      ["PR（プルリクエスト）", "変更を取り込んでよいか、確認してもらうための依頼です。状態は「下書き」「マージ前」「マージ済み」「却下」の 4 つです。"],
      ["マージ前", "まだ取り込まれていない PR です。確認中・修正中を含みます。GitHub の Open に当たります。"],
      ["却下", "取り込まずに閉じた PR です。マージ済みとは別に数えます。"],
      ["完了率", "完了した Issue ÷（全 Issue − 対象外）です。"],
      ["遅れ", "タスクの予定終了日を過ぎても、完了していない状態です。"],
      ["PR 滞留", "作成から " + STALE_DAYS + " 日以上たっても、マージも却下もされていない PR です（下書きは除く）。"],
      ["データ取得", "このページのデータを GitHub から取得した日時です。「あと N 日」や「遅れ」は、この日を基準に数えています。"],
      ["組織内のみ", "資料の共有設定が、同じ組織のメンバーだけに開く設定です。「リンクを知る全員」は、URL を知っていれば誰でも開けます。"]
    ];
    f.append(h("details", { class: "terms" }, h("summary", { text: "用語の見方" }),
      h("dl", {}, terms.map(function (t) { return [h("dt", { text: t[0] }), h("dd", { text: t[1] })]; }))));
    f.append(h("div", { class: "foot-src", text: "このページは GitHub Pages で公開されています。データの出どころは次のとおりです。" }),
      h("ul", {}, [
        "チーム・メンバー: .claude/project.json（本名ではなくニックネームを使用）",
        "予定・WBS: dashboard/data/schedule.yml（PR で更新）",
        "資料リンク: dashboard/data/links.json（PR で更新）",
        h("li", {}, "Issue・PR・マイルストーン: GitHub から自動取得（", nw(c.d.gh.generatedAt.slice(0, 16).replace("T", " ")), " 時点）")
      ].map(function (t) { return typeof t === "string" ? h("li", { text: t }) : t; })));
  }
})();
