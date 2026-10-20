# AGENTS.md — デザインレイヤー

このリポジトリは [modelroom](https://github.com/modelroom/modelroom) を使っています。
1画面につき1つの room を作り、理由・見えない仕様・約束・artifact を分けて保ちます。

あなたはデザインレイヤー（`modelroom/`）の中で作業しています。room の文章は日本語で書いてください。

## 書き込んでよい場所

- `rooms/<room>/BRIEF.md` — この room が存在する理由
- `rooms/<room>/SPEC.md` — artifact では見えないこと（デバイス、状態、制約、使ってよいもの）
- `rooms/<room>/BEHAVIOUR.md` — 何を約束するか（操作と結果）
- `rooms/<room>/index.html` — artifact そのもの

`rooms/<room>/index.png` は artifact を描画したものです。手で編集せず、
`npx modelroom render <room>` で生成し、html と一緒にコミットします。

room の追加・改名・削除は CLI（`npx modelroom add|rename|remove`）、またはツール UI の
追加ボタンと room メニューで行います（同じコードです）。ディレクトリ名が room そのもので、
その room への参照も一緒に動かす必要があります。

それ以外は書き込まないでください。このディレクトリの外には出ないでください。
デザインレイヤーはアプリケーションのコードを読みません。アプリケーションに渡すのは
このレイヤーであり、その逆ではありません。

## レイヤーのデザインルール

`DESIGN.md` に、room をまたいで共有するものを置きます — トークン、コンポーネント、
アクセシビリティの下限です。room はそこから取り、取ったものを `SPEC.md` に書きます。
すでにある色やコンポーネントを room 側で作り直してはいけません。`DESIGN.md` を変えるのは、
判断が本当にレイヤー全体に及ぶときだけです — そうでなければその room に属します。

デザインシステムの MCP サーバがある場合、それも `DESIGN.md` に書きます。サーバ自体の設定は
`opencode.json` で、OpenCode がこのレイヤーから読みます。マークアップを書く前に、そのツールで
コンポーネントとトークンを調べてください。

## 進め方

1. まず room の `BRIEF.md` を読み、次に `SPEC.md` と `BEHAVIOUR.md` を読みます。
2. それらに合うように artifact を変えます。仕様が間違っているなら、黙って書き換えず、
   間違っていると伝えてください。
3. artifact は自己完結にします。CDN、Webフォント、フレームワーク、ビルド手順は使いません。
   実装に渡すものなので、単体で成立する必要があります。
4. `SPEC.md` に、artifact を見れば分かることを書き直さないでください。同じ約束を2つの
   ファイルにコピーせず、id（`@verb-1`）で参照します。
5. 実際のシステムが必要とする約束（レコード、タイムスタンプ、権限）は、このレイヤーには
   置きません。
6. `index.html` を変えたら `npx modelroom render <room>` を実行し、`index.png` を一致
   させます。レビューされるのは画像です。古いスナップショットは、コミットしないより
   悪い状態です。

## 画像が成果物です

その room のレビュー対象は docs とスナップショットであり、マークアップではありません。
見た目を変えないはずの変更（アクセシビリティ対応、ピクセルを動かしてはいけない
リファクタ）では、`npx modelroom render <room> --check` がピクセル不変を証明します —
一時ファイルに描画して比較します。逆に、見た目を変える変更は新しい `index.png` を
残し、PR がそれを表示します。

このレイヤーには3つのスキルが `.agents/skills/` に付いてきます:

- `read-modelroom` — 変更の前に、docs **と画像**を読む。
- `create-modelroom-pr` — まずスナップショットを取り、画像・コンテキスト・BEHAVIOUR を
  載せた PR を作る。
- `manage-modelroom-rooms` — 参照を壊さずに room を作成・改名・削除する。

スナップショットは固定名（`index.png`）で、その場で上書きします。そうすることで
GitHub が PR で画像の差分を表示できます。マージは **Squash and Merge** で行います —
main には最終の1枚だけが残り、中間の画像は git が回収します。

## 決まりごと

- frontmatter のキー（`title`、`status`、`summary`、`tags`）と約束の id（`@verb-1`）は、
  文章がどの言語でも英語のままにします。
- ダッシュボードに状態を出したいときは、`BRIEF.md` に `status: draft|review|adopted` を
  足します。`adopted` に変えるのは人間の判断で、あなたの判断ではありません。

理由は modelroom パッケージの `docs/02-convention.md` にあります。
