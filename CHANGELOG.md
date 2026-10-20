# Changelog

## [0.2.0](https://github.com/modelroom/modelroom/compare/modelroom-v0.1.0...modelroom-v0.2.0) (2026-10-20)


### Features

* a room's snapshot is a deliverable, not a cache ([#21](https://github.com/modelroom/modelroom/issues/21)) ([e6a8d71](https://github.com/modelroom/modelroom/commit/e6a8d7140b600b8cb3c9d4623570b407f5ca89ea))
* **chat:** answer the agent's question in the chat ([#23](https://github.com/modelroom/modelroom/issues/23)) ([d2d00dc](https://github.com/modelroom/modelroom/commit/d2d00dc27f7dd5d810b641d95c5521484e2fe7a5))

## [0.1.0](https://github.com/modelroom/modelroom/compare/modelroom-v0.0.6...modelroom-v0.1.0) (2026-10-19)


### Features

* install into modelroom/ and localize the tool in en/ja ([#14](https://github.com/modelroom/modelroom/issues/14)) ([074205c](https://github.com/modelroom/modelroom/commit/074205c91509d8d4b951450c7a71759f799d25e4))
* **ui:** rebuild the tool UI on Mantine v9 ([#12](https://github.com/modelroom/modelroom/issues/12)) ([d7b5844](https://github.com/modelroom/modelroom/commit/d7b5844c47932353cabfe98e63dfaf1926f65135))

## [0.0.6](https://github.com/modelroom/modelroom/compare/modelroom-v0.0.5...modelroom-v0.0.6) (2026-10-18)


### Features

* **chat:** follow a structured turn while the agent works ([#10](https://github.com/modelroom/modelroom/issues/10)) ([4ad661a](https://github.com/modelroom/modelroom/commit/4ad661a06c15502d257b7cc48d14cee283376e32))

## [0.0.5](https://github.com/modelroom/modelroom/compare/modelroom-v0.0.4...modelroom-v0.0.5) (2026-10-18)


### Features

* **chat:** show a turn as parts — tool cards, diffs, reasoning ([#8](https://github.com/modelroom/modelroom/issues/8)) ([398847b](https://github.com/modelroom/modelroom/commit/398847b833af40d3cccc1a676e87fbaade70eb7c))

## [0.0.4](https://github.com/modelroom/modelroom/compare/modelroom-v0.0.3...modelroom-v0.0.4) (2026-10-18)


### Features

* **ui:** one design system — dashboard and settings are shadcn too ([#5](https://github.com/modelroom/modelroom/issues/5)) ([83b8256](https://github.com/modelroom/modelroom/commit/83b8256226f388a51f51dfe2aed6c12dfce7ec44))

## [0.0.3](https://github.com/modelroom/modelroom/compare/modelroom-v0.0.2...modelroom-v0.0.3) (2026-10-18)


### Features

* **ui:** make the room React + shadcn/ui ([#3](https://github.com/modelroom/modelroom/issues/3)) ([ef27fdf](https://github.com/modelroom/modelroom/commit/ef27fdf9314049e16a15595dad6b4167035c85d5))

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
