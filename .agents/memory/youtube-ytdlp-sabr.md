---
name: YouTube yt-dlp SABR fix
description: Why yt-dlp downloads fail with "content not available on this app" and how to fix it
---

# YouTube yt-dlp SABR streaming fix

## Symptom
`yt-dlp` fails every YouTube download (audio or video) with:
```
WARNING: Some web client https formats have been skipped as they are missing a url. YouTube is forcing SABR streaming for this client.
ERROR: [youtube] <id>: The following content is not available on this app.
```

## Cause
YouTube is progressively forcing "SABR" server-side stream negotiation on the default `web` extraction client, which strips the direct URLs yt-dlp's default client relies on.

## Fix
Pass `--extractor-args "youtube:player_client=android,web"` — the android client still returns formats yt-dlp can use without the SABR restriction (and without needing a PO token for the muxed/adaptive formats it typically picks).

**Where applied:** `commands/download.js` → `ytDlpDownload()`, used by `.yt`/`.ytmp3`/`.ytmp4`/`.song`/`.play`/`.video`/`.spotify`.

**How to apply:** If YouTube downloads break again with a similar error, check for a newer yt-dlp release first (`yt-dlp -U` or reinstall the system package) — this is an active cat-and-mouse game between yt-dlp and YouTube, so `player_client` values that work today may need updating later.
