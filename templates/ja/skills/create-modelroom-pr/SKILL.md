---
name: create-modelroom-pr
description: >-
  modelroom の room の PR を、スナップショット png・コンテキスト・BEHAVIOUR を
  レビュアーの前に出して作成・更新する。レビューがマークアップだけにならない
  ように、変更をレビューに出せる状態になったときに使う。
---

# modelroom の PR を作る

レビュアーはまず画像を読みます。画像がコミットに入り、説明から名前で示されて
いなければ、レビューはマークアップだけになります。

png は**固定名**（`index.png`）でコミットし、毎回その場で上書きします。これは
意図的です。GitHub は**同じパス**の2版を **Files changed → 画像 diff（Swipe /
Onion Skin）** で比較します。タイムスタンプやバージョンを付けて名前を変えな
いでください — 変更のたびに無関係な2ファイルになってしまいます。

## 手順

1. スナップショットを最新にする。冪等で、png が artifact と一致していれば何も
   書きません:

   ```sh
   npx modelroom render <room>
   ```

2. room の変更ファイルを**まとめて**コミットする — docs、`index.html`、
   `index.png`。ステージするのはその room だけにし、無関係な変更を巻き込まない:

   ```sh
   git add rooms/<room>
   ```

3. room から説明の素材を作り、差分のコンテキストは自分で足す:

   ```sh
   npx modelroom pr-body <room>
   ```

   summary、スナップショットの場所、BEHAVIOUR を出力します。何のための変更かを
   短く足してください。

   説明に画像をインラインで出す場合は、レビュアーが描画できる URL（ブランチ上の
   raw ファイル）を渡します:

   ```sh
   npx modelroom pr-body <room> --image-url \
     "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/rooms/<room>/index.png"
   ```

4. PR を作成・更新する:

   ```sh
   gh pr create --title "<room>: <変更内容>" --body-file -
   gh pr edit  --body-file -        # 既存の PR を更新するとき
   ```

## スナップショットをコミットして上書きする理由

- チェックアウトしただけで、何も動かさずに全画面が見える — Playwright も
  サーバも要りません。
- 固定パスであることが、PR の画像 diff を成立させます。
- 通常ならリポジトリを肥大化させるバイナリの積み上がりは、**Squash and Merge**
  でマージすることで抑えられます。main には最終の1枚だけが残り、中間の blob は
  ブランチが消えたあと git が回収します。

画像を base64 にして PR コメントに添えるのはやめてください — GitHub のコメントは
65,536 文字までで、画面はそれをはるかに超えます。