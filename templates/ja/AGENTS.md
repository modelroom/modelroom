# AGENTS.md — デザインレイヤー

このリポジトリは [modelroom](https://github.com/modelroom/modelroom) を使っています。
1画面につき1つの room を作り、理由・見えない仕様・約束・artifact を分けて保ちます。

あなたはデザインレイヤー（`modelroom/`）の中で作業しています。room の文章は日本語で書いてください。

## 書き込んでよい場所

- `rooms/<room>/BRIEF.md` — この room が存在する理由
- `rooms/<room>/SPEC.md` — artifact では見えないこと（デバイス、状態、制約、使ってよいもの）
- `rooms/<room>/BEHAVIOUR.md` — 何を約束するか（操作と結果）
- `rooms/<room>/index.html` — artifact そのもの

それ以外は書き込まないでください。このディレクトリの外には出ないでください。
デザインレイヤーはアプリケーションのコードを読みません。アプリケーションに渡すのは
このレイヤーであり、その逆ではありません。

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

## 決まりごと

- frontmatter のキー（`title`、`status`、`summary`、`tags`）と約束の id（`@verb-1`）は、
  文章がどの言語でも英語のままにします。
- ダッシュボードに状態を出したいときは、`BRIEF.md` に `status: draft|review|adopted` を
  足します。`adopted` に変えるのは人間の判断で、あなたの判断ではありません。

理由は modelroom パッケージの `docs/02-convention.md` にあります。
