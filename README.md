# OLASUBOMI-MD WhatsApp Bot

An advanced WhatsApp bot with 727+ commands built with Baileys library.

## ✨ Features

✅ **Pairing Code Authentication** - No QR scanning needed  
✅ **AI Integration** - GPT, Claude, Copilot, Gemini  
✅ **Media Downloads** - TikTok, Facebook, Instagram, YouTube  
✅ **Audio Processing** - Bass, Effects, Speed Control  
✅ **Group Management** - Promote, Demote, Kick, Mute  
✅ **Fun Commands** - Jokes, Games, Quotes  
✅ **Image Tools** - Enhance, Upscale, Sticker Converter  
✅ **727 Commands** - Extensive command library  

## Installation

### Prerequisites
- Node.js 14+ 
- npm
- WhatsApp account

### Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment**
Edit `.env` file:
```env
BOT_NAME=OLASUBOMI-MD
BOT_VERSION=3.0.0
BOT_PREFIX=.
BOT_MODE=private
OWNER_NUMBER=
OWNER_NAME=Olasubomi
BOT_DESCRIPTION=Advanced WhatsApp Bot
```

3. **Start Bot**
```bash
npm start
```

4. **Use Pairing Code**
- A pairing code will appear in terminal
- Go to WhatsApp → Settings → Linked Devices → Link Device
- Enter the pairing code
- Bot will connect automatically!

## Command Categories

### Main Commands
- `.menu` - Show command menu
- `.help` - Show help
- `.ping` - Check status
- `.alive` - Verify bot is running
- `.uptime` - Show uptime
- `.owner` - Owner info

### AI Commands
- `.gpt <query>` - Ask ChatGPT
- `.claude <query>` - Claude AI
- `.copilot <query>` - GitHub Copilot
- `.gemini <query>` - Google Gemini

### Download Commands
- `.tiktok <url>` - Download TikTok
- `.fb <url>` - Download Facebook
- `.igdl <url>` - Download Instagram
- `.yt <url>` - Download YouTube
- `.play <song>` - Search music

### Group Commands
- `.promote` - Promote to admin
- `.demote` - Demote admin
- `.kick` - Remove member
- `.mute` - Mute group
- `.unmute` - Unmute group
- `.tagall` - Tag all members

### Fun Commands
- `.joke` - Random joke
- `.quote` - Inspirational quote
- `.ship` - Ship calculator
- `.dare` - Get a dare
- `.truth` - Get a truth question

### Audio Commands
- `.bass` - Bass boost
- `.deep` - Deepen audio
- `.fast` - Speed up
- `.slow` - Slow down
- `.reverse` - Reverse audio
- `.robot` - Robot voice

### Tools Commands
- `.font <text>` - Fancy text
- `.sticker` - Convert to sticker
- `.enhance` - Enhance image
- `.upscale` - Upscale image
- `.removebg` - Remove background

## File Structure

```
olasubomi-md-bot/
├── main.js                 # Main bot file
├── .env                   # Configuration
├── package.json          # Dependencies
└── commands/
    ├── index.js          # Command loader
    ├── main.js           # Main commands
    ├── ai.js            # AI commands
    ├── download.js      # Download commands
    ├── group.js         # Group commands
    ├── fun.js           # Fun commands
    ├── audio.js         # Audio commands
    └── tools.js         # Tools commands
```

## Usage Examples

```
.menu
.gpt What is JavaScript?
.tiktok https://www.tiktok.com/...
.joke
.promote @user
.play Never Gonna Give You Up
.pinterest naruto 3
.pindl https://www.pinterest.com/pin/123456789/
.danimesearch naruto 2
.dwallpaper dark phone wallpaper 3
.aimusic cinematic piano soundtrack --instrumental
.font Hello World
```

## Important Notes

⚠️ **Bot Auth**: The bot stores authentication in `auth_info_baileys/`  
⚠️ **Group Commands**: Some require admin permissions  
⚠️ **Rate Limiting**: WhatsApp may rate limit frequent messages  
⚠️ **Legal Notice**: Use responsibly and comply with WhatsApp ToS  

## Troubleshooting

**Bot not responding?**
- Check internet connection
- Restart bot with `node main.js`
- Ensure WhatsApp account is active

**QR Code won't scan?**
- Open WhatsApp Settings → Linked Devices
- Make sure camera works
- Try again

**"Command not found" error?**
- Check command spelling
- Ensure prefix is correct (default: `.`)
- Type `.menu` to see all commands

## Development

Add new commands in `commands/` directory:

```javascript
const newCommands = {
  mycommand: {
    desc: 'Command description',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      await sock.sendMessage(jid, { text: 'Response' });
    }
  }
};
```

## New Assistant Features

Vegas-MD now includes an optional assistant layer:

| Command | Purpose |
|---|---|
| `.code <question or code>` | Explain programming concepts, review code, diagnose errors, and propose fixes or tests. |
| `.speak <text>` | Generate spoken audio with an OpenAI voice. Use `.speak --voice nova <text>` to select a supported voice. |
| `.play <song name>` / `.song <song name>` | Search YouTube and send the track as audio, using `yt-dlp` first and public search fallbacks when needed. |
| `.freechat on` | Owner-only switch that enables natural replies to ordinary private-chat messages. |
| `.freechat off` | Disable ordinary-message replies; command handling remains unchanged. |
| `.freechatgroups on/off` | Owner-only switch to allow or block free-chat replies in groups. Group replies are off by default. |
| `.clearchat` | Clear the current conversation’s in-memory free-chat context. |
| `.pinterest <query> [count]` / `.pin` | Search Pinterest images and send up to six results with uploader details and source links. |
| `.pindl <Pinterest URL>` | Download image, video, or other media from a Pinterest pin URL. |
| `.danimesearch <query> [count]` | Search anime titles and send David Cyril cover images with title and description. (`.animesearch` remains the existing ZST/MAL search command.) |
| `.dwallpaper <query> [count]` | Search and send David Cyril wallpaper images. (`.wallpaper` remains the existing ZST wallpaper command.) |
| `.aimusic <prompt>` | Generate an AI song or instrumental using an asynchronous task and send the completed audio. |
| `.vibe <request>` | Owner-only repository-aware coding review with bounded project context. |
| `.workrepo status` / `.workrepo files` | Inspect the repository branch, working tree, and accessible files. (`.repo` remains the public repository-link command.) |
| `.workrepo read <path>` | Read a bounded source-file range without exposing protected paths. |
| `.workrepo test` | Run `npm test`, discovered tests, or JavaScript syntax checks. |
| `.workrepo fix <path> <problem>` | Generate a focused unified-diff preview; add `--apply` only when you explicitly want it written. |
| `.workrepo write --apply <path> <content>` | Intentionally write a file inside the configured repository workspace. |
| `.secret set NAME VALUE` / `.secret list` / `.secret remove NAME` | Store API secrets encrypted at rest; values are never returned by the bot. |

Free Chat is deliberately **off by default** and is controlled per bot owner/session. The bot ignores its own generated replies, keeps only a short in-memory conversation window, and does not treat unknown prefixed messages as free-chat prompts. The existing `.tts` command remains available as a free Google-backed voice-note option when `OPENAI_API_KEY` is not configured.

The repository-aware coding assistant is owner-only. It defaults to the directory containing `main.js`, refuses traversal outside that workspace, blocks `.env`, encrypted secret, authentication, `.git`, `node_modules`, and private-key paths, limits file/context sizes, and applies AI-generated patches only when the explicit `--apply` flag is used. Set `REPO_WORKSPACE` if the bot should manage a different local checkout. Use `.secret set` only from the owner account; the stronger deployment pattern is to place `SECRET_STORE_KEY` in Replit Secrets or the host secret manager, because a secret typed into WhatsApp is still visible in the originating chat history.

The `.imagine` command keeps its existing Pollinations providers and now uses the official ZST Labs `GET /api/v1/ai/image` endpoint as a final text-to-image fallback. The implementation sends the documented `x-api-key` header, requests the JSON URL form with `url=true`, downloads the returned image server-side, enforces a size limit, and sends the image as a WhatsApp attachment. Configure `ZST_IMAGE_MODEL`, `ZST_IMAGE_WIDTH`, `ZST_IMAGE_HEIGHT`, and `ZST_IMAGE_ENHANCE` as needed. The Azbry scraper page currently identifies itself as `YT Search & YT mp3`, but its request contract is protected and could not be verified, so it was not guessed or wired into production code.

For best reliability, configure `OPENAI_API_KEY` for coding help and free chat; these text features fall back to a public text provider when no key is available. The `.speak` command requires `OPENAI_API_KEY`. You can select models with `CODING_AI_MODEL`, `FREE_CHAT_AI_MODEL`, and `AI_MODEL`. The speech command uses `OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE`. The David Cyril integrations use `DAVID_CYRIL_API_BASE` and support polling controls through `AI_MUSIC_POLL_ATTEMPTS` and `AI_MUSIC_POLL_DELAY_MS`; see `.env.example` for the complete optional configuration.

## License

Created by Olasubomi  
OLASUBOMI-MD v3.0.0 Beta

## Support

For issues or questions:
- Check command syntax
- Review logs in terminal
- Verify bot has proper permissions

---

**Happy Botting! 🤖** 🚀
