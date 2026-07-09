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
| Downloader | 17 | TikTok, Instagram, YouTube, social |
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

## Default Bot Prefix
`.` (configurable via `.setprefix`)

## User Preferences
- Keep existing project structure and stack
- New ZST Labs commands go in `plugins/zstlab.js`
- New categories registered in `commands/index.js` CATEGORY_ORDER and `commands/main.js` CATEGORY_META
