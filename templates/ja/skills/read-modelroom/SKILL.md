---
name: read-modelroom
description: >-
  modelroom の room を変更・実装する前に、docs とコミット済みのスナップショット
  png を読む。room を触る、設計レイヤの画面を実装する、といったときに使う。
---

# modelroom の room を読む

room は1画面です。成果物は **docs とスナップショット png** で、`index.html` は
その画像を描くためのソースにすぎません。マークアップだけでなく、画像を読みます。

## 手順

1. room を見つける: `rooms/<room>/`（`modelroom.json` に別の指定がなければ
   rooms ディレクトリは `rooms`）。
2. スナップショットを最新にする。冪等なので、png が artifact と一致していれば
   何も書きません:

   ```sh
   npx modelroom render <room>
   ```

3. レイヤーのルートにある `DESIGN.md` を読みます。rooms がどのデザインシステムから
   描くか、そしてプロジェクトがそれを Model Context Protocol 経由で読む場合は、それを
   運ぶ MCP サーバが書かれています。マークアップを書く前に、**そのサーバのツールを
   使って** room が使うコンポーネントとトークンを調べます。デザインシステムが既に
   定義している色やコンポーネントを作り直してはいけません。
4. `BRIEF.md`、`SPEC.md`、`BEHAVIOUR.md` の順に読む。
5. **`index.png` を見る。** これがコミットされた幅での room の画面です。視覚の
   正は画像とし、html はそれがどう描かれたかの説明として扱います。
6. docs と画像を突き合わせて作業します。食い違っていたら黙って片方を選ばず、
   その旨を伝えます。

## 各ファイルの意味

- `DESIGN.md` — デザインシステムと、room をまたいで共有するトークン・コンポーネント。
- `BRIEF.md` — その room が存在する理由。
- `SPEC.md` — 画像では見えないもの（デバイス、状態、制約）。
- `BEHAVIOUR.md` — 画面が約束するふるまい。約束は id で参照します（`@checkout-1`）。
- `index.png` — 最後にレビューされた画面。
- `index.html` — その画像を描いたソース。

## artifact を変えたとき

スナップショットが成果物なので、必ず一致させます。`index.html` を編集したら
`render <room>` を実行し、コミットする png を最新にしてください。レビュアーが
読むのはその画像で、PR では GitHub がその差分を表示します。