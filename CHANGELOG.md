# Changelog

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
