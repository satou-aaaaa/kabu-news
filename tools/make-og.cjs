// SNS で貼られたときの絵（og.png 1200×630）を作る。答え（会社名・ニュース）は入れない。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<body style="margin:0;font-family:'IPAPGothic','Noto Sans CJK JP',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:70px 80px;background:radial-gradient(circle at 50% 0,#2d2766,#161a33 75%);color:#f6efe0;position:relative;overflow:hidden">
    <div style="position:absolute;left:0;right:0;top:0;height:14px;background:#f4c04e"></div>
    <div style="font-size:34px;color:#f4c04e;font-weight:700;letter-spacing:.08em">だれでも同じ 1日5本・3分</div>
    <div style="font-size:104px;font-weight:900;margin-top:18px;letter-spacing:.02em">株ニュース5本勝負</div>
    <div style="font-size:44px;margin-top:26px;line-height:1.5">ニュースを読んで、株が<span style="color:#ff6a5e;font-weight:900">上がる</span>か<span style="color:#6aa6ff;font-weight:900">下がる</span>か。<br>100万円をどこまで増やせる？</div>
    <div style="position:absolute;left:80px;bottom:60px;font-size:64px;letter-spacing:.12em">🎯💥🎯😶🎯</div>
    <svg style="position:absolute;right:70px;bottom:50px" width="330" height="170" viewBox="0 0 330 170"><polyline points="10,150 80,110 140,128 210,60 300,20" fill="none" stroke="#e5483d" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><polygon points="270,10 320,10 320,60" fill="#e5483d"/></svg>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
