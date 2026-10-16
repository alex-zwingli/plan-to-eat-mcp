# Changelog

## [0.8.0](https://github.com/alex-zwingli/plan-to-eat-mcp/compare/v0.7.3...v0.8.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* list_recipes returns brief rows (id, title, owned, and the course/cuisine/main-ingredient titles, tag_titles, total_time and rating when set; empty fields omitted) instead of RecipeSummary rows. PlanToEat.listRecipes() and list_recipes with full: true return RecipeListing rows from /api/v1/recipes/lite_plus. Neither has description, source, url, servings, yield, ingredient_titles, nutrition, prep_time, cook_time or user_login; call get_recipe for those. Inactive, removed and hidden recipes are no longer returned.

### Bug Fixes

* list every recipe, not just the oldest 500 ([#16](https://github.com/alex-zwingli/plan-to-eat-mcp/issues/16)) ([66ef11f](https://github.com/alex-zwingli/plan-to-eat-mcp/commit/66ef11f45617b7be3c2099b21c535984a8387b9d))

## [0.7.3](https://github.com/alex-zwingli/plan-to-eat-mcp/compare/v0.7.2...v0.7.3) (2026-09-08)


### Bug Fixes

* pin every npm install command in the skills ([#14](https://github.com/alex-zwingli/plan-to-eat-mcp/issues/14)) ([3ece544](https://github.com/alex-zwingli/plan-to-eat-mcp/commit/3ece5447c82d122ed12cdb01f51c88f380a8b0c9))

## [0.7.2](https://github.com/alex-zwingli/plan-to-eat-mcp/compare/v0.7.1...v0.7.2) (2026-09-08)


### Bug Fixes

* add items to the store they were last bought at ([#12](https://github.com/alex-zwingli/plan-to-eat-mcp/issues/12)) ([175208d](https://github.com/alex-zwingli/plan-to-eat-mcp/commit/175208d977cd97c54d92a7553310b4d45315af1e))

## [0.7.1](https://github.com/alex-zwingli/plan-to-eat-mcp/compare/v0.7.0...v0.7.1) (2026-09-08)


### Bug Fixes

* stop interpolating user text into jq filters in the CLI skill ([#10](https://github.com/alex-zwingli/plan-to-eat-mcp/issues/10)) ([61b3c08](https://github.com/alex-zwingli/plan-to-eat-mcp/commit/61b3c088e145b0ca4acf3a7ac52fecbc8bab9914))

## [0.7.0](https://github.com/alex-zwingli/plan-to-eat-mcp/compare/v0.6.0...v0.7.0) (2026-09-08)


### ⚠ BREAKING CHANGES

* get_shopping_list now returns the list items rather than {updated_items, last_sync_time}. The sync metadata is still available from the client as getShoppingList().

### Features

* add shopping list read and write tools ([#7](https://github.com/alex-zwingli/plan-to-eat-mcp/issues/7)) ([4c00542](https://github.com/alex-zwingli/plan-to-eat-mcp/commit/4c005423ce232d888ccdf1b29ffa3ffc727856bd))

## [0.6.0](https://github.com/alex-zwingli/plan-to-eat-mcp/compare/v0.5.1...v0.6.0) (2026-09-08)


### Features

* declare ClawHub metadata so the skills publish to OpenClaw ([#4](https://github.com/alex-zwingli/plan-to-eat-mcp/issues/4)) ([650b729](https://github.com/alex-zwingli/plan-to-eat-mcp/commit/650b729fe85baeaae1b767134dd45e2554c93742))

## [0.5.1](https://github.com/alex-zwingli/plan-to-eat-mcp/compare/v0.5.0...v0.5.1) (2026-09-08)


### Miscellaneous Chores

* release 0.5.1 ([271978a](https://github.com/alex-zwingli/plan-to-eat-mcp/commit/271978ac787885556b497a214604491431c6d9ec))
