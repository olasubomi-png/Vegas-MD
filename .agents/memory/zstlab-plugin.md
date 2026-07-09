---
name: ZST Labs plugin
description: How the ZST Labs API commands are structured, registered, and constrained in OLASUBOMI-MD
---

# ZST Labs Plugin

## What it does
`plugins/zstlab.js` adds 79 new commands powered by https://zstlab.cyou (317 endpoints).

## Key decisions

**Why a plugin file, not core commands?**
The plugin system in `plugins/` is auto-loaded by `commands/index.js` and does not require editing existing core files beyond the category registry.

**New categories added (both in index.js CATEGORY_ORDER and main.js CATEGORY_META):**
`movies`, `anime`, `sports`, `religion`, `canvas`

**API key:** `ZST_API_KEY` env var (set in Replit Secrets under shared). The plugin warns at load time if missing.

**Auth:** `x-api-key` header on a shared axios instance (`api`).

**Intentional overrides:** `deepseek`, `summarize`, `fact`, `flirt` from existing core commands are overwritten by the ZST plugin — the API versions are strictly better.

**`trivia` preserved in games:** The games category trivia command was kept intact by renaming the ZST trivia to `apitrivia`.

**`myip` is owner-only:** Prevents host network reconnaissance by regular users.

**How to apply:** When adding more ZST endpoints, append to `plugins/zstlab.js` and categorise using the existing `category` strings. No other file edits needed unless a new category is required (then add to both CATEGORY_ORDER and CATEGORY_META).
