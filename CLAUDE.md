# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code への指示書です。実装の前に必ず読んでください。

## プロジェクト概要

- **MadoriApp**: 一軒家の間取りを3案生成するWebアプリ。アイデア出し用で、建築基準法・構造の厳密さは対象外。ただし「それっぽく見える」ことが重要
- 経緯: Muse のスペース（静的ページ）で作った単一HTML版が原型。React + TypeScript への移植は完了し、main にマージ済み
- 原型（スペース版）は `legacy/index.html` に保存してある。挙動の正解として参照するもので、削除しない

## 技術スタック

- React 19 / TypeScript（strict）/ Vite / Tailwind CSS v4（@tailwindcss/vite）
- テスト: vitest
- パッケージ管理: npm

## コマンド

```bash
npm install   # 依存インストール
npm run dev   # 開発サーバー
npm run build # 型チェック + 本番ビルド
npm test      # vitest
```

## アーキテクチャ

- `src/core/`: 生成ロジックの中核。**フレームワーク非依存の純TypeScript**。React・DOM・ブラウザAPIに依存しないこと（Node/vitest でそのまま動く状態を保つ）
  - `types.ts`: 部屋・プラン・入力などの型定義
  - `rng.ts`: seed付き乱数（mulberry32系）。再現性の要
  - `rooms.ts`: 部屋種別の定義（目標/最小/最大面積）、居室（HABITABLE）・通り抜け可否（VIA）、cell ヘルパ
  - `slicing.ts`: 固定3帯構成の割り付け。`waterfill`（clamp付き二分探索 + 最大剰余法）、`layoutBand`（帯内の幅配分。余りは吸収セルへ、溢れたら結合できるクラスタ（玄関+土間 → キッチン+パントリー）を順に結合して再試行）、`layoutFloor`（帯の高さ配分。`{ rooms, heights }` を返し、`capH` で帯の高さの上限を指定できる）、`footprintList`（外形候補。既定は上位10件）。汎用のスライシング木（H/V再帰分割・measure/allocate/solve）は**未実装**
  - `program.ts`: 実現可能性判定（`feasibility`）と、生成0案時の診断（`diagnoseEmpty`: どの階が崩れたかの理由と、`generatePlans` が実際に3案を返すことを確かめた代替案を最大3件）。入力 → 部屋プログラムの変換は archetypes.ts の `bandsFor` が担う
  - `archetypes.ts`: アーキタイプ（`bandsFor` が帯ごとのクラスタ列を返す）、`applyVariant`（変種 `Variant` の適用。ユニット単位の並べ替え・階段の東西・2F個室の南北配分）、`buildPlan`（外形と変種に当てはめて1案を組み立てる。1F→2Fの順に組み、階段の1F/2F一致・吹抜がLDK直上（x・y とも。吹抜ありは2F南帯の高さを1F南帯以下に抑える）に収まるかをここで検査し、満たさなければ null）
  - `derive.ts`: 隣接グラフからのドア・窓の自動生成
    - ドア除外表 `NO_DOOR_PAIRS` / `PAIR_OK_PAIRS` は `[RoomType, RoomType]` のペア配列で、`pairKey`（アルファベット順に正規化）の Set で照合する。以前は文字列キーを手書きしており、`entry-bath` / `ldk-bath` / `master-bath` / `bed-bath` / `void-stair` が正規形（`bath-entry` 等）と一致せず、ドア除外が効いていなかった。このうち実際に `doorOK` の結果が変わるのは `bath-entry` と `bath-ldk` の2ペアだけ（entry・ldk が VIA のため、以前は true になっていた）で、固定3帯構成では hall 帯を挟むため隣接せず、生成結果は1件も変わらない潜在バグだった（修正前後で gen-v2 fixture 無変更）。残りの `bath-master` / `bath-bed` / `stair-void` は、VIA でも PAIR_OK でもない、または void を含むため、元々 false で結果は変わらない。将来スライシング木・L字外形を入れるとこれらのペアが隣接しうるので、その時点で表に出る。定義は `derive.test.ts` で正規形を検査している
  - `validate.ts`: ハード制約の検証（違反は棄却）。実装済みは、全室への到達可能性・居室の外壁接触・最低面積のみ（階段・吹抜の整合は buildPlan 側、水回り隣接は未実装）
  - `score.ts`: ソフトスコア
  - `diversity.ts`: 3案の多様性選抜
  - `describe.ts`: プランの名前・特徴タグ生成
  - `generate.ts`: パイプライン全体の統括。`candidatePool`（seed 非依存の全候補。メモ化。変種は適用後の帯構成が同一のものを列挙前に省く。readonly は配列レベルのみ）、`dedupeBySig`（反転込みの重複除去）、`selectPlans`（seed による選抜）、`generatePlansUncached`（診断用。キャッシュに入れない）。`GEN_VERSION` もここ
  - `enumerate.ts`: 候補ギャラリー用。`enumeratePlans`（候補プールのコピー）、`galleryPlans`（多様性優先で上位24案）。`planKey`（v2 は `arch-WxH-<変種>`、変種なしは v1 の `arch-WxH`）の生成・解析と、key からの再構築（`planFromKey`。v1 の key は null）もここ
  - `explain.ts`: 間取りの解説文 `explainPlan`（純関数）。スコア内訳・配置・入力だけから2〜3文を作り、当てはまらない特徴は書かない。階段と個室の関係は階ごとに `ROOM[type].cat === 'bed'`（書斎・和室を含む）で判定。弱点（廊下が長い・縦横比・面積適合）がある案は必ず触れる（枠が足りなければ階段の文と1文にまとめる）。LDK の畳数はキッチン独立案ではキッチンを含む。割合は小数1桁に切り捨て。しきい値は `EXPLAIN_TH`
  - `furnish.ts`: 家具の決定的な自動配置（純関数）。ドア開き・対面キッチンのカウンター・部屋名ラベル・既配置家具を避け、置けなければ置かない。ドア開き半径 `DOOR_R` は `derive.ts` にあり、FloorSvg と共有する
- `src/components/`: React UI（入力フォーム、PlanCard、SVG図面、拡大モーダル）
- `src/lib/`: URLハッシュ（`hash.ts`。`c` = 入力+seed+v、`p` = 開く案の planKey）、`seedNav.ts`（別の3案で組が変わる seed を探す）、`favorites.ts`（お気に入りの保存形式・上限30件・壊れたデータの復旧。ストレージは getItem/setItem を引数で受ける）、`metrics.ts`（比較表の指標）、`randomCondition.ts`（おまかせ条件。実現可能かつ `generatePlans` が3案を返す条件だけを返す）、`features.ts`（こだわり8種のキー・ラベルの唯一の定義）、フォーマット、階クランプなどUI補助。`src/core/testing.ts` はテスト共有の条件セットと独立検証（クラスタの辺共有・階段x一致・吹抜⊂LDK を含む）
  - `flow.ts`: 動線（来客: 玄関→LDK、生活: LDK→洗面・浴室）の計算 `computeFlows`（純関数、`src/core/` ではなく `src/lib/`）。ドアでつながる部屋の最短経路。中継は VIA 室だけを優先し、VIA だけで届かないときに限り `NON_VIA_PENALTY` を課して VIA 以外を通す。階をまたぐ区間は階段までを描く
  - `exportPng.ts`: SVG → PNG 書き出し。文字列処理（`buildExportSvg` など。置換は関数 replacer／slice 連結で `$` を壊さない）とブラウザ API（`svgElementToPng`・`downloadBlob`）を分けている。ObjectURL の解放は `REVOKE_DELAY_MS`（60秒）後
  - 追加UI: `Gallery`（候補。上位24案／全N案）、`FavoritesShelf`（お気に入り棚＋比較）、`StarButton`、`Furniture`（拡大表示のみ・「家具を表示」トグル）、`FlowOverlay`（動線の重ね表示。拡大表示のみ。部屋ラベルより下に描き、凡例は FloorSvg が viewBox 下端に足す専用の帯に置く）。印刷は PlanCard の print 専用ブロックが全階を並べ、ボタンを含む文は no-print で文ごと隠す
- `src/App.tsx`: 画面の合成と状態管理（表示 seed の履歴は上限20でハッシュには入れない）

## 生成ロジックの不変条件（安易に変えないこと）

設計はClaude（Sonnet/Opus）との技術相談で確定済み。生成アルゴリズムを意図して変える場合は、`GEN_VERSION` を上げ、ゴールデンテスト（gen-v2 fixture）を更新すること（手順は「テスト方針」節）。現在は GEN_VERSION 2。

- 単位: **1セル = 455mm（半間）**。1畳 = 8セル²、1坪 = 16セル²。座標はすべて整数セル
- 骨格: **現状は固定3帯構成**（北帯 / ホール帯 / 南帯の3本の水平帯。1Fの階段は北帯、LDK等は南帯）。帯の高さ・帯内の幅の配分は clamp付き water-filling（二分探索）+ 最大剰余法。910mm寄せはスコアで扱う（座標のスナップはしない）。汎用スライシング木は将来の課題。アーキタイプ内の変種（クラスタ列の逆順・階段の東西・2F個室の南北配分）で幅を出す
- パイプライン: 候補プール（seed と無関係に全部作る: 派生（ドア・窓）→ ハード制約で検証・棄却 → スコア → 左右反転の重複除去）→ seed による選抜（最良から8点以内の窓・温度2の Gumbel-top-k・多様性しきい値0.16）で3案。seed は選抜にだけ使う
- ハード制約（実装済み）: 全室への到達可能性（通り抜け可否は部屋種別ごとの via 集合で判定）、居室の外壁接触（採光）、最低面積 — いずれも `validate.ts`。階段の1F/2F座標一致、吹抜がLDK直上（x・y とも）に収まること — こちらは `archetypes.ts` の `buildPlan` で検査
- ハード制約（**未実装**）: 水回りの隣接（水回り集約はスコアで緩く評価するのみ）
- スコアの重み初期値: 採光0.20 / 面積適合0.20 / 縦横比0.15 / 廊下率0.15 / ドア0.15 / 水回り集約0.10 / モジュール0.05
- テンプレートは部屋単位ではなくクラスタ単位（玄関+土間、キッチン+パントリー、主寝室+WIC など）
- seed で再現可能にする。入力 + seed + genVersion は URL ハッシュに保存する
- 無理な条件（例: 20坪+個室5）は黙って要素を落とさず、理由と代替案を UI に出す
- 帯高さの揺らぎ（water-filling の目標比を seed で振る）は採用しない（ほぼ重複しか増えず、吹抜違反が増えるため）
- v1スコープ: アーキタイプ3個（2階建て）/ 2個（平屋）、南道路のみ（道路方位は固定）、矩形外形のみ。中庭型・東西道路・L字外形は v2

## 今後の課題・既知の問題（現状は挙動を変えない）

- **階段の高さの食い違い**: 1F と 2F で階段の x・幅は一致させているが、y（帯の高さ）は階ごとに決まるため一致しない（GEN_VERSION 1 の案の約84%で発生）。揃えると0案が激増するため別課題
- **水回り隣接のハード制約**（GEN_VERSION 3 の課題）。GEN_VERSION 2 ではクラスタの辺の共有（洗面-浴室、主寝室-WIC、LDK-キッチン、玄関-土間）をテストの独立検証で確かめるに留めた
- 汎用スライシング木、3案が揃わない条件（0案になる境界条件が一定数ある。診断と代替案は `diagnoseEmpty`）の根本改善

### その他の見送り候補（v2 以降）

- アイソメ表示
- 好みプリセット（家事動線重視、収納重視 など）
- 北道路・東西道路、L字外形、中庭型
- 水回り隣接のハード制約
- 3案が揃わない境界条件（0〜2案）の改善
- 検討事項: ギャラリーの最遠点選択（`galleryPlans`）はスコアの低い案が混じりうる。スコア下限や重み付けを入れるか検討する（今回は仕様変更しない）

## コーディング規約

- TypeScript strict 前提。`any` の濫用禁止（境界で必要な場合は理由コメント）
- 帯・セルなどの入力データは破壊的に変更しない。`waterfill` に渡す items のように、内部で書き換える作業用データは関数内で新しく作る（将来スライシング木を導入する際は、measure のキャッシュが古い値を返さないよう木をイミュータブルに扱い、毎回新しく作る）
- `tsconfig.app.json` は `noUncheckedIndexedAccess: true`。配列・Record の添字アクセスは undefined を考慮し、非nullアサーション（`!`）で黙らせない
- UIテキストは日本語。コミットメッセージも日本語
- 描画品質は生成と同じくらい重要（壁の太さ、ドアの開き弧、窓、水回りの器具、階段の段と矢印、和室の畳目、部屋ラベルのサイズ出し分け）

## テスト方針

- golden は2本立て。**v1 の正解は `legacy/index.html`**（`src/core/golden.test.ts` が vm で実行し、`planName` / `planTags` / `feasibility` を比較する。`generatePlans` は GEN_VERSION 2 で生成方式が変わったため比較しない）。**v2 の出力は `src/core/__fixtures__/gen-v2.json`**（`golden-v2.test.ts`: 生成案65件・候補プールの件数/上位10件/ハッシュ・feasibility グリッド192条件の3案）
- アルゴリズムを意図して変える場合は、`GEN_VERSION` を上げたうえで `UPDATE_GOLDEN=1 npx vitest run src/core/golden-v2.test.ts` で fixture を書き出す。fixture の genVersion が現在の `GEN_VERSION` と同じまま中身だけ変わる更新は拒否される（`UPDATE_GOLDEN=force` のときだけ許可）
- core のテストを vitest で書く。最低限:
  - 人気条件（30坪/2階/個室3、30坪/平屋/個室3、35坪/2階/個室4）で複数 seed とも3案生成できる
  - 生成プランが validator のハード制約を満たす
  - 同じ seed + 入力で同じ結果になる（再現性）
- build と test が両方グリーンでない状態で「完了」と報告しない

## 禁止事項

- GitHub へのプッシュはしない（この実行環境には remote 認証がない。プッシュは Muse 側の連携で行う）
- `legacy/` を削除・改変しない
- 機能追加のついでに生成アルゴリズムの仕様変更をしない（バグを見つけたら、挙動変更の有無を報告に明記する。生成結果が変わる変更は `GEN_VERSION` を上げて別PRで扱う）

## 作業ブランチ

- 作業は機能ごとのフィーチャーブランチを切って行い、PR 経由で `main` に入れる。`main` へ直接コミットしない
