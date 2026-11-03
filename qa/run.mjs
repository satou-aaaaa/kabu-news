// 株ニュース5本勝負の検査。データの形・5本の組み方（何千回）を確かめ、index.html をブラウザで開いて遊び方・記録・スマホ幅・PWA を確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import http from "node:http";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = "file://" + path.join(root, "index.html");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

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
const unused = Object.keys(TERMS).filter((k) => !EVENTS.some((e) => e.t === k));
check("どの用語もどこかのニュースで出てくる", unused.length === 0, unused.join(","));
check("用語の説明は40字以内", Object.values(TERMS).every(([n, d]) => [...d].length <= 40), Object.values(TERMS).filter(([, d]) => [...d].length > 40).map(([n]) => n).join(","));
// 笑いを無理に入れない（2026-11-03「変にお笑い要素が入っている」で直した。同じ言葉を戻さない）
const silly = /お笑い|ギャグ|ボケ|ツッコミ|スベ|ウケ|なんでやねん/;
const sillyHit = [...COMPANIES.map((c) => c.n), ...EVENTS.flatMap((e) => [e.n, e.o])].filter((t) => silly.test(t));
check("会社名・ニュースにお笑いの言葉を入れない（本物っぽく）", sillyHit.length === 0, sillyHit.join(","));
const html = readFileSync(path.join(root, "index.html"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$/.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない", ext.length === 0, ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const isNoise = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::ERR_/.test(t);
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
  check("はじめの画面に「今日の5本をはじめる」", /今日の5本をはじめる/.test(await page.textContent("#go")));
  await page.click("#go");
  const list = await page.evaluate(() => { const s = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return window.__kabu.build(s(d)).map((e) => e.p); });
  const plan = [["buy", false], ["sell", false], ["pass", false], ["buy", true], ["sell", true]];
  let money = 1000000; const marks = [];
  for (let i = 0; i < 5; i++) {
    const [act, all] = plan[i], side = { buy: 1, sell: -1, pass: 0 }[act];
    if (i === 2) { // 途中で開き直しても続きから（やり直しで結果を変えられない）
      await page.reload();
      check("途中で開き直すと「続き（3本目から）」になる", /続き（3本目から）/.test(await page.textContent("#go")));
      await page.click("#go");
    }
    if (all) await page.check("#all", { force: true });
    await page.click("#" + act);
    money += Math.round(money * (all ? 1 : .5) * side * list[i] / 100);
    marks.push(side === 0 ? "😶" : Math.sign(list[i]) === side ? "🎯" : "💥");
    if (i === 0) {
      const term = await page.locator(".result .term b").textContent();
      check("結果の画面に「なぜ動いたか」と用語の説明が出る", (await page.locator(".why").textContent()).length > 3 && term.length > 1);
    }
    await page.click("#next");
  }
  const share = await page.textContent(".share");
  const man = (v) => (Math.round(v / 1000) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
  check("持ち金の計算が合う（半分・全力・見送り）", share.includes(`100万円 → ${man(money)}`), `${share.split("\n")[2]} / 期待 ${man(money)}`);
  check("共有の文は「題・絵文字5つ・持ち金・称号」", new RegExp(`^株ニュース5本勝負 \\d+/\\d+\\n${marks.join("")}\\n100万円 → .+（[+-]?\\d+%）\\n.+$`, "u").test(share.trim()), share);
  check("共有の文に答え（ニュースや会社名）が出ない", !list.length || !(await page.evaluate(() => window.__kabu.COMPANIES.some((c) => document.querySelector(".share").textContent.includes(c.n)))));
  check("終わりの画面に今日出てきた言葉が並ぶ", (await page.locator(".words .term").count()) >= 1);

  // 4. 記録：もう一度開くと「練習でもう一回」・遊んだ日1・的中率
  await page.reload();
  check("今日の5本は1日1回（開き直すと練習になる）", /練習でもう一回/.test(await page.textContent("#go")));
  const st = await page.locator(".stats b").allTextContents();
  const bets = plan.filter(([a]) => a !== "pass").length, hits = marks.filter((m) => m === "🎯").length;
  check("記録：遊んだ日1・連続1日・的中率", st[0] === "1" && st[1] === "1" && st[2] === `${Math.round(hits / bets * 100)}%`, st.join(","));
  check("この7日のグラフに今日の分が出る", (await page.locator(".week span").count()) === 1);
  await page.click("#how");
  check("遊び方の画面に覚えた言葉がたまる", (await page.locator(".words .term b").count()) >= 1);
  await page.click("#back");

  // 5. 練習は何度でも・記録の「遊んだ日」は増えない。キーボード（1・2・3）でも遊べる
  await page.click("#go");
  for (let i = 0; i < 5; i++) { await page.keyboard.press(String(1 + (i % 3))); await page.click("#next"); }
  check("練習を最後まで遊べて、共有の文が「練習」になる", /^株ニュース5本勝負 練習/.test((await page.textContent(".share")).trim()));
  await page.click("#tohome");
  check("練習では遊んだ日が増えない", (await page.locator(".stats b").first().textContent()) === "1");
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
  check("0時をまたいでも、始めた日の記録になる（次の日の5本は遊べる）", recDays.join() === "2026-11-03" && /^株ニュース5本勝負 11\/3\n/.test((await pd.textContent(".share")).trim()), recDays.join());
  await pd.click("#tohome");
  check("0時をまたいだあと、次の日の「今日の5本」が始められる", /今日の5本をはじめる/.test(await pd.textContent("#go")));
  await pd.click("#go");
  for (let i = 0; i < 5; i++) { await pd.click("#buy"); await pd.click("#next"); }
  const days2 = await pd.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("kabu-news-v1")).days).sort());
  check("次の日の「今日の5本」を最後まで遊ぶと、次の日の記録になる", days2.join() === "2026-11-03,2026-11-04", days2.join());
  await ctxDay.close();

  const ctxTab = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const ta = await ctxTab.newPage(), tb = await ctxTab.newPage();
  await ta.goto(url); await tb.goto(url);
  await ta.click("#go"); // 古いタブで途中まで
  await tb.click("#go");
  for (let i = 0; i < 5; i++) { await tb.click("#sell"); await tb.click("#next"); }
  const bPct = await tb.evaluate(() => { const d = JSON.parse(localStorage.getItem("kabu-news-v1")); return Object.values(d.days)[0].pct; });
  await ta.click("#buy"); await ta.click("#next");
  const after = await ta.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")));
  check("別のタブで今日の5本を終えたら、古いタブが記録を消さない", Object.values(after.days)[0]?.pct === bPct && after.plays === 1 && !after.cur, JSON.stringify({ plays: after.plays, cur: !!after.cur }));
  for (let i = 1; i < 5; i++) { await ta.click("#buy"); await ta.click("#next"); }
  const savedText = Object.values(after.days)[0]?.text.replace(/\n[^\n]*github\.io[^\n]*$/, "");
  check("古いタブで終えても、結果画面と共有の文は先に保存した記録のまま", (await ta.textContent(".share")).trim() === savedText.trim(), (await ta.textContent(".share")).trim());
  await ctxTab.close();

  const ctxCur = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const ca = await ctxCur.newPage(), cb = await ctxCur.newPage();
  await ca.goto(url); await ca.click("#go"); await ca.click("#buy"); await ca.click("#next"); // 1本目まで
  await cb.goto(url); await cb.click("#go"); // 続きから
  for (let i = 0; i < 2; i++) { await cb.click("#sell"); await cb.click("#next"); } // 3本目まで
  await ca.click("#buy"); // 古いタブで2本目に答える
  const curT = await ca.evaluate(() => JSON.parse(localStorage.getItem("kabu-news-v1")).cur?.t);
  check("古いタブで答えても、先に進んだ途中の記録を戻さない（答えた問題をやり直せない）", curT === 3, String(curT));
  await ctxCur.close();

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
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
const md = ["# QA 株ニュース5本勝負", "", ...results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`), "", failed.length ? `❌ ${failed.length}件失敗` : "✅ 全部通った"].join("\n");
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report", "report.md"), md + "\n");
console.log(md);
process.exit(failed.length ? 1 : 0);
