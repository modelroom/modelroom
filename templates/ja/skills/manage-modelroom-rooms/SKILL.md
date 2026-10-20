---
name: manage-modelroom-rooms
description: >-
  modelroom の room を作成・改名・削除する。新しい room が欲しい、room を改名
  したい、削除したい、と言われたときに使う。ディレクトリ名が room そのもの:
  一意であり、必須の docs を必ず持ち、その room への参照はすべて一緒に動く。
---

# modelroom の room を管理する

room は `rooms/<room>/` で、必須の docs と artifact を持ちます。**ディレクトリ名が
room そのもの**です。一意で、小文字の slug で、`modelroom.json` が指定する docs を
すべて備えている必要があります。

room ディレクトリを手で `mkdir`、`mv`、`rm` しないでください。参照が置き去りに
なります。CLI を使えば、名前とリンクが揃ったまま動きます。

## room を追加する

```sh
npx modelroom new <room> --title "Sign in"
```

あとは room を書きます。`BRIEF.md` から始め、最後に次を実行します:

```sh
npx modelroom render <room>
npx modelroom check
```

## room を改名する

動かす前に確認します:

```sh
npx modelroom rename <old> <new> --dry-run
```

dry run はディレクトリの移動と、書き換える参照をすべて表示します。問題なければ
`--dry-run` を外してもう一度実行します。CLI は参照 — `superseded_by` の
frontmatter、`/rooms/<name>` と `/files/<rooms>/<name>` のパス、相対リンク — を
書き換え、旧名をまだ書いている箇所を一覧で出します。

そこから先は手作業です:

1. 一覧の各行を読み、変えるべきか判断します。
2. `title` と H1 はパスではなく文章です。ディレクトリ名と画面の名前は違ってかまい
   ません。画面が本当に改名するときだけ変えます。
3. `npx modelroom check`、`npx modelroom render <room>` の順に実行し、スクリプトが
   見られなかった差分を `git diff` で確認します。

先に `npx modelroom` を止めてください。実行中のサーバは room のチャットセッションを
メモリに持っており、その下で改名すると失われます。サーバが動いている間、コマンドは
実行を拒否します。

## room を削除する

削除は人間の判断です。エージェントは room を退役させます:

```yaml
deprecated: true
superseded_by: <置き換えた room>
```

人間が明確に削除を求めたときだけ、次を実行します:

```sh
npx modelroom remove <room> --dry-run   # 誰がまだ参照しているか
npx modelroom remove <room> --yes
```

`remove` は他の room が参照している間は拒否します（`--force` で続行）。強制削除は
参照を壊したままにするので、必ず直してください。git 以外に元に戻す手段はないので、
削除は単独でコミットしておきます。

## 生成物を更新する

スキルと `AGENTS.md` はインストールされた modelroom から生成されるため、新しい
バージョンで内容が変わります:

```sh
npx modelroom@latest update            # 生成物を更新
npx modelroom@latest update --dry-run  # 変更内容の確認
```

room と `modelroom.json` には一切触れません。
