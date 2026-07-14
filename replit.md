# OLASUBOMI-MD WhatsApp Bot

Advanced WhatsApp bot with 400+ commands powered by Baileys and the ZST Labs API.

## Stack
- **Runtime**: Node.js 20
- **WhatsApp**: Baileys v7 (pairing code authentication — no QR needed)
- **API**: ZST Labs (https://zstlab.cyou) — 317 endpoints
- **Database**: JSON flat-file via `lib/database.js`

## How to Run
```bash
npm install
npm start
```

On first run, enter your WhatsApp number when prompted. A pairing code appears — open WhatsApp → Settings → Linked Devices → Link Device → Enter Code.

## Environment Variables / Secrets
| Key | Description |
|-----|-------------|
| `OWNER_NUMBER` | Owner's WhatsApp number (e.g. `2349112097911`) |
| `ZST_API_KEY` | ZST Labs API key for 60+ ZST-powered commands |

## Project Structure
```
commands/         Core command files (ai, fun, search, tools, etc.)
plugins/          Plugin commands (zstlab.js — 79 ZST Labs commands)
lib/              Database, helpers, session manager
data/             JSON data files
assets/           Menu banner image
events/           WhatsApp event handlers
```

## Command Categories (19 total)
| Category  | Commands | Description |
|-----------|----------|-------------|
| Admin      | 6  | Group moderation (warn, kick, promote) |
| AI         | 17 | ChatGPT, Claude, Gemini, DeepSeek, ZST AI |
| Audio      | 8  | Bass, robot, pitch, speed effects |
| Downloader | 18 | TikTok, Instagram, YouTube, social, anime (`.animedl`) |
| Fun        | 22 | Jokes, quotes, facts, trivia, animals |
| Games      | 4  | Trivia game, hangman, tic-tac-toe |
| Group      | 20 | Welcome, antilink, tagall, settings |
| General    | 6  | Menu, help, ping, alive, uptime |
| Economy    | 7  | Balance, daily, work, pay |
| Owner      | 26 | Mode, broadcast, ban, settings |
| Search     | 15 | Web, news, country, dictionary, space |
| Converter  | 7  | QR, voice note, TTS, sticker |
| Tools      | 30 | Weather, crypto, IP, hash, calc, currency |
| Utility    | 10 | Font, echo, JID, prefix, privacy |
| **Movies** | 7  | YTS, Nkiri, DramaKey, FzMovies, FzSeries |
| **Anime**  | 7  | Neko, waifu, anime search, konachan |
| **Sports** | 8  | EPL, La Liga, UCL, live matches, scores |
| **Religion** | 6 | Bible, Quran, Hymns |
| **Canvas** | 5  | ATM card, tweet, YouTube comment, chat |

## Anime Episode Downloader (`.animedl`)
`commands/download.js` scrapes the `gogoanime.by` mirror directly (title → series page → episode page → direct video URL). No official/legal API exists for full anime downloads, so this:
- **Is fragile** — breaks whenever gogoanime.by changes markup/domain, or its upstream video providers change their embed/AJAX format.
- **Carries legal/ToS risk** — it redistributes copyrighted content without authorization.
- **Tries every server listed on the episode page, in order:**
  1. `embed`/`kiwi` — ship a plain unencrypted iframe URL → resolved in one hop (`megaplay.su` → direct `.mp4`).
  2. AJAX-based servers (e.g. `Blogger`) — resolved by replaying the encrypted params through `9animetv.be`'s `player.php`; when it forwards to the `n-bg` resolver this yields a real `googlevideo.com` direct link.
  3. `hianime` and any other server whose AJAX response routes through `9animetv.be`'s `histream/play.php` is skipped — that specific resolver is broken on the provider's own server (always HTTP 500, even on garbage input), not something fixable client-side.
- If no server resolves, the command replies with a manual watch link instead of failing silently. Titles gogoanime.by doesn't host at all (it falls back to an "external results" search widget for those) correctly report "no anime found".

## Dashboard (`dashboard/`)
Two-step start: `npm install` in the repo root (server deps) **and** in `dashboard/client` (React client), then `npm run build` inside `dashboard/client` to produce `dashboard/client/dist` (the server serves this as static files; without it, `/` shows a "not built yet" placeholder). The `Dashboard` workflow runs `node dashboard/server/index.js`.

## Downloader Commands (`commands/download.js`)
- **YouTube (`.yt`/`.ytmp3`/`.ytmp4`/`.song`/`.play`/`.video`/`.spotify`)**: use `yt-dlp` (installed as a system dependency). Fixed 2026-07-14: YouTube's SABR streaming rollout was breaking every yt-dlp download with "content not available on this app" — `player_client=android,web` extractor args fixed it. If YouTube breaks downloads again in the future, check https://github.com/yt-dlp/yt-dlp for a newer release / updated extractor-args first.
- **Anime (`.animedl`, via gogoanime.by)**: search now queries the site's `wp-json/wp/v2/search` REST endpoint (up to 50 results) and scores by title-match quality, instead of trusting the HTML search page's top ~10 hits — this fixes long-running series (One Piece, Naruto, etc.) resolving to the wrong spinoff/recap. Stream-URL extraction now recognizes more embed-host formats and follows one client-side JS redirect.
  - **Known remaining limitation**: as of 2026-07-14, most currently-listed servers on gogoanime.by episode pages are the `hianime` type, which routes through a resolver that 500s on the provider's own server (not fixable client-side — see code comments in `gogoResolveAjaxServer`). The command replies with a manual watch link when no server resolves, rather than failing silently. This is a mirror-site reliability issue, not a bug — expect it to keep shifting as gogoanime.by's embed providers rotate.

## Default Bot Prefix
`.` (configurable via `.setprefix`)

## Dashboard: User Accounts, Coins & Self-Service Deploy
`dashboard/` (Express + React) has two separate login systems:
- **Admin login** (`/login`) — single shared password (`DASHBOARD_PASSWORD` secret), full control panel.
- **User accounts** (`/account`, `/account/login`) — sign in with Google. Each account gets:
  - A coin balance (10 free coins on signup, +10/day via a claim button, once per 24h).
  - A self-service flow: enter your WhatsApp number → "Deploy" spends 10 coins, sets it as the bot's `OWNER_NUMBER`, and requests a pairing code (visible on the admin Bot Status page). Only one active deployment per account.
  - Auto-renewal every 3 days: the deploy scheduler (`dashboard/server/deployScheduler.js`) deducts another 10 coins to keep it running, or stops it if the balance is too low.

**Known architecture limitation**: this codebase runs a single WhatsApp/Baileys session (one `auth_info_baileys/` folder, one process) — it is not yet multi-tenant. The dashboard enforces "only one *global* active deployment at a time" via a Mongo-backed lock (`Setting.activeDeploymentUser`), so a second account can't deploy while another's session is live; it does not spin up isolated bot instances per account. True per-account isolated bot instances would need a real architecture change (see follow-up task).

Required secrets for the dashboard: `MONGODB_URI`, `JWT_SECRET`, `DASHBOARD_PASSWORD`, `DASHBOARD_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Google OAuth redirect URI must be `https://<your-repl-domain>/api/user/auth/google/callback` in Google Cloud Console.

## User Preferences
- Keep existing project structure and stack
- New ZST Labs commands go in `plugins/zstlab.js`
- New categories registered in `commands/index.js` CATEGORY_ORDER and `commands/main.js` CATEGORY_META
