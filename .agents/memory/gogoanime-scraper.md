---
name: GogoAnime scraper reliability
description: Search-matching and stream-resolution constraints for the .animedl command's gogoanime.by scraper
---

# GogoAnime scraper reliability

## Search must use the wp-json REST endpoint, not the HTML search page
`gogoanime.by`'s HTML `?s=` search page only surfaces its top ~10 WordPress-relevance-ranked hits. For long-running series (One Piece, Naruto, etc.) the actual main series is often buried past that cutoff behind side-stories/recaps/specials sharing the same title words, so picking the first HTML search hit silently returns the wrong series.

**Fix:** query `${GOGO_BASE}/wp-json/wp/v2/search?search=<q>&per_page=50` and score all results by normalized-title match quality (exact > startsWith > includes) rather than trusting result order.

**How to apply:** Any future rewrite of the anime search should keep using the REST endpoint with a wide `per_page`, not the rendered search page.

## Stream resolution has a hard, unfixable ceiling
Episode pages list "servers"; each server type needs different resolution:
- `embed`/`kiwi` — plain iframe URL, resolve via regex on the embed HTML (JWPlayer `file:`, JSON `"file"`, `sources` array, `<source src>`, bare `.m3u8`, or one client-side JS redirect).
- Other AJAX types (e.g. `Blogger`) — resolved via 9animetv.be's `player.php`, which may forward to a working `n-bg` resolver or a broken `histream/play.php` (always HTTP 500 on garbage input too — broken on the provider's server, not fixable client-side).
- `hianime` — as of 2026-07-14, this is the *only* server type listed for most current/popular series on gogoanime.by, and it also routes through the broken histream resolver. That means many episodes currently have no auto-downloadable path at all — not a scraping bug, a live site-side outage on the mirror's own infra.

**Why this matters:** don't assume a "no server resolved" failure is a code regression — check what server types are actually listed on the episode page first (`data-type='...'` attributes) before debugging the regex/AJAX logic.

**How to apply:** A durable fix would need a headless browser (e.g. Playwright) executing each embed's JS and capturing the real network request, since regex-matching keeps losing to host-specific obfuscation as embed providers rotate (e.g. awish.pro went from a working embed to a parked domain between when this scraper was written and 2026-07-14).

## Stream-URL regex must not require a file extension
Fixed 2026-07-14: the "Blogger" AJAX server type's `n-bg` resolver (the *working* branch, as opposed to the broken `histream` one) returns a real playable `googlevideo.com/videoplayback?...` URL — but that URL has no `.m3u8`/`.mp4` extension (Google identifies the format via a `mime=video/mp4` *query param*, not the path). The original `extractPlayableUrlFromHtml` patterns all required a literal `.m3u8`/`.mp4` extension in the matched URL, so they silently returned null on every otherwise-successful Blogger resolution — episodes fell through to "no auto-downloadable server" even though a working direct URL was sitting in the response body.

**Why this matters:** any regex meant to pull a "file"/"source" URL out of a video-player page must not assume a file extension — CDN-signed streaming URLs (googlevideo.com, akamai, etc.) very often have none.

**How to apply:** keep both extension-specific patterns (tried first, safest) and extension-agnostic fallback patterns (same JS/JSON shapes, any `http(s)://` value) in `extractPlayableUrlFromHtml`. After this fix, titles whose episode page lists a `Blogger` server (e.g. Demon Slayer, Jujutsu Kaisen) resolve correctly; titles with only dead `embed` hosts (awish.pro/dood.wf/alions.pro) or only the broken `hianime`/`histream` path (e.g. One Piece, Naruto Shippuuden as of 2026-07-14) still have no working server — that part remains a genuine site-side gap, not a code bug.
