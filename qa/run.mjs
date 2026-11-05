// 株ニュース5本勝負の検査。データの形・5本の組み方（何千回）を確かめ、index.html をブラウザで開いて遊び方・記録・スマホ幅・PWA を確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import http from "node:http";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = "file://" + path.join(root, "index.html");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const MISSION_GOAL = (id) => ({ play3: 3, hit12: 12, tw3: 3, ai3: 3, hard1: 1, p10: 1, co6: 6, rival2: 2, surv5: 1, rev3: 3 })[id] ?? 0;

// 1. データの形（ブラウザを使わない）
const sb = { window: {} }; vm.runInNewContext(readFileSync(path.join(root, "data.js"), "utf8"), sb);
const { COMPANIES, EVENTS, TERMS } = sb.window.KABU_DATA;
check("会社は12社・ニュースは80本以上", COMPANIES.length === 12 && EVENTS.length >= 80, `${COMPANIES.length}社・${EVENTS.length}本`);
const per = COMPANIES.map((_, i) => EVENTS.filter((e) => e.c === i).length);
check("どの会社もニュースが6本以上（毎日ちがう組み合わせになる）", per.every((n) => n >= 6), per.join(","));
const ups = EVENTS.filter((e) => e.p > 0).length;
check("上げと下げのニュースがどちらも4割以上（どちらか一方に賭ければ勝てる形にしない）", ups / EVENTS.length >= .4 && ups / EVENTS.length <= .6, `上げ${ups}/${EVENTS.length}`);
const longs = EVENTS.filter((e) => [...e.n].length > 22 || [...e.o].length > 22);
check("見出しと「なぜ動いたか」は22字以内（一目で読める）", longs.length === 0, longs.map((e) => e.n).join(","));
check("値動きは±1〜20%で、0が無い", EVENTS.every((e) => Number.isInteger(e.p) && e.p !== 0 && Math.abs(e.p) <= 20));
const twist = EVENTS.filter((e) => e.x).length;
check("見出しの印象と逆に動くひねった問題（x:1）が2割くらい（18〜30%）", twist / EVENTS.length >= .18 && twist / EVENTS.length <= .3, `${twist}/${EVENTS.length}`);
check("見出しが重ならない", new Set(EVENTS.map((e) => e.n)).size === EVENTS.length);
check("会社の番号と用語がデータにある", EVENTS.every((e) => COMPANIES[e.c] && TERMS[e.t]), EVENTS.filter((e) => !TERMS[e.t]).map((e) => e.t).join(","));
{ const per = COMPANIES.map((c, i) => EVENTS.filter((e) => e.c === i).length);
  check("ニュースは180本以上・どの会社も15本以上（すぐ同じ問題にならない）", EVENTS.length >= 180 && per.every((n) => n >= 15), per.join(",")); }
// 見出しに株価の向きを書かない（答えが見えてしまう。2026-11-04 下書きで「株価は下落」と書きかけた）
const tell = EVENTS.filter((e) => /株価[はが]?(下落|上昇|値上がり|値下がり|上が|下が|急落|反発)/.test(e.n));
check("見出しに株価の向き（上がった・下がった）を書かない", tell.length === 0, tell.map((e) => e.n).join(","));
const unused = Object.keys(TERMS).filter((k) => !EVENTS.some((e) => e.t === k));
check("どの用語もどこかのニュースで出てくる", unused.length === 0, unused.join(","));
check("用語の説明は40字以内", Object.values(TERMS).every(([n, d]) => [...d].length <= 40), Object.values(TERMS).filter(([, d]) => [...d].length > 40).map(([n]) => n).join(","));
// 笑いを無理に入れない（2026-11-03「変にお笑い要素が入っている」で直した。同じ言葉を戻さない）
const silly = /お笑い|ギャグ|ボケ|ツッコミ|スベ|ウケ|なんでやねん/;
const sillyHit = [...COMPANIES.map((c) => c.n), ...EVENTS.flatMap((e) => [e.n, e.o])].filter((t) => silly.test(t));
check("会社名・ニュースにお笑いの言葉を入れない（本物っぽく）", sillyHit.length === 0, sillyHit.join(","));
const html = readFileSync(path.join(root, "index.html"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/fonts\.gstatic\.com$|^https:\/\/ko-fi\.com\/satouaaaaa$|^https:\/\/twitter\.com\/intent\/tweet\?text=$|^https:\/\/line\.me\/R\/share\?text=$/.test(u));
// X・LINE は押したときに開く投稿画面へのリンクで、読み込みはしない
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない", ext.length === 0, ext.join(","));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/kabu-news/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, og("og:image")); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（「感想」の2字だと GitHub がフォームを出さず白紙の Issue になる。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3 && /^description:\s*\S/m.test(fy), (fy.match(/^name:.*$/m) || [""])[0]);
  check("感想フォームは名前・メールを聞かない（楽しさ・よかった所・直してほしい所だけ）", /id: fun/.test(fy) && /id: good/.test(fy) && /id: wish/.test(fy) && !/id: (name|email|mail)/.test(fy)); }
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
check("文字（Google Fonts）は画面を止めずに後から読む（media=print と onload）", /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]+" media="print" onload="this\.media='all'">/.test(html));
// 文字の濃さ（WCAG 2.1 のコントラスト比。ふつうの文字 4.5、大きい文字 3 以上）を、見えている文字すべてで測る
const contrastLow = (page) => page.evaluate(() => {
  const rgb = (c) => c.match(/[\d.]+/g).map(Number), lum = (m) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
  const bgOf = (el) => { const cols = []; for (let e = el; e; e = e.parentElement) { const m = rgb(getComputedStyle(e).backgroundColor); if ((m[3] ?? 1) > 0) cols.push(m); if ((m[3] ?? 1) >= 1) break; }
    let base = rgb(getComputedStyle(document.body).backgroundColor); for (const m of cols.reverse()) { const a = m[3] ?? 1; base = base.map((v, i) => v * (1 - a) + m[i] * a); } return base; };
  const out = []; for (const el of document.querySelectorAll("#screen *, header *")) { const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(""); if (!t || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el), op = +cs.opacity, fg = rgb(cs.color), bg = bgOf(el), fgm = fg.map((v, i) => v * op + bg[i] * (1 - op));
    const a = lum(fgm), b = lum(bg), r = (Math.max(a, b) + .05) / (Math.min(a, b) + .05), big = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
    if (r < (big ? 3 : 4.5)) out.push(`${t.slice(0, 12)}:${r.toFixed(2)}`); } return out; });
const isNoise = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::ERR_/.test(t);
async function lateChecks() {
  const todayAt = process.env.QA_LATE_TODAY || "2026-12-02T03:00:00Z", K = "kabu-news-v1";
  const dayOf = (off) => new Date(Date.parse(todayAt) + 9 * 3600e3 - off * 864e5).toISOString().slice(0, 10);
  const A = dayOf(1), B = dayOf(3), today = dayOf(0); // A はきのう（連続に数えたら分かる）、B は月をまたぎやすい3日前
  const ctx = await browser.newContext({ viewport: { width: 320, height: 760 } });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date(todayAt) });
  await p.goto(url);
  const rec = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), K);
  // 何百日分も：あとから遊べる日は「きのう〜7日前・第1回より後・まだ遊んでいない日」だけ。数え方を別に書いて突き合わせる
  { const r = await p.evaluate(() => { const { lateDays } = window.__kabu, bad = []; const DAY = 864e5, F = Date.parse("2026-11-03");
      const iso = (t) => new Date(t).toISOString().slice(0, 10);
      for (let n = 0; n < 500; n++) { const T = F + n * DAY, days = {}, late = {};
        for (let k = 0; k <= n; k++) { const d = iso(F + k * DAY); if ((k * 7 + n) % 3 === 0) days[d] = { pct: 1 }; else if ((k + n) % 5 === 0) late[d] = { pct: -1 }; }
        const exp = []; for (let i = 1; i <= 7; i++) { const t = T - i * DAY; if (t >= F && !days[iso(t)] && !late[iso(t)]) exp.push(iso(t)); }
        const got = lateDays({ days, late }, iso(T)); if (got.join() !== exp.join()) bad.push(`${iso(T)}:${got.join()}≠${exp.join()}`); }
      return bad; });
    check("あとから遊べる日を500日分作り、毎回「きのう〜7日前・第1回より後・遊んでいない日」だけになる", r.length === 0, r.slice(0, 3).join(" | ")); }
  { const r = await p.evaluate(() => { const { lateDays, build, seedOf } = window.__kabu; let ok = 0;
      for (let n = 0; n < 400; n++) { const d = new Date(Date.parse("2026-11-03") + n * 864e5).toISOString().slice(0, 10); if (JSON.stringify(build(seedOf(d))) === JSON.stringify(build(seedOf(d)))) ok++; } return ok; });
    check("あとからの5本は日付の種で決まり、400日分とも毎回同じ5本になる", r === 400, String(r)); }
  const listOf = (d) => p.evaluate((d) => { const { build, seedOf } = window.__kabu; return build(seedOf(d)).map((e) => ({ n: e.n, p: e.p, x: e.x ? 1 : 0 })); }, d);
  const LA = await listOf(A), LB = await listOf(B);
  const toMonth = async (d) => { for (let i = 0; i < 24 && (await p.getAttribute(".cal", "data-ym")) !== d.slice(0, 7); i++) await p.click("#calprev"); };
  const answer = async (e) => p.click(e.p > 0 ? "#buy" : "#sell");
  // まず今日の5本を遊ぶ（ふだんの人と同じ形にする）
  await p.click("#go"); for (let i = 0; i < 5; i++) { await p.click("#pass"); await p.click("#next"); } await p.click("#tohome");
  const before = await rec();
  const want = Math.min(7, Math.round((Date.parse(today) - Date.parse("2026-11-03")) / 864e5));
  check("はじめの画面に「カレンダー・あとから遊べる日」のボタンが出て、日数が合う", new RegExp(`あとから遊べる日 ${want}日`).test(await p.textContent("#calbtn")), await p.textContent("#calbtn"));
  await p.click("#calbtn"); await toMonth(A);
  check("カレンダーを前の月へ戻すと、あとから遊べる日に点線の印が付く", (await p.locator(`.cal i[data-d="${A}"].can`).count()) === 1);
  await p.click(`.latebtn[data-d="${A}"]`); await p.waitForTimeout(300);
  check("あとからの画面に日付と「あとから」が出る", /あとから/.test(await p.textContent(".news small")));
  for (let i = 0; i < 2; i++) { await answer(LA[i]); await p.click("#next"); }
  await p.click("#home");
  await p.click("#calbtn"); await toMonth(B); await p.click(`.latebtn[data-d="${B}"]`); await answer(LB[0]); await p.click("#next"); await p.click("#home");
  { const r = await rec(); check("別の日を始めても、前の日の途中経過は日付ごとに残る（acur）", r.acur?.[A]?.t === 2 && r.acur?.[B]?.t === 1 && !r.cur, JSON.stringify({ a: r.acur?.[A]?.t, b: r.acur?.[B]?.t })); }
  await p.click("#calbtn"); await toMonth(A);
  check("途中の日のボタンに「続きから」が出る", /続きから/.test(await p.textContent(`.latebtn[data-d="${A}"]`)));
  // 古いタブ：カレンダーを開いたまま、別のタブで同じ日を終える
  const p2 = await ctx.newPage(); await p2.goto(url); await p2.click("#calbtn");
  for (let i = 0; i < 24 && (await p2.getAttribute(".cal", "data-ym")) !== A.slice(0, 7); i++) await p2.click("#calprev");
  await p.click(`.latebtn[data-d="${A}"]`);
  check("戻ると、前の日の途中（3本目）から続く", (await p.locator(".steps i:nth-child(3).on").count()) === 1);
  let stampOk = true, comboOk = true;
  for (let i = 2; i < 5; i++) { await answer(LA[i]);
    const st = (await p.textContent(".stamp")).trim(), cb = await p.locator(".combo").count();
    if (st !== (LA[i].x ? "見抜いた！" : "的中！")) stampOk = false; if (cb !== (i >= 1 ? 1 : 0)) comboOk = false;
    await p.click("#next"); }
  check("ひねった問題を当てると「見抜いた！」、ふつうは「的中！」の判が出る", stampOk);
  check("続けて当てると「🎯×N 続けて的中」が出る", comboOk);
  const tw = LA.filter((e) => e.x).length;
  check("終わりの画面に、ひねった問題を見抜いた数が出る（ひねりがあるときだけ）", tw ? (await p.textContent(".twsum")).includes(`見抜いた ${tw}/${tw}`) : (await p.locator(".twsum").count()) === 0, tw ? await p.textContent(".twsum") : "ひねりなし");
  const share = (await p.textContent(".share")).trim();
  check("あとからの共有の文は「第N回（日付・あとから）」で、答えを出さない", /^株ニュース5本勝負 第\d+回（\d+\/\d+・あとから）\n/.test(share) && !LA.some((e) => share.includes(e.n)), share.split("\n")[0]);
  check("あとからの結果にも「続けて遊ぶ：連続的中チャレンジ」が出る（あとからの5本を終えれば開く）", (await p.locator("#surv").count()) === 1 && /続けて遊ぶ/.test(await p.textContent("#surv")));
  check("あとからの結果には、Ko-fi・連続日数・上級のボタンを出さない", (await p.locator(".kofi").count()) === 0 && (await p.locator(".fire").count()) === 0 && (await p.locator("#hard").count()) === 0);
  { const r = await rec(); check("あとからの記録は late に入り、今日の記録・遊んだ日・最高記録は増えず、途中経過だけ消える", r.late?.[A] && Object.keys(r.days).join() === today && r.plays === 1 && r.best === before.best && r.hits === before.hits && !r.acur?.[A] && r.acur?.[B]?.t === 1 && r.xp === before.xp + 5, JSON.stringify({ late: Object.keys(r.late || {}), days: Object.keys(r.days), plays: r.plays, xp: r.xp })); }
  await p.click("#tohome");
  check("きのうをあとから遊んでも、連続日数・遊んだ日に数えない", (await p.locator(".stats b").nth(1).textContent()) === "1" && (await p.locator(".stats b").nth(0).textContent()) === "1");
  await p.click("#calbtn"); await toMonth(A);
  check("あとから遊んだ日は、カレンダーに今日の5本と別の印（枠）が付き、ボタンは消える", (await p.locator(`.cal i[data-d="${A}"]:is(.lu,.ld)`).count()) === 1 && (await p.locator(`.latebtn[data-d="${A}"]`).count()) === 0 && (await p.locator(`.cal i[data-d="${A}"]:is(.pu,.pd)`).count()) === 0);
  await p2.click(`.latebtn[data-d="${A}"]`);
  check("古いタブで遊び終えた日を選ぶと、知らせてはじめの画面へ戻る（もう一度遊べない）", /もう遊び終えています/.test(await p2.textContent("#toast")) && (await p2.locator("#go").count()) === 1);
  { const n = await p.evaluate(() => { try { start("late", "2020-01-01"); } catch (e) { return "err"; } return document.querySelector("#toast").textContent; });
    check("7日より前の日は、あとから遊べない", /7日前まで/.test(n), n); }
  // 320px：カレンダーと実績の画面が崩れない・押す所は44px以上・キーで動かすと枠が出る
  await p.click("#calbtn");
  for (const where of ["カレンダー", "実績と図鑑"]) {
    if (where === "実績と図鑑") { await p.click("#back"); await p.click("#col"); }
    const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, small: [...document.querySelectorAll("#screen button,#screen a")].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.textContent.trim().slice(0, 8), Math.round(r.height)]; }).filter(([, h]) => h < 44) }));
    check(`幅320pxの${where}の画面がはみ出さず、押す所は44px以上`, !r.over && r.small.length === 0, JSON.stringify(r)); }
  { await p.click("#back"); await p.click("#calbtn"); await p.keyboard.press("Tab");
    const bad = await p.evaluate(() => { const out = []; for (const el of document.querySelectorAll("button:not(:disabled),a[href],summary")) { if (!el.offsetParent) continue; el.focus();
        const cs = getComputedStyle(el); if (!el.matches(":focus-visible") || cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) < 2) out.push(el.id || el.textContent.trim().slice(0, 8)); } return out; });
    check("キーで動かすと、どのボタン・リンクにも2px以上の枠が出る（:focus-visible）", bad.length === 0, bad.join(",")); }
  { const r = await p.evaluate(() => window.__kabu.playedDays({ days: { a: 1, b: 1 }, late: { b: 1, c: 1 } }));
    check("実績「10日遊ぶ」などの日数は、今日の5本とあとからの合計（同じ日は1回）", r === 3, String(r)); }
  { await p.evaluate(() => { const r = JSON.parse(localStorage.getItem("kabu-news-v1")); r.days = {}; localStorage.setItem("kabu-news-v1", JSON.stringify(r)); home(); });
    const s0 = await p.locator(".stats b").nth(1).textContent(); await p.click("#calbtn"); const cal0 = await p.textContent(".calnav");
    check("連続が0日のときは、記録にもカレンダーにも連続の数を出さない（休んだ日を責めない）", s0 === "-" && !/連続/.test(cal0), `${s0} / ${cal0}`); }
  // 0時をまたいだ別のタブ：同じ日の今日の5本とあとからは、どちらか一方だけを記録する（2026-11-04 CodeRabbit の指摘）
  { const setDay = (on) => p.evaluate(([k, d, on]) => { const r = JSON.parse(localStorage.getItem(k)); if (on) r.days[d] = { pct: 0, marks: "", text: "" }; else delete r.days[d]; localStorage.setItem(k, JSON.stringify(r)); }, [K, B, on]);
    const openB = async () => { await p.evaluate(() => home()); await p.click("#calbtn"); await toMonth(B); await p.click(`.latebtn[data-d="${B}"]`); };
    await openB(); await setDay(true); await answer(LB[1]);
    { const r = await rec(); check("あとからの途中で、同じ日の今日の5本が別のタブで終わっていたら、答えずに知らせて戻る（late に記録しない）", /もう遊び終えています/.test(await p.textContent("#toast")) && (await p.locator("#go").count()) === 1 && !r.late?.[B] && !r.acur?.[B], JSON.stringify({ late: Object.keys(r.late || {}), acur: Object.keys(r.acur || {}) })); }
    await setDay(false); await openB();
    for (let i = 0; i < 4; i++) { await answer(LB[i]); await p.click("#next"); }
    await answer(LB[4]); await setDay(true); await p.click("#next");
    { const r = await rec(); check("最後の1本のあとに同じ日の今日の5本が終わっていても、あとからの記録を書かない（end でも確かめる）", /もう遊び終えています/.test(await p.textContent("#toast")) && !r.late?.[B] && (await p.locator(".share").count()) === 0, JSON.stringify(Object.keys(r.late || {}))); }
    await setDay(false); await openB();
    await p.evaluate(() => { const orig = countWeek; window.__cw = null; countWeek = (c) => { window.__cw = c; return orig(c); }; });
    for (let i = 0; i < 4; i++) { await answer(LB[i]); await p.click("#next"); }
    await answer(LB[4]); await p.evaluate(() => { G.money = 1200000; }); await p.click("#next");
    { const c = await p.evaluate(() => window.__cw); check("あとから遊んだ回も、ミッション「1回で+10%以上」に数える（full）", c?.full === true && c.pct >= 10, JSON.stringify(c && { full: c.full, pct: c.pct })); } }
  check("あとから遊ぶ間にページのエラーが無い", errs.length === 0, errs.join(" / "));
  await ctx.close();
}
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear()); await page.reload();

  // 2. 5本の組み方を何千回も作って毎回確かめる（2026-10-31 乱数の組み方を1回しか見ず0人の村ができた。shared-workflows incidents/2026-10-31-roppo-empty-village.md）
  const b = await page.evaluate(() => {
    const { build, TURNS } = window.__kabu, bad = []; let same = 0;
    for (let s = 1; s <= 5000; s++) {
      const seed = (s * 2654435761) >>> 0, l = build(seed), up = l.filter((e) => e.p > 0).length;
      if (l.length !== TURNS) bad.push(`${s}:本数${l.length}`);
      if (new Set(l.map((e) => e.c)).size !== l.length) bad.push(`${s}:会社が重なる`);
      if (up === 0 || up === TURNS) bad.push(`${s}:上げ下げが片方だけ`);
      if (l.some((e) => e.hist.length !== 12 || e.hist.some((v) => !Number.isFinite(v) || v < 50))) bad.push(`${s}:株価`);
      if (JSON.stringify(build(seed)) === JSON.stringify(l)) same++;
    }
    return { bad: bad.slice(0, 5), n: bad.length, same };
  });
  check("5000回組んで、毎回5本・会社が重ならない・上げと下げが両方入る・株価が正しい", b.n === 0, b.bad.join(" | "));
  check("同じ日（同じ種）なら、だれでも同じ5本になる", b.same === 5000);
  const days = await page.evaluate(() => { const { build } = window.__kabu, seedOf = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const set = new Set(); for (let d = 1; d <= 30; d++) set.add(build(seedOf(`2026-12-${String(d).padStart(2, "0")}`)).map((e) => e.n).join()); return set.size; });
  check("30日分の「今日の5本」がすべてちがう", days === 30, `${days}/30`);

  // 3. 通しで遊ぶ：今日の5本（買う→売る→見送る→全力で買う→売る）。持ち金の計算を別に計算して突き合わせる
  check("遊ぶ前の画面に Ko-fi のひとことが無い", (await page.locator(".kofi").count()) === 0);
  check("はじめの画面に「今日の5本をはじめる」", /今日の5本をはじめる/.test(await page.textContent("#go")));
  check("初めての人には、空の記録でなく遊び方の3つの絵が出る", (await page.locator(".intro div").count()) === 3 && (await page.locator(".stats").count()) === 0);
  check("初めての人の画面には、連続的中チャレンジのボタンも鍵の文も出さない（今日の5本だけ）", (await page.locator("#surv").count()) === 0 && !/連続的中チャレンジ/.test(await page.textContent("#screen")));
  check("ボタンに今日が第何回かが出る（だれでも同じ回）", /^第\d+回 /.test((await page.textContent("#go")).trim()));
  { const small = await page.evaluate(() => [...document.querySelectorAll("button,a")].filter((b) => b.offsetParent && b.id !== "home").map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.textContent.trim().slice(0, 8), r.width, r.height]; }).filter(([, w, h]) => w < 44 || h < 44));
    check("押す所はどれも44px以上（指で押しやすい）", small.length === 0, JSON.stringify(small)); }
  { const low = await contrastLow(page); check("はじめの画面の文字は背景と十分な濃さの差がある（WCAG 4.5:1、大きい文字 3:1）", low.length === 0, low.join(" / ")); }
  await page.click("#go");
  { await page.waitForTimeout(900); const low = await contrastLow(page); check("問題の画面の文字（買う・売るの小さい文字も）は背景と十分な濃さの差がある", low.length === 0, low.join(" / ")); }
  check("初めての1問目に、買う・売るのヒントが1行出る", (await page.locator(".hint").count()) === 1);
  const list = await page.evaluate(() => { const s = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return window.__kabu.build(s(d)).map((e) => e.p); });
  const plan = [["buy", false], ["sell", false], ["pass", false], ["buy", true], ["sell", true]];
  let money = 1000000; const marks = [];
  for (let i = 0; i < 5; i++) {
    const [act, all] = plan[i], side = { buy: 1, sell: -1, pass: 0 }[act];
    if (i === 2) { // 途中で開き直しても続きから（やり直しで結果を変えられない）
      await page.reload();
      check("途中で開き直すと「続き（3本目から）」になる", /続き（3本目から）/.test(await page.textContent("#go")));
      check("今日の5本を1回終えるまでは、連続的中チャレンジに鍵がかかっている（そう書いてある）", (await page.locator("#surv").count()) === 0 && /連続的中チャレンジは、今日の5本を1回終えると開く/.test(await page.textContent("#screen")));
      await page.click("#go");
    }
    if (all) await page.check("#all", { force: true });
    await page.click("#" + act);
    money += Math.round(money * (all ? 1 : .5) * side * list[i] / 100);
    marks.push(side === 0 ? "😶" : Math.sign(list[i]) === side ? "🎯" : "💥");
    if (i === 0) check("遊んでいる途中に Ko-fi のひとことが無い", (await page.locator(".kofi").count()) === 0);
    if (i === 1) check("2問目からはヒントを出さない", (await page.locator(".hint").count()) === 0);
    if (i === 0) {
      const term = await page.locator(".result .term b").textContent();
      check("結果の画面に「なぜ動いたか」と用語の説明が出る", (await page.locator(".why").textContent()).length > 3 && term.length > 1);
    }
    await page.click("#next");
  }
  const share = await page.textContent(".share");
  const man = (v) => (Math.round(v / 1000) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
  check("持ち金の計算が合う（半分・全力・見送り）", share.includes(`100万円 → ${man(money)}`), `${share.split("\n")[2]} / 期待 ${man(money)}`);
  check("共有の文は「題・絵文字5つ・持ち金・称号」", new RegExp(`^株ニュース5本勝負 第\\d+回（\\d+/\\d+）\\n${marks.join("")}\\n100万円 → .+（[+-]?\\d+%）\\n.+\\n#株ニュース5本勝負$`, "u").test(share.trim()), share);
  check("共有の文に答え（ニュースや会社名）が出ない", !list.length || !(await page.evaluate(() => window.__kabu.COMPANIES.some((c) => document.querySelector(".share").textContent.includes(c.n)))));
  check("終わりの画面に今日出てきた言葉が並ぶ", (await page.locator(".words .term").count()) >= 1);
  { const n = await page.locator(".mline circle").count(), lab = await page.getAttribute(".mline", "aria-label");
    check("終わりの画面に持ち金の動き（はじめ＋1本ごとの6点）の線が出て、読み上げ用の説明がある", n === 6 && /持ち金の動き：100万円から/.test(lab || ""), `${n} ${lab}`); }
  { await page.waitForTimeout(1000); const low = await contrastLow(page); check("終わりの画面の文字は背景と十分な濃さの差がある", low.length === 0, low.join(" / ")); }
  check("今日の5本を黒字で終えた画面にだけ Ko-fi のひとこと（ただのリンク1行）が出る（±0%に丸まる赤字では出さない）", money <= 1000000 ? (await page.locator(".kofi").count()) === 0 : (await page.locator(".kofi a[href='https://ko-fi.com/satouaaaaa']").count()) === 1);
  { const rival = (await page.textContent(".rival")).replace(/\s+/g, "");
    const exp = await page.evaluate(() => { const s = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
      const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); let m = 1000000;
      for (const e of window.__kabu.build(s(d))) { const side = Math.sign(e.p) * (e.x ? -1 : 1); m += Math.round(m * .5 * side * e.p / 100); } return Math.round((m / 1e6 - 1) * 100); });
    check("ライバル「見出しどおり」の成績と勝ち負けが出る（見出しの印象どおりに半分ずつ張った計算と同じ）", rival.includes(`${exp >= 0 ? "+" : ""}${exp}%`) && /(あなたの勝ち|見出しどおりの勝ち|引き分け)/.test(rival), rival + " / " + exp); }
  check("終わりの画面に5本のふり返り（会社・値動き）が出る", (await page.locator(".recap div").count()) === 5);
  check("初めての今日の5本で、実績「はじめの一歩」を手に入れたと出る", /はじめの一歩/.test(await page.textContent(".newach")));
  check("今日の5本のあと、終わりの画面から上級に挑戦できる", (await page.locator("#hard").count()) === 1);
  { const sv = await page.evaluate(() => { const b = document.getElementById("surv"); return b && { t: b.textContent, h: b.getBoundingClientRect().height, cls: b.className, below: !!(document.getElementById("hard").compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
    check("今日の5本を終えると、終わりの画面に「続けて遊ぶ：連続的中チャレンジ」の大きなボタン（44px以上・上級の下）が出る", sv && /続けて遊ぶ：連続的中チャレンジ/.test(sv.t) && sv.h >= 44 && /\bmain\b/.test(sv.cls) && sv.below, JSON.stringify(sv)); }
  { const x = decodeURIComponent((await page.getAttribute("#toX", "href")).split("text=")[1]), ln = decodeURIComponent((await page.getAttribute("#toLine", "href")).split("text=")[1]);
    const names = await page.evaluate(() => window.__kabu.COMPANIES.map((c) => c.n));
    check("X・LINE の投稿画面に結果とURLが入る（答えは入らない）", x === ln && x.startsWith(share.trim().split("\n")[0]) && x.endsWith("https://satou-aaaaa.github.io/kabu-news/") && !names.some((n) => x.includes(n)), x);
    check("X・LINE は自分で押して開くリンクだけ（勝手に送らない）", /^https:\/\/twitter\.com\/intent\/tweet\?/.test(await page.getAttribute("#toX", "href")) && /^https:\/\/line\.me\/R\/share\?/.test(await page.getAttribute("#toLine", "href"))); }
  check("終わりの画面に次の5本までの時間が出る", /^\d+(時間\d+)?分$/.test(await page.textContent("#nextin")));
  check("終わりの画面に連続日数が出る", /1日連続/.test(await page.textContent("#screen")));

  // 4. 記録：もう一度開くと「練習でもう一回」・遊んだ日1・的中率
  await page.reload();
  check("今日の5本は1日1回（開き直すと練習になる）", /練習でもう一回/.test(await page.textContent("#go")));
  const st = await page.locator(".stats b").allTextContents();
  const bets = plan.filter(([a]) => a !== "pass").length, hits = marks.filter((m) => m === "🎯").length;
  check("記録：遊んだ日1・連続1日・的中率", st[0] === "1" && st[1] === "1" && st[2] === `${Math.round(hits / bets * 100)}%`, st.join(","));
  check("この7日のグラフに今日の分が出る", (await page.locator(".week span").count()) === 1);
  { const sv = await page.evaluate(() => { const b = document.getElementById("surv"), g = document.getElementById("go"); return b && { t: b.textContent, h: b.getBoundingClientRect().height, above: !!(b.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING), top: b.getBoundingClientRect().top }; });
    check("今日の5本を1回終えると、ホームの上の方（練習より上）に連続的中チャレンジの大きなボタンが出る（肩書きを待たない）", sv && /連続的中チャレンジ何本続けて当てられる？/.test(sv.t) && sv.h >= 44 && sv.above && sv.top < 800, JSON.stringify(sv)); }
  check("遊んだあとのはじめの画面に、シェアと次の5本までの時間が出る", (await page.locator("#share").count()) === 1 && (await page.locator("#nextin").count()) === 1 && (await page.locator(".intro").count()) === 0);
  await page.click("#how");
  check("遊び方の画面に覚えた言葉がたまる", (await page.locator(".words .term b").count()) >= 1);
  await page.click("#back");

  // 5. 練習は何度でも・記録の「遊んだ日」は増えない。キーボード（1・2・3）でも遊べる
  await page.click("#go");
  for (let i = 0; i < 5; i++) { await page.keyboard.press(String(1 + (i % 3))); await page.click("#next"); }
  check("練習の終わり・遊ぶ前・遊んでいる途中には Ko-fi のひとことを出さない", (await page.locator(".kofi").count()) === 0);
  check("練習を最後まで遊べて、共有の文が「練習」になる", /^株ニュース5本勝負 練習/.test((await page.textContent(".share")).trim()));
  await page.click("#tohome");
  check("練習では遊んだ日が増えない", (await page.locator(".stats b").first().textContent()) === "1");

  // 5a. やり込み：上級の5本・実績・図鑑
  const hb = await page.evaluate(() => { const { build } = window.__kabu, bad = []; let same = 0;
    for (let s = 0; s < 3000; s++) { const l = build(s, true), ups = l.filter((e) => e.p > 0).length;
      if (l.length !== 5 || new Set(l.map((e) => e.c)).size !== 5 || ups === 0 || ups === 5 || l.filter((e) => e.x).length < 2) bad.push(s);
      if (JSON.stringify(build(s, true)) === JSON.stringify(l)) same++; }
    return { bad: bad.slice(0, 5), n: bad.length, same }; });
  check("上級の5本を3000回組んで、毎回ひねった問題が2本以上・会社が重ならない・上げと下げが両方入る", hb.n === 0, hb.bad.join(","));
  check("上級の5本も同じ日ならだれでも同じ", hb.same === 3000);
  const pr = await page.evaluate(() => { const { build, EVENTS } = window.__kabu, unseen = [];
    for (let c = 0; c < 6; c++) unseen.push(...EVENTS.filter((e) => e.c === c && (c % 2 ? e.p > 0 : e.p < 0)).slice(0, 1));
    const seen = {}; for (const e of EVENTS) if (!unseen.includes(e)) seen[e.n] = 1; let ok = 0;
    for (let s = 0; s < 1000; s++) if (build(s, false, seen).every((e) => !seen[e.n])) ok++; return ok; });
  check("練習は、まだ読んでいないニュースを先に出す（1000回）", pr >= 990, `${pr}/1000`);
  check("今日の5本のあと、はじめの画面に上級の5本と実績・図鑑のボタンが出る", (await page.locator("#hard").count()) === 1 && /実績と図鑑（\d+\/20）/.test(await page.textContent("#col")));
  await page.click("#hard");
  check("上級ではいつも全力（全力の切り替えが無い）", (await page.locator("#all").count()) === 0 && /いつも全力/.test(await page.textContent("#screen")));
  let twists = 0;
  for (let i = 0; i < 5; i++) {
    if (i === 2) { await page.reload(); check("上級も途中で開き直すと続きから", /上級の5本の続き（3本目から）/.test(await page.textContent("#hard"))); await page.click("#hard"); }
    await page.click("#buy"); twists += await page.locator(".twist").count(); await page.click("#next");
  }
  check("上級でひねった問題の答えに「ひねり」の印が出る（2本以上）", twists >= 2, String(twists));
  const hardShare = (await page.textContent(".share")).trim();
  check("上級の共有の文は「上級 第N回」", /^株ニュース5本勝負 上級 第\d+回（\d+\/\d+）\n/.test(hardShare), hardShare);
  check("上級の終わりの画面にも「続けて遊ぶ：連続的中チャレンジ」の大きなボタンが出る", /続けて遊ぶ：連続的中チャレンジ/.test(await page.textContent("#surv")) && (await page.locator("#surv").evaluate((b) => b.getBoundingClientRect().height)) >= 44);
  const hardList = await page.evaluate(() => { const s = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return window.__kabu.build(s(d + "h"), true).map((e) => e.n); });
  const recapHeads = await page.locator(".recap small").allTextContents();
  check("上級の5本は日付で決まる（だれでも同じ）", recapHeads.join() === hardList.join(), recapHeads.join(" / "));
  const rec2 = await page.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")));
  check("上級の記録は今日の5本と別に残り、遊んだ日は増えない", Object.keys(rec2.hdays).length === 1 && rec2.plays === 1 && !rec2.hcur, JSON.stringify({ h: Object.keys(rec2.hdays), p: rec2.plays }));
  check("上級の最高は今日の5本の最高と別", rec2.hbest > 0 || rec2.hdays[Object.keys(rec2.hdays)[0]].pct <= 0);
  await page.click("#tohome");
  check("上級は1日1回（終えると結果だけ出る）", (await page.locator("#hard").count()) === 0 && (await page.locator(".hardbox").count()) === 1);
  await page.click("#col");
  { const low = await contrastLow(page); check("実績と図鑑の画面の文字は背景と十分な濃さの差がある", low.length === 0, low.join(" / ")); }
  check("実績が20個あり（遠いものはたたむ）、手に入れた実績が先頭に出る", (await page.locator(".ach > div").count()) === 20 && (await page.locator(".ach > div.got").count()) >= 1 && await page.locator(".ach > div").first().evaluate((d) => d.classList.contains("got")) && (await page.locator("details.more .ach > div").count()) === 20 - 4 - (await page.locator(".ach > div.got").count()));
  check("まだの実績には進み具合が出る", (await page.locator(".ach div:not(.got) .bar").count()) >= 1);
  const seenN = Number((await page.locator(".stats b").nth(3).textContent()).split("/")[0]);
  check("図鑑：読んだニュースが数えられる（今日・練習・上級）", seenN >= 11 && seenN <= 15, String(seenN));
  check("会社図鑑に12社の枠があり、読んだ会社は名前が出る", (await page.locator(".zukan div").count()) === 12 && (await page.locator(".zukan div:not(.no)").count()) >= 5);
  { const tm = await page.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).tm);
    const ok = Object.values(tm).every(([b, h]) => b >= 1 && h >= 0 && h <= b), shown = await page.locator(".tmk div").count();
    check("ニュースの種類（用語）ごとの的中を数え、2回以上張った種類が2つ以上あれば、にがて順に並ぶ", ok && (Object.values(tm).filter(([b]) => b >= 2).length < 2 ? shown === 0 : shown >= 2), JSON.stringify(tm)); }
  { const c = await page.evaluate(() => { const d = new Date(Date.now() + 9 * 3600e3), n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      return { n, days: [...document.querySelectorAll(".cal i")].filter((i) => i.textContent.trim()).length, colored: document.querySelectorAll(".cal i.pu,.cal i.pd").length, today: document.querySelectorAll(".cal i.today").length, w: document.querySelector(".cal").scrollWidth <= document.querySelector(".cal").clientWidth }; });
    check("図鑑に今月のカレンダーがあり、遊んだ今日に色が付く（はみ出さない）", c.days === c.n && c.colored >= 1 && c.today === 1 && c.w, JSON.stringify(c)); }
  { const btn = page.locator(".cobtn").first(), co = +(await btn.getAttribute("data-co")), bh = await btn.evaluate((b) => b.getBoundingClientRect().height);
    await btn.click(); const heads = [];
    for (let i = 0; i < 5; i++) { await page.waitForFunction(() => document.querySelector("#nw")?.textContent.length > 3); await page.waitForTimeout(700);
      heads.push(await page.evaluate((h) => window.__kabu.EVENTS.find((e) => e.n.startsWith(h)), await page.textContent("#nw")));
      await page.click("#pass"); await page.click("#next"); }
    const share = (await page.textContent(".share")).trim(), name = await page.evaluate((i) => window.__kabu.COMPANIES[i].n, co);
    check("図鑑の「この会社で練習」は、その会社のニュースだけを5本出し、共有の文に会社名を出さない", heads.every((e) => e.c === co) && new Set(heads.map((e) => e.n)).size === 5 && !share.includes(name) && /練習/.test(share), share);
    check("この会社で練習のボタンは押しやすい大きさ（高さ44px以上）", bh >= 44, String(bh));
    await page.click("#tohome"); await page.click("#col"); }
  check("ひねった問題の的中率が出る", /^(\d+%|-)$/.test(await page.locator(".stats b").first().textContent()));
  await page.click("#back");
  // 復習：はずれたニュースを集めて解き直す。当てると一覧から消える
  const missHeads = await page.evaluate(() => { const ev = window.__kabu.EVENTS, h = [ev.find((e) => e.p > 0).n, ev.find((e) => e.p < 0).n];
    const r = JSON.parse(localStorage.getItem("kabu-news-v1")); r.miss = { [h[0]]: 1, [h[1]]: 1 }; localStorage.setItem("kabu-news-v1", JSON.stringify(r)); return h; });
  await page.reload();
  check("はずれたニュースがあると、はじめの画面に復習のボタンが出る", /復習（2本）/.test(await page.textContent("#rev")));
  await page.click("#rev");
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction((hs) => hs.includes(document.querySelector("#nw")?.textContent), missHeads);
    const h = await page.textContent("#nw"), up = await page.evaluate((h) => window.__kabu.EVENTS.find((e) => e.n === h).p > 0, h);
    await page.click(up ? "#buy" : "#sell"); await page.click("#next");
  }
  check("復習は、はずれたニュースだけを出し、共有の文は「復習」", /^株ニュース5本勝負 復習\n🎯🎯\n/u.test((await page.textContent(".share")).trim()), (await page.textContent(".share")).trim());
  const missLeft = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("kabu-news-v1")).miss).length);
  check("復習で当てたニュースは復習の一覧から消える", missLeft === 0, String(missLeft));
  { const fb = await page.locator(".fb a").evaluateAll((as) => as.map((a) => a.href));
    check("終わりの画面に感想のリンク（3つの顔と文）があり、GitHub の感想フォームを開くだけ", fb.length === 4 && fb.every((u) => u.startsWith("https://github.com/satou-aaaaa/kabu-news/issues/new?template=feedback.yml&")) && /title=%5B%E6%84%9F%E6%83%B3%5D/.test(fb[0]), fb.join(" ")); }
  await page.click("#tohome");
  check("復習するニュースが無くなると、復習のボタンは消える", (await page.locator("#rev").count()) === 0);
  await page.click("#col");
  await page.click("#back");
  // 覚えた言葉のテスト：5つ覚えると出る。正しい説明を選ぶと正解、5問正解で実績
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem("kabu-news-v1")); r.words = {}; for (const k of Object.keys(window.__kabu.TERMS)) r.words[k] = 1; localStorage.setItem("kabu-news-v1", JSON.stringify(r)); });
  await page.reload(); await page.click("#how"); await page.click("#quiz");
  const terms = await page.evaluate(() => window.__kabu.TERMS);
  for (let i = 0; i < 5; i++) {
    const w = (await page.textContent(".qword")).trim(), right = Object.values(terms).find(([n]) => n === w)[1];
    check(`言葉のテスト ${i + 1}問目：3つの説明から選べる（押しやすい大きさ）`, (await page.locator(".qch button").count()) === 3 && (await page.locator(".qch button").evaluateAll((bs) => bs.every((b) => b.getBoundingClientRect().height >= 44))));
    await page.locator(".qch button", { hasText: right }).first().click();
    await page.click("#qnext");
  }
  check("言葉のテストで5問正解すると 5/5 と実績「言葉テスト満点」", (await page.textContent("#qscore")).trim() === "5/5" && /言葉テスト満点/.test(await page.textContent(".newach")));
  await page.click("#qagain");
  { const w = (await page.textContent(".qword")).trim(), right = Object.values(terms).find(([n]) => n === w)[1];
    await page.locator(".qch button").filter({ hasNotText: right }).first().click();
    check("まちがえると、正しい説明に印が付く", (await page.locator(".qch button.right").count()) === 1 && (await page.locator(".qch button.wrong").count()) === 1); }
  // 飽きない仕組み：肩書き・今週のミッション・連続的中チャレンジ
  { const r = await page.evaluate(() => { const k = window.__kabu, seen = {}; let bad = 0, surv = 0;
      for (let i = 0; i < 2000; i++) { const key = new Date(Date.UTC(2026, 10, 2) + i * 7 * 864e5).toISOString().slice(0, 10);
        const lo = k.pickMissions(key, false), hi = k.pickMissions(key, true); if (new Set(lo.map((m) => m[0])).size !== 3 || new Set(hi.map((m) => m[0])).size !== 3) bad++;
        if (lo.some((m) => m[0] === "surv5")) surv++; for (const m of hi) seen[m[0]] = 1;
        if (k.pickMissions(key, true).map((m) => m[0]).join() !== hi.map((m) => m[0]).join()) bad++; }
      return { bad, surv, kinds: Object.keys(seen).length, all: k.MISSIONS.length, mon: new Date(Date.parse(k.weekKey())).getUTCDay() }; });
    check("今週のミッション：2000週ぶん作り、毎週ちがう3つ・同じ週はだれでも同じ・まだ開いていない遊び方は出ない・全種類が出る", r.bad === 0 && r.surv === 0 && r.kinds === r.all, JSON.stringify(r));
    check("週の区切りは月曜（日本時間）", r.mon === 1, String(r.mon)); }
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem("kabu-news-v1")); r.xp = 9; localStorage.setItem("kabu-news-v1", JSON.stringify(r)); });
  await page.reload();
  check("はじめの画面に肩書きと、次の肩書きまでの本数が出る", /見習い/.test(await page.textContent(".ttl")) && /あと1本当てる/.test(await page.textContent(".ttl")), await page.textContent(".ttl"));
  check("はじめの画面に今週のミッションが3つ、進み具合つきで出る", (await page.locator(".wkbox > div").count()) === 3 && (await page.locator(".wkbox .bar").count()) === 3);
  check("肩書きが「見習い」でも、今日の5本を終えていれば連続的中チャレンジは開いている", (await page.locator("#surv").count()) === 1 && !/🔒 連続的中/.test(await page.textContent("#screen")));
  { const r = await page.evaluate(() => { const z = { plays: 0, late: {}, hdays: {}, xp: 0 };
      return [{}, { plays: 1 }, { late: { "2026-11-01": { pct: 1 } } }, { xp: 10 }, { xp: 9 }].map((p) => window.__kabu.survOpen(Object.assign({}, z, p))); });
    check("連続的中チャレンジが開くのは、今日の5本かあとからの5本を終えた人と、前の決まり（駆け出し）で開いていた人", JSON.stringify(r) === "[false,true,true,true,false]", JSON.stringify(r)); }
  const answer = async () => { const h = await page.textContent("#nw"), ev = await page.evaluate((h) => window.__kabu.EVENTS.find((e) => e.n === h), h); return ev.p > 0; };
  await page.click("#go"); // 練習
  for (let i = 0; i < 5; i++) { await page.waitForFunction(() => document.querySelector("#nw")?.textContent.length > 3); await page.waitForTimeout(700);
    await page.click((await answer()) ? "#buy" : "#sell"); await page.click("#next"); }
  { const t = await page.textContent("#screen");
    check("当てて肩書きが上がると知らせが出る（連続的中チャレンジはもう開いているので「開いた」とは出さない）", /肩書きが上がった/.test(t) && !/新しい遊び方が開いた/.test(t), ""); }
  check("終わりの画面に、肩書きと今週のミッションの進み具合が1行で出る", /駆け出し/.test(await page.textContent(".growline")) && /今週のミッション \d\/3/.test(await page.textContent(".growline")), await page.textContent(".growline"));
  await page.click("#tohome");
  check("ホームに連続的中チャレンジのボタンが出る", (await page.locator("#surv").count()) === 1);
  const xp0 = await page.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).xp);
  await page.click("#surv");
  check("連続的中チャレンジは見送りが無く、何本続いているかが出る", (await page.locator("#pass").count()) === 0 && /0本連続中/.test(await page.textContent(".chain")));
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(700); await page.click((await answer()) ? "#buy" : "#sell");
    if (i === 4) check("連続的中チャレンジで5本ごとに知らせが出る", /5本連続！/.test(await page.textContent("#toast")));
    await page.click("#next"); }
  await page.waitForTimeout(700); await page.click((await answer()) ? "#sell" : "#buy");
  check("外れると、その場で終わりの案内になる", /6本連続で終わり/.test(await page.textContent(".chain")) && (await page.textContent("#next")).trim() === "結果を見る");
  await page.click("#next");
  { const t = (await page.textContent(".share")).trim(), r = await page.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")));
    const heads = await page.evaluate(() => window.__kabu.EVENTS.map((e) => e.n)), names = await page.evaluate(() => window.__kabu.COMPANIES.map((c) => c.n));
    check("連続的中チャレンジの結果：本数が出て、最高記録と肩書きの本数に入る", (await page.textContent("#snum")).trim() === "6本" && r.sbest === 6 && r.xp === xp0 + 6, `${r.sbest} ${r.xp} ${xp0}`);
    check("連続的中チャレンジの共有の文に答え（会社名・ニュース）を出さない", /6本連続/.test(t) && !heads.some((h) => t.includes(h)) && !names.some((n) => t.includes(n)), t);
    check("今週のミッションの記録は今週（月曜）の分だけで、目標を超えない", r.wk && new Date(Date.parse(r.wk.k)).getUTCDay() === 1 && Object.entries(r.wk.v).every(([id, v]) => v <= MISSION_GOAL(id)), JSON.stringify(r.wk));
    check("外れたニュースは復習に入る", Object.keys(r.miss).length >= 1); }
  await page.click("#sagain");
  check("「もう一度挑戦」で、また0本から始まり、自己ベストまでの本数が出る", /0本連続中・自己ベストまで あと7本/.test(await page.textContent(".chain")), await page.textContent(".chain"));
  // 挑戦状：練習のあとに出せるリンクで、友だちが同じ5本を遊び、成績を比べる
  await page.click("#home"); await page.click("#go");
  const played = [];
  for (let i = 0; i < 5; i++) { await page.waitForFunction(() => document.querySelector("#nw")?.textContent.length > 3); await page.waitForTimeout(700);
    const h = await page.textContent("#nw"); played.push(await page.evaluate((h) => window.__kabu.EVENTS.find((e) => e.n.startsWith(h)).n, h));
    await page.click((await answer()) ? "#buy" : "#sell"); await page.click("#next"); }
  const dare = await page.getAttribute("#dare", "data-url");
  { const heads = await page.evaluate(() => window.__kabu.EVENTS.map((e) => e.n));
    check("練習のあとに挑戦状のリンクが作れて、公開ページを指し、答え（見出し）を含まない", /^https:\/\/satou-aaaaa\.github\.io\/kabu-news\/\?c=[0-9a-z]{1,3}(-[0-9a-z]{1,3}){4}&p=-?\d+$/.test(dare || "") && !heads.some((h) => decodeURIComponent(dare).includes(h)), dare); }
  await page.goto(url + dare.slice(dare.indexOf("?")).replace(/p=-?\d+/, "p=-7"));
  check("挑戦状のリンクを開くと、はじめの画面に挑戦状と相手の成績が出る", /挑戦状が届いています/.test(await page.textContent(".dare")) && /-7%/.test(await page.textContent(".dare")));
  await page.click("#chal");
  const got5 = [];
  for (let i = 0; i < 5; i++) { await page.waitForFunction(() => document.querySelector("#nw")?.textContent.length > 3); await page.waitForTimeout(700);
    const h = await page.textContent("#nw"); got5.push(await page.evaluate((h) => window.__kabu.EVENTS.find((e) => e.n.startsWith(h)).n, h));
    await page.click((await answer()) ? "#buy" : "#sell"); await page.click("#next"); }
  check("挑戦状では、出した人と同じ5本が同じ順に出る", got5.join() === played.join(), got5.join(" / "));
  check("挑戦状の結果に、相手の成績と勝ち負けが出る（全部当てれば勝ち）", /挑戦状の相手は/.test(await page.textContent("#screen")) && /あなたの勝ち/.test(await page.textContent("#screen")) && /^株ニュース5本勝負 挑戦状\n/.test((await page.textContent(".share")).trim()));
  check("挑戦状を遊び終えると、URL から挑戦状が消える（同じ挑戦状が何度も出ない）", !/\?c=/.test(page.url()), page.url());
  for (const bad of ["?c=zzz-1-2-3-4", "?c=1-1-2-3-4", "?c=<b>", "?c=1-2-3-4-5&p=abc"]) {
    await page.goto(url + bad); const n = await page.locator(".dare").count();
    const okP = bad.includes("p=abc") ? n === 1 && !/相手は/.test(await page.textContent(".dare")) : n === 0;
    check(`おかしな挑戦状のリンク（${bad}）は無視する`, okP); }
  await page.goto(url);
  check("遊んでいる間にページのエラーが無い", errors.length === 0, errors.join(" / "));

  // 5b. 今日の5本の記録が壊れない（0時をまたぐ・別のタブ・途中で問題が変わらない）
  const ctxDay = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const pd = await ctxDay.newPage();
  await pd.clock.install({ time: new Date("2026-11-03T14:58:00Z") }); // 日本時間 23:58
  await pd.goto(url); await pd.click("#go");
  await pd.click("#buy"); await pd.click("#next");
  const cur = await pd.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).cur);
  check("途中の記録に5本の一覧と始めた日が入る（問題が入れ替わらない）", cur && cur.list?.length === 5 && cur.day === "2026-11-03", JSON.stringify(cur?.day));
  await pd.clock.setSystemTime(new Date("2026-11-03T15:02:00Z")); // 日本時間 翌 0:02
  for (let i = 1; i < 5; i++) { await pd.click("#buy"); await pd.click("#next"); }
  const recDays = await pd.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("kabu-news-v1")).days));
  check("0時をまたいでも、始めた日の記録になる（次の日の5本は遊べる）", recDays.join() === "2026-11-03" && /^株ニュース5本勝負 第1回（11\/3）\n/.test((await pd.textContent(".share")).trim()), recDays.join());
  await pd.click("#tohome");
  check("0時をまたいだあと、次の日の「今日の5本」が始められる", /今日の5本をはじめる/.test(await pd.textContent("#go")));
  await pd.click("#go");
  for (let i = 0; i < 5; i++) { await pd.click("#buy"); await pd.click("#next"); }
  const days2 = await pd.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("kabu-news-v1")).days).sort());
  check("次の日の「今日の5本」を最後まで遊ぶと、次の日の記録になる", days2.join() === "2026-11-03,2026-11-04", days2.join());
  await ctxDay.close();

  // 5c. あとから遊ぶ（取りこぼした日）。今日はふだん 12/2（月をまたぐ）。QA_LATE_TODAY で別の日にも変えられる
  await lateChecks();

  const ctxTab = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const ta = await ctxTab.newPage(), tb = await ctxTab.newPage();
  await ta.goto(url); await tb.goto(url);
  await ta.click("#go"); // 古いタブで途中まで
  await tb.click("#go");
  for (let i = 0; i < 5; i++) { await tb.click("#sell"); await tb.click("#next"); }
  const saved = await tb.evaluate(() => Object.values(JSON.parse(localStorage.getItem("kabu-news-v1")).days)[0]);
  await tb.evaluate(() => { const d = JSON.parse(localStorage.getItem("kabu-news-v1")); d.best = 0; localStorage.setItem("kabu-news-v1", JSON.stringify(d)); }); // 書き換えられたら分かるように 0 にする
  await ta.click("#buy");
  const after = await ta.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")));
  check("別のタブで今日の5本を終えたら、古いタブが記録を消さない", Object.values(after.days)[0]?.pct === saved.pct && after.plays === 1 && !after.cur, JSON.stringify({ plays: after.plays, cur: !!after.cur }));
  check("途中のタブの持ち金で最高記録を書き換えない", after.best === 0, String(after.best));
  const shareA = (await ta.textContent(".share")).trim();
  check("古いタブで答えると、結果画面と共有の文は先に保存した記録になる", shareA === saved.text.replace(/\n[^\n]*github\.io[^\n]*$/, "").trim(), shareA);
  await ctxTab.close();

  const ctxCur = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const ca = await ctxCur.newPage(), cb = await ctxCur.newPage();
  await ca.goto(url); await ca.click("#go"); await ca.click("#buy"); await ca.click("#next"); // 1本目まで
  await cb.goto(url); await cb.click("#go"); // 続きから
  for (let i = 0; i < 2; i++) { await cb.click("#sell"); await cb.click("#next"); } // 3本目まで
  await ca.click("#buy"); // 古いタブで2本目に答えようとする
  const c1 = await ca.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).cur);
  check("古いタブで答えても、先に進んだ途中の記録を戻さず、その続きに合わせる", c1?.t === 3 && c1.marks.length === 3 && (await ca.locator(".steps i:nth-child(4).on").count()) === 1, String(c1?.t));
  await ctxCur.close();

  // 2つのタブで同時に始め、片方が先に答えたあと、もう片方で別の答えをしても、先の答えが残る
  const ctxRace = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const ra = await ctxRace.newPage(), rb = await ctxRace.newPage();
  await ra.goto(url); await rb.goto(url);
  await ra.click("#go"); await rb.click("#go"); // どちらも1本目
  await ra.click("#buy"); await ra.click("#next");
  const firstMarks = await ra.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).cur.marks.join(""));
  const firstMoney = await ra.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).cur.money);
  await rb.click("#sell"); // 古いタブで1本目に別の答え
  const r1 = await rb.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).cur);
  check("同時に始めた古いタブで別の答えをしても、先の答えが変わらない", r1.t === 1 && r1.marks.join("") === firstMarks && (await rb.locator(".steps i:nth-child(2).on").count()) === 1, JSON.stringify({ t: r1.t, m: r1.marks.join("") }));
  for (let i = 1; i < 5; i++) { await rb.click("#sell"); await rb.click("#next"); }
  const rd = await rb.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")));
  check("そのまま古いタブで最後まで遊ぶと、記録の1本目は先の答えのまま", Object.values(rd.days)[0]?.marks.startsWith(firstMarks) && rd.plays === 1, Object.values(rd.days)[0]?.marks);
  const rdDay = Object.values(rd.days)[0], rbShown = await rb.evaluate(() => document.querySelector(".share").textContent);
  check("競合のあとも、記録の損益（pct）が画面の共有文と同じ", rdDay && rbShown.includes(`（${rdDay.pct >= 0 ? "+" : ""}${rdDay.pct}%）`) && typeof firstMoney === "number", `${rdDay?.pct} / ${rbShown}`);
  await ctxRace.close();

  // 保存が途中で失敗しても（容量いっぱいなど）、前の問題に戻らず最後まで遊べる
  const ctxFull = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const pf = await ctxFull.newPage();
  await pf.goto(url); await pf.click("#go"); await pf.click("#buy"); await pf.click("#next");
  await pf.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("QuotaExceededError"); }; });
  for (let i = 1; i < 5; i++) { await pf.click("#buy"); await pf.click("#next"); }
  const fullShare = (await pf.textContent(".share")).trim(), fullMoney = await pf.evaluate(() => man(G.money)); // 画面の持ち金（万円つき）
  check("保存が途中で失敗しても、前の問題に戻らず最後まで遊べる", (await pf.locator(".share").count()) === 1 && /^株ニュース5本勝負 第\d+回（\d+\/\d+）\n[🎯💥😶]{5}\n100万円 → /u.test(fullShare), fullShare);
  check("保存が失敗しても、共有文の持ち金が画面の持ち金と同じ", fullShare.includes(`→ ${fullMoney}`), `${fullMoney} / ${fullShare}`);
  await ctxFull.close();

  // 6. 記録が使えない端末（プライベートモードなど）でも遊べる
  const ctxNo = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctxNo.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
  const pn = await ctxNo.newPage(); const errNo = []; pn.on("pageerror", (e) => errNo.push(e.message));
  await pn.goto(url); await pn.click("#go");
  for (let i = 0; i < 5; i++) { await pn.click("#buy"); await pn.click("#next"); }
  check("記録が使えなくても最後まで遊べる", (await pn.locator(".share").count()) === 1 && errNo.length === 0, errNo.join(" / "));
  await ctxNo.close();

  // 7. スマホ幅で横にはみ出さない（はじめ・ニュース・結果・終わり）
  const wide = [];
  for (const w of [320, 375, 390, 430]) {
    const p = await browser.newPage({ viewport: { width: w, height: 700 } });
    await p.goto(url);
    const over = async (where) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(`${w}:${where}`); };
    await over("はじめ"); await p.click("#go"); await over("ニュース");
    for (let i = 0; i < 5; i++) { await p.click("#sell"); if (i === 0) await over("結果"); await p.click("#next"); }
    await over("終わり");
    if (w === 390) { mkdirSync(path.join(root, "qa-report"), { recursive: true }); await p.screenshot({ path: path.join(root, "qa-report", "end-390.png"), fullPage: true }).catch(() => {}); }
    await p.close();
  }
  check("スマホ幅（320〜430）で横にはみ出さない", wide.length === 0, wide.join(","));

  // 8. PWA：ホーム画面に置ける形と、一度開けば電波が無くても遊べる（http で開いて確かめる）
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png" };
  let down = false;
  const server = http.createServer((req, res) => {
    if (down) { res.writeHead(503); res.end("down"); return; }
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.join(root, rel);
    if ((file !== root && !file.startsWith(root + path.sep)) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  try {
    const pw = await ctx.newPage();
    const errPw = []; pw.on("pageerror", (e) => errPw.push(e.message));
    await pw.goto(base);
    const mf = await pw.evaluate(async () => { const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href"); return href ? (await fetch(href)).json() : null; });
    const icons = mf?.icons || [];
    check("manifest に名前・開く場所・アプリ表示・192と512のアイコンがある", mf && mf.name === "株ニュース5本勝負" && mf.start_url && mf.display === "standalone"
      && ["192x192", "512x512"].every((sz) => icons.some((i) => i.sizes === sz)) && icons.some((i) => i.purpose === "maskable"), JSON.stringify(mf));
    const iconOk = await pw.evaluate(async (l) => (await Promise.all(l.map((i) => fetch(i.src).then((r) => r.ok && r.headers.get("content-type") === "image/png")))).every(Boolean), icons);
    check("アイコンの画像が取れる", iconOk);
    // sw.js は https の github.io でだけ入れるので、検査では手で入れる
    await pw.evaluate(() => navigator.serviceWorker.register("sw.js"));
    await pw.evaluate(() => navigator.serviceWorker.ready);
    await pw.reload(); await pw.waitForFunction(() => !!navigator.serviceWorker.controller);
    check("sw.js が入り、画面を受け持つ", await pw.evaluate(() => !!navigator.serviceWorker.controller));
    const shell = readFileSync(path.join(root, "sw.js"), "utf8");
    const need = [...html.matchAll(/<script src="([^":]+)"/g)].map((m) => m[1]).filter((f) => !shell.includes(`"./${f}"`));
    check("画面が読むファイルが sw.js の SHELL にそろう", need.length === 0, need.join(","));
    await ctx.setOffline(true);
    const offErr = await pw.reload().then(() => "", (e) => e.message.split("\n")[0]);
    check("電波が無くてもはじめの画面が開く", !offErr && (await pw.locator("#go").count()) === 1, offErr);
    if (!offErr) await pw.click("#go");
    check("電波が無くても遊べる（ニュースが出る）", (await pw.locator(".news").count()) === 1);
    await ctx.setOffline(false); down = true;
    const downErr = await pw.goto(base).then(() => "", (e) => e.message.split("\n")[0]);
    check("サーバーが 503 を返しても、保存した画面が開く", !downErr && (await pw.locator("#go").count()) === 1, downErr);
    down = false;
    check("PWA の確かめでページのエラーが無い", errPw.length === 0, errPw.join(" / "));
  } finally { await ctx.close(); server.close(); }
} catch (e) {
  check("QA の実行が途中で止まった", false, String(e.message || e).split("\n")[0]);
} finally {
  try { // 引き継ぎコード（別の端末へ記録を移す。shared-workflows template/qa/transfer-check.mjs）
    await checkTransfer({ browser, url, game: "kabu-news", sample: { "kabu-news-v1": JSON.stringify({ xp: 3 }) }, check });
  } catch (e) { check("引き継ぎコード", false, e.message.split("\n")[0]); }
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
const md = ["# QA 株ニュース5本勝負", "", ...results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`), "", failed.length ? `❌ ${failed.length}件失敗` : "✅ 全部通った"].join("\n");
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report", "report.md"), md + "\n");
console.log(md);
process.exit(failed.length ? 1 : 0);
