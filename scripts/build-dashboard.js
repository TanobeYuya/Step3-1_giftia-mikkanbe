// 進捗ダッシュボードの生成と検査。
// 使い方（リポジトリの直下で実行）:
//   node scripts/build-dashboard.js --check                 データの検査だけ（ネットワークを使わない）
//   node scripts/build-dashboard.js --check --github        さらに、GitHub のマイルストーン・Issue の実在も調べる（トークンが要る）
//   node scripts/build-dashboard.js --out _site             公開用のフォルダを作る
//   node scripts/build-dashboard.js --out _site --sample-github   GitHub に接続せず、サンプルの Issue・PR で作る（手元の確認用）
// 環境変数: GITHUB_TOKEN（API の呼び出し）、GITHUB_REPOSITORY（owner/repo。無ければ git の origin から取る）、
//           DASHBOARD_ALLOW_PRIVATE（true のときだけ、private のリポジトリの Issue・PR を、公開ページに載せる）
// 入力: .claude/project.json（チーム）、dashboard/data/schedule.yml（予定・WBS）、dashboard/data/links.json（資料）、GitHub（Issue・PR・マイルストーン）
// 出力: <out>/ に、画面（index.html・app.js・style.css）と data/*.json。github.json は公開物にだけ含め、コミットしない。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('./vendor/js-yaml.js');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GITHUB_ID = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const EVENT_TYPES = ['presentation', 'deadline', 'review', 'other'];
const TASK_STATUS = ['todo', 'doing', 'done'];
const ACCESS = ['org', 'anyone'];
const MEET_HOSTS = [/^meet\.google\.com$/, /^zoom\.us$/, /\.zoom\.us$/, /^teams\.microsoft\.com$/, /^teams\.live\.com$/];
const JST_MS = 9 * 3600 * 1000;
const STATIC_FILES = ['index.html', 'app.js', 'style.css'];

/* ---------- 日付 ---------- */
function isDate(s) {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
// 画面は「先頭 10 文字 = 日本時間の日付」として読む。GitHub の UTC の時刻を、日本時間（+09:00）に直して渡す
function toJst(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return `${new Date(t + JST_MS).toISOString().slice(0, 19)}+09:00`;
}

/* ---------- 読み込み ---------- */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${path.basename(file)} を読めません: ${e.message}`);
  }
}
function readYaml(file) {
  const text = fs.readFileSync(file, 'utf8');
  try {
    // CORE_SCHEMA: 日付（2026-11-06）を、日付型ではなく文字列のまま読む
    return yaml.load(text, { schema: yaml.CORE_SCHEMA }) || {};
  } catch (e) {
    throw new Error(`${path.basename(file)} の書き方が正しくありません（${e.reason || e.message}、${e.mark ? `${e.mark.line + 1} 行目` : '行不明'}）`);
  }
}
function originRepo(root) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

/* ---------- チーム ---------- */
function activeMembers(cfg) {
  return ((cfg.team || {}).members || []).filter((m) => m && (m.github || m.name));
}
function isFilled(cfg) {
  return Boolean((cfg.project || {}).name) && activeMembers(cfg).some((m) => m.github && m.name);
}
function siteFrom(cfg) {
  return {
    project: { name: cfg.project.name, purpose: cfg.project.purpose || '' },
    team: {
      name: (cfg.team || {}).name || '',
      members: activeMembers(cfg).filter((m) => m.github && m.name).map((m) => ({ name: m.name, github: m.github, role: m.role || '' })),
    },
  };
}

/* ---------- 検査（メッセージは { level: 'error' | 'warn', text } の配列） ---------- */
function validateSite(cfg) {
  const out = [];
  const seen = new Set();
  activeMembers(cfg).forEach((m, i) => {
    const at = `project.json の team.members[${i}]`;
    if (!m.name || !String(m.name).trim()) out.push({ level: 'error', text: `${at}: name（ニックネーム）が空です` });
    else if (String(m.name).length > 20) out.push({ level: 'error', text: `${at}: name が長すぎます（20 文字まで）。本名ではなく、ニックネームを入れてください` });
    if (!GITHUB_ID.test(m.github || '')) out.push({ level: 'error', text: `${at}: github の形式が正しくありません: ${m.github || '（空）'}` });
    else if (seen.has(m.github.toLowerCase())) out.push({ level: 'error', text: `${at}: github が重複しています: ${m.github}` });
    else seen.add(m.github.toLowerCase());
  });
  return out;
}

function validateEvents(events, out) {
  if (!Array.isArray(events)) return out.push({ level: 'error', text: 'schedule.yml: events は、リストで書いてください' });
  events.forEach((e, i) => {
    const at = `schedule.yml の events[${i}]`;
    if (!e || typeof e !== 'object') return out.push({ level: 'error', text: `${at}: 項目の形が正しくありません` });
    if (!isDate(e.date)) out.push({ level: 'error', text: `${at}: date は、YYYY-MM-DD の実在する日付にしてください（${JSON.stringify(e.date)}）` });
    if (typeof e.title !== 'string' || !e.title.trim()) out.push({ level: 'error', text: `${at}: title が空です` });
    if (e.type !== undefined && !EVENT_TYPES.includes(e.type)) out.push({ level: 'error', text: `${at}: type は ${EVENT_TYPES.join(' | ')} のどれかにしてください（${JSON.stringify(e.type)}）` });
    if (e.meet !== undefined && e.meet !== null && e.meet !== '') {
      let url = null;
      try { url = new URL(String(e.meet)); } catch { /* 下で報告する */ }
      if (!url || url.protocol !== 'https:' || !MEET_HOSTS.some((re) => re.test(url.hostname.toLowerCase()))) {
        out.push({ level: 'error', text: `${at}: meet は、Google Meet・Zoom・Teams の https の URL だけ書けます（${JSON.stringify(e.meet)}）` });
      }
    }
  });
}

function findCycle(tasks) {
  const deps = new Map(tasks.map((t) => [t.id, Array.isArray(t.depends_on) ? t.depends_on : []]));
  const state = new Map(); // 1: 探索中、2: 完了
  const visit = (id, trail) => {
    if (state.get(id) === 1) return [...trail, id];
    if (state.get(id) === 2 || !deps.has(id)) return null;
    state.set(id, 1);
    for (const d of deps.get(id)) {
      const found = visit(d, [...trail, id]);
      if (found) return found;
    }
    state.set(id, 2);
    return null;
  };
  for (const id of deps.keys()) {
    const found = visit(id, []);
    if (found) return found;
  }
  return null;
}

function validateTasks(tasks, ctx, out) {
  if (!Array.isArray(tasks)) return out.push({ level: 'error', text: 'schedule.yml: tasks は、リストで書いてください' });
  const ids = new Set();
  tasks.forEach((t, i) => {
    const at = `schedule.yml の tasks[${i}]`;
    if (!t || typeof t !== 'object') return out.push({ level: 'error', text: `${at}: 項目の形が正しくありません` });
    if (typeof t.id !== 'string' && typeof t.id !== 'number') out.push({ level: 'error', text: `${at}: id が必要です` });
    else if (ids.has(String(t.id))) out.push({ level: 'error', text: `${at}: id が重複しています: ${t.id}` });
    else ids.add(String(t.id));
    if (typeof t.title !== 'string' || !t.title.trim()) out.push({ level: 'error', text: `${at}: title が空です` });
    if (typeof t.milestone !== 'string' || !t.milestone.trim()) out.push({ level: 'error', text: `${at}: milestone が空です（GitHub のマイルストーンの名前と同じにします）` });
    const okStart = isDate(t.start);
    const okEnd = isDate(t.end);
    if (!okStart) out.push({ level: 'error', text: `${at}: start は、YYYY-MM-DD の実在する日付にしてください（${JSON.stringify(t.start)}）` });
    if (!okEnd) out.push({ level: 'error', text: `${at}: end は、YYYY-MM-DD の実在する日付にしてください（${JSON.stringify(t.end)}）` });
    if (okStart && okEnd && t.start > t.end) out.push({ level: 'error', text: `${at}: start（${t.start}）が end（${t.end}）より後です` });
    if (t.status !== undefined && !TASK_STATUS.includes(t.status)) out.push({ level: 'error', text: `${at}: status は ${TASK_STATUS.join(' | ')} のどれかにしてください（${JSON.stringify(t.status)}）` });
    if (t.issue !== undefined && !(Number.isInteger(t.issue) && t.issue > 0)) out.push({ level: 'error', text: `${at}: issue は、正の整数（Issue の番号）にしてください（${JSON.stringify(t.issue)}）` });
    if (ctx.members && !ctx.members.has(String(t.assignee || '').toLowerCase())) {
      out.push({ level: 'error', text: `${at}: assignee ${JSON.stringify(t.assignee)} は、project.json のメンバーにいません` });
    }
    if (ctx.github) {
      if (typeof t.milestone === 'string' && !ctx.github.milestones.some((m) => m.title === t.milestone)) {
        out.push({ level: 'error', text: `${at}: milestone ${JSON.stringify(t.milestone)} が、GitHub にありません` });
      }
      if (Number.isInteger(t.issue) && !ctx.github.issues.some((x) => x.number === t.issue)) {
        out.push({ level: 'error', text: `${at}: issue #${t.issue} が、GitHub にありません` });
      }
    }
  });
  tasks.forEach((t, i) => {
    if (!t || !Array.isArray(t.depends_on)) {
      if (t && t.depends_on !== undefined) out.push({ level: 'error', text: `schedule.yml の tasks[${i}]: depends_on は、リストで書いてください` });
      return;
    }
    t.depends_on.forEach((d) => {
      if (!ids.has(String(d))) out.push({ level: 'error', text: `schedule.yml の tasks[${i}]: depends_on の ${JSON.stringify(d)} という id のタスクがありません` });
      else if (String(d) === String(t.id)) out.push({ level: 'error', text: `schedule.yml の tasks[${i}]: depends_on に、自分自身を指定しています` });
    });
  });
  const cycle = findCycle(tasks.filter((t) => t && t.id !== undefined).map((t) => ({ id: String(t.id), depends_on: (Array.isArray(t.depends_on) ? t.depends_on : []).map(String) })));
  if (cycle) out.push({ level: 'error', text: `schedule.yml: depends_on が循環しています（${cycle.join(' → ')}）` });
}

function validateSchedule(schedule, ctx = {}) {
  const out = [];
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return [{ level: 'error', text: 'schedule.yml: 先頭は、events・tasks を持つ形で書いてください' }];
  validateEvents(schedule.events === undefined ? [] : schedule.events, out);
  validateTasks(schedule.tasks === undefined ? [] : schedule.tasks, ctx, out);
  return out;
}

function validateLinks(links) {
  const out = [];
  const list = links && links.links === undefined ? [] : (links || {}).links;
  if (!Array.isArray(list)) return [{ level: 'error', text: 'links.json: links は、リストで書いてください' }];
  list.forEach((l, i) => {
    const at = `links.json の links[${i}]`;
    if (!l || typeof l.title !== 'string' || !l.title.trim()) out.push({ level: 'error', text: `${at}: title が空です` });
    let url = null;
    try { url = new URL(String((l || {}).url)); } catch { /* 下で報告する */ }
    if (!url || url.protocol !== 'https:') out.push({ level: 'error', text: `${at}: url は、https の URL にしてください（${JSON.stringify((l || {}).url)}）` });
    if (!l || !ACCESS.includes(l.access)) out.push({ level: 'error', text: `${at}: access は ${ACCESS.join(' | ')} のどちらかにしてください（org: 組織内のみ、anyone: リンクを知る全員）` });
    else if (l.access === 'anyone') out.push({ level: 'warn', text: `${at}: access が anyone です。公開ページに載るので、リンクを知る全員が開けてよい資料かを確認してください` });
    if (l && l.updated !== undefined && l.updated !== '' && !isDate(l.updated)) out.push({ level: 'error', text: `${at}: updated は、YYYY-MM-DD にしてください（${JSON.stringify(l.updated)}）` });
  });
  return out;
}

/* ---------- GitHub ---------- */
const mapMilestone = (m) => ({ title: m.title, due_on: m.due_on ? toJst(m.due_on).slice(0, 10) : null, open_issues: m.open_issues, closed_issues: m.closed_issues, url: m.html_url });
const mapIssue = (i) => ({
  number: i.number,
  title: i.title,
  state: i.state,
  state_reason: i.state_reason || null,
  assignees: (i.assignees || []).map((a) => a.login),
  labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
  milestone: i.milestone ? i.milestone.title : null,
  created_at: toJst(i.created_at),
  closed_at: toJst(i.closed_at),
  url: i.html_url,
});
const mapPull = (p) => ({
  number: p.number,
  title: p.title,
  state: p.state,
  draft: Boolean(p.draft),
  merged: Boolean(p.merged_at),
  author: p.user ? p.user.login : null,
  reviewers: (p.requested_reviewers || []).map((r) => r.login),
  created_at: toJst(p.created_at),
  closed_at: toJst(p.closed_at),
  merged_at: toJst(p.merged_at),
  url: p.html_url,
});

async function getAll(fetchImpl, url, token, maxPages = 20) {
  let all = [];
  let next = url;
  for (let page = 0; next && page < maxPages; page++) {
    const res = await fetchImpl(next, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'dashboard-build' },
    });
    if (!res.ok) throw new Error(`GitHub API が失敗しました（${res.status}）: ${next.replace(/\?.*$/, '')}`);
    all = all.concat(await res.json());
    const m = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '');
    next = m ? m[1] : null;
  }
  return all;
}

// リポジトリが public かを、GitHub に問い合わせる。private（internal を含む）のまま、公開ページに載せてしまうのを防ぐため
async function fetchVisibility({ repo, token, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error(`リポジトリ名の形式が正しくありません: ${repo}`);
  const res = await fetchImpl(`https://api.github.com/repos/${repo}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'dashboard-build' },
  });
  if (!res.ok) throw new Error(`GitHub API が失敗しました（${res.status}）: リポジトリの公開設定を確認できません`);
  const body = await res.json();
  if (body.visibility) return body.visibility === 'public' ? 'public' : 'private';
  return body.private ? 'private' : 'public';
}

async function fetchGithub({ repo, token, fetchImpl = fetch, now = new Date() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error(`リポジトリ名の形式が正しくありません: ${repo}`);
  const base = `https://api.github.com/repos/${repo}`;
  const [milestones, issues, pulls] = await Promise.all([
    getAll(fetchImpl, `${base}/milestones?state=all&per_page=100`, token),
    getAll(fetchImpl, `${base}/issues?state=all&per_page=100`, token),
    getAll(fetchImpl, `${base}/pulls?state=all&per_page=100`, token),
  ]);
  return {
    generatedAt: toJst(now.toISOString()),
    repo,
    milestones: milestones.map(mapMilestone),
    issues: issues.filter((i) => !i.pull_request).map(mapIssue), // Issue の一覧には PR も含まれるので除く
    pulls: pulls.map(mapPull),
  };
}

/* ---------- WBS の状態（Issue が完了していれば「完了」） ---------- */
function resolveTasks(tasks, github, messages) {
  return tasks.map((t, i) => {
    const out = { ...t, id: String(t.id), status: t.status || 'todo' };
    if (out.depends_on) out.depends_on = out.depends_on.map(String);
    const issue = github && Number.isInteger(t.issue) ? github.issues.find((x) => x.number === t.issue) : null;
    if (issue && issue.state === 'closed') out.status = 'done';
    else if (issue && out.status === 'done') {
      out.status = 'doing';
      messages.push({ level: 'warn', text: `schedule.yml の tasks[${i}]: status が done ですが、Issue #${issue.number} はまだ完了していません。「進行中」として表示します` });
    }
    return out;
  });
}

/* ---------- 全体 ---------- */
async function build(opts) {
  const { root, out, check = false, withGithub = false, sampleGithub = false, env = process.env, fetchImpl = fetch } = opts;
  const dash = path.join(root, 'dashboard');
  const messages = [];
  const cfg = readJson(path.join(root, '.claude', 'project.json'));
  const filled = isFilled(cfg);
  const site = filled ? siteFrom(cfg) : { ...readJson(path.join(dash, 'data', 'site.sample.json')), sample: true };
  if (filled) messages.push(...validateSite(cfg));

  const schedule = readYaml(path.join(dash, 'data', 'schedule.yml'));
  const links = readJson(path.join(dash, 'data', 'links.json'));
  messages.push(...validateLinks(links));

  // GitHub のデータ: 実際に取る（トークンがあり、--sample-github でないとき）か、サンプル
  const repo = env.GITHUB_REPOSITORY || originRepo(root);
  const token = env.GITHUB_TOKEN;
  let github = null;
  const wantReal = !sampleGithub && (check ? withGithub : true);
  if (wantReal && token && repo) {
    const visibility = await fetchVisibility({ repo, token, fetchImpl });
    if (visibility !== 'public' && env.DASHBOARD_ALLOW_PRIVATE !== 'true') {
      messages.push({ level: 'error', text: `${repo} は private（または internal）です。公開ページに、Issue と PR のタイトル、担当者の ID が載ります。載せてよい場合だけ、リポジトリ変数 DASHBOARD_ALLOW_PRIVATE を true にしてください` });
    } else {
      github = await fetchGithub({ repo, token, fetchImpl });
    }
  } else if (wantReal) {
    messages.push({ level: 'warn', text: `GitHub に接続できません（${token ? 'リポジトリ名が分かりません' : 'GITHUB_TOKEN がありません'}）。${check ? 'GitHub との照合を省きます' : 'サンプルの Issue・PR で作ります'}` });
  }
  const sampleGh = readJson(path.join(dash, 'data', 'github.sample.json'));
  const ghForOutput = github || { ...sampleGh, sample: true };

  const members = filled ? new Set(site.team.members.map((m) => m.github.toLowerCase())) : null;
  const scheduleIsSample = schedule.sample === true;
  messages.push(...validateSchedule(schedule, { members: scheduleIsSample ? null : members, github: scheduleIsSample ? null : github }));
  const hasError = () => messages.some((m) => m.level === 'error');

  const result = { messages, ok: false, out: null };
  if (!hasError() && !check) {
    const tasks = resolveTasks(schedule.tasks || [], scheduleIsSample ? null : github, messages);
    const outData = path.join(out, 'data');
    fs.mkdirSync(outData, { recursive: true });
    for (const f of STATIC_FILES) fs.copyFileSync(path.join(dash, f), path.join(out, f));
    const write = (name, data) => fs.writeFileSync(path.join(outData, name), `${JSON.stringify(data, null, 1)}\n`);
    write('site.json', site);
    write('schedule.json', { ...(scheduleIsSample ? { sample: true } : {}), events: schedule.events || [], tasks });
    write('links.json', { ...(links.sample === true ? { sample: true } : {}), links: links.links || [] });
    write('github.json', ghForOutput);
    result.out = out;
  }
  result.ok = !hasError();
  return result;
}

function parseArgs(argv) {
  const o = { check: false, withGithub: false, sampleGithub: false, out: '', root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') o.check = true;
    else if (argv[i] === '--github') o.withGithub = true;
    else if (argv[i] === '--sample-github') o.sampleGithub = true;
    else if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--root') o.root = path.resolve(argv[++i]);
    else throw new Error(`不明な引数: ${argv[i]}`);
  }
  if (!o.check && !o.out) o.out = '_site';
  return o;
}

module.exports = { build, fetchGithub, fetchVisibility, getAll, mapIssue, mapPull, mapMilestone, validateSchedule, validateLinks, validateSite, resolveTasks, findCycle, isDate, toJst, isFilled };

if (require.main === module) {
  (async () => {
    try {
      const o = parseArgs(process.argv.slice(2));
      const r = await build({ ...o, out: o.out ? path.resolve(o.root, o.out) : '' });
      for (const m of r.messages) console.log(`${m.level === 'error' ? 'エラー' : '警告  '}: ${m.text}`);
      const errors = r.messages.filter((m) => m.level === 'error').length;
      const warns = r.messages.length - errors;
      if (!r.ok) {
        console.error(`検査に失敗しました（エラー ${errors} 件、警告 ${warns} 件）`);
        process.exit(1);
      }
      console.log(o.check ? `検査 OK（警告 ${warns} 件）` : `作成しました: ${r.out}（警告 ${warns} 件）`);
    } catch (e) {
      console.error(`エラー: ${e.message}`);
      process.exit(1);
    }
  })();
}
