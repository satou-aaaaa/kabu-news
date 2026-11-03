# AGENTS.md

株ニュース5本勝負：架空の会社のニュースを読んで、株が上がるか下がるかを決める1日5本のゲーム。`index.html` と `data.js`（会社12社・ニュース・用語）を GitHub Pages で公開する。

## 準備（最初に一度）

```bash
bash scripts/setup.sh   # Node.js（版は .nvmrc）を確かめ、検査の依存とブラウザを入れる。何度実行してもよい
```

## push する前の確認

```bash
node qa/run.mjs   # データの形・5本の組み方（5000回）・持ち金の計算・続きから・記録・スマホ幅・PWA・エラーを見る（CI の QA と同じ）
```

## このリポジトリの決まり

- 会社とニュースは架空。実在の会社名・人名・銘柄コードを使わない。本物の株価を取りに行かない。投資の助言にしない（「この株を買うとよい」などを書かない）。
- お笑いの要素は入れない。会社名・ニュースは本物っぽく、値動きは実際の相場でありそうな向き（2026-11-03 見本に笑いを入れて「変にお笑い要素が入っている」と言われた。QA がお笑いの言葉を見る）。
- ニュース（`data.js` の `EVENTS`）は見出し `n`・なぜ動いたか `o` を22字以内、値動き `p` は ±1〜20%。用語 `t` は `TERMS` のキーで、説明は40字以内。上げと下げのニュースはどちらも4割以上に保つ。「予想どおりなのに下がる」のような、見出しの印象と逆に動く問題を2割くらい混ぜ、`x:1` の印を付ける（QA が割合を見る）。
- 「今日の5本」は日本時間の日付で決まり、だれでも同じ。会社は重ねず、上げと下げを最低1本ずつ入れる。途中で閉じても続きから（やり直しで結果を変えられない）。記録は始めた日に付け、保存の前に読み直す（0時をまたぐ・別のタブで消さない）。
- やり込み：今日の5本のあとに「上級の5本」（日付＋"h" の種で、だれでも同じ・いつも全力・ひねった問題 `x` を2本以上・1日1回、記録は `hdays`・`hcur` で今日の5本と別）。実績（`ACH`）は腕前と集めることに報い、まだのものは進み具合を出す。図鑑は練習も数え、腕前（ひねった問題・全力）は今日の5本と上級だけ数える。
- 感想：`.github/ISSUE_TEMPLATE/feedback.yml`（名前・メールは聞かない）を開くただのリンクを、終わりの画面と遊び方に置く。ゲームからは何も送らない。集まった感想の読み方は shared-workflows の手順書に従う。
- 復習：はずれたニュース（`miss`）を最大5本で解き直し、当てると消える。最高記録には数えない。
- 時間制限は付けない。文字は少なめ・一画面一問。共有の文に答え（会社名・ニュース）を出さない。
- 外へ通信しない。外から読むのは Google Fonts の文字だけ（CSP の `connect-src 'self'` を広げない）。スクリプト・広告・解析を入れない。記録は遊ぶ人のブラウザ（localStorage）だけ。
- 応援は Ko-fi（https://ko-fi.com/satouaaaaa）へのただのリンクだけ。遊ぶのは無料のまま、有料版は置かない（GitHub Pages は売り買いが主目的のサイトに使えない）。
- 機能を足す・直すたびに `qa/run.mjs` に検査を足す。乱数で動く部分は1回でなく何千回も試す（shared-workflows `incidents/2026-10-31-roppo-empty-village.md`）。
- PWA（`manifest.webmanifest`・`sw.js`・`icon-*.png`）：画面のファイルを足したら `sw.js` の `SHELL` にも足し、中身を大きく変えたら `CACHE` の版を上げる。アイコンは `node tools/make-icons.cjs` で作り直せる。SNS 用の絵 `og.png`（1200×630、答えを入れない）は `node tools/make-og.cjs`。X・LINE は遊ぶ人が押して開く投稿画面へのリンクだけにし、こちらから送らない。
- 公開リポジトリなので、個人情報・鍵を入れない。

## 公開

- GitHub Pages は `main` のルート（`/`）を公開する。PR の QA と Secret scan が ✅ になると `automerge.yml` が自動でマージする。止めたいときは下書きにするか、ラベル「自動マージしない」を付ける。
- `sw.js`・`manifest.webmanifest` を変える PR は自動ではマージされない（`hold_paths`）。CodeRabbit のレビューを待ち、手でマージする直前に今の head へのレビューを読み直す（shared-workflows `incidents/2026-11-01-roppo-merged-before-review.md`）。CodeRabbit は星の少ないリポジトリを自動では見ないので、PR に `@coderabbitai review` とコメントして頼む。

## 共通のきまり

- PR の作り方・マージの仕方は satou-aaaaa/shared-workflows の `routines/pr.md`、全体のきまりは `routines/common.md` に従う。
- CI の部品は shared-workflows の共通部品を呼ぶ。リポジトリ側の .github/workflows には呼び出しと設定値だけを書く。
- Claude 以外の AI・人が作業するときは、shared-workflows の `routines/tool-map.md` と `routines/without-claude.md` を読む。
