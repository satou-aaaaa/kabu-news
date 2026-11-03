// アプリのアイコン（icon-192.png・icon-512.png）を作る。夜の藍色に、赤い上げのチャートと金の矢印。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="g" cx="50%" cy="0%" r="110%"><stop offset="0" stop-color="#2d2766"/><stop offset=".75" stop-color="#161a33"/></radialGradient></defs>
      <rect width="100" height="100" fill="url(#g)"/>
      <rect x="18" y="22" width="64" height="56" rx="6" fill="#f6efe0"/>
      <polyline points="26,64 38,56 48,60 60,44 74,34" fill="none" stroke="#e5483d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <polygon points="66,30 78,30 78,42" fill="#e5483d"/>
      <rect x="18" y="16" width="64" height="7" rx="3" fill="#f4c04e"/></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
