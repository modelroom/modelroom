# Changelog

## [0.0.2](https://github.com/modelroom/modelroom/compare/modelroom-v0.0.1...modelroom-v0.0.2) (2026-10-18)


### Bug Fixes

* bin の先頭の ./ を外し、publish 時のマニフェスト補正をなくす ([f1ba67e](https://github.com/modelroom/modelroom/commit/f1ba67e8d6d91affb5f542c13b46fe620e92aab4))


### Miscellaneous Chores

* npm の説明文とキーワードを直す ([5fa6ade](https://github.com/modelroom/modelroom/commit/5fa6ade94fdbcdf236a4ab0157dce76552d02305))

## 0.0.1 (2026-10-18)


### Features

* frontmatter as the record — derived facets, search, and check
* room session panel — transcript, context and usage (opencode)
* room のセッションパネル（履歴・コンテキスト・使用量, opencode）
* the modelroom workspace — server, CLI, agent adapters and UI
* `modelroom` with no command now serves; `npm run modelroom` is the documented start


### Bug Fixes

* セッションIDを推測不能にし、残るTOCTOUとエラー露出を解消
* ファイル生成の競合とエラー文言の露出をなくす
* ファイル読み書きのTOCTOUとスタック情報の露出を解消
* 設定を永続化し、拒否したリクエストの副作用と spawn の二重通知をなくす
