# OLASUBOMI-MD — WhatsApp Bot

An advanced WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys). Connects via **pairing code** — no QR scanning needed.

## Stack
- **Runtime**: Node.js 20
- **WhatsApp**: Baileys v7
- **AI**: OpenAI, Anthropic Claude, Google Gemini (real APIs + free fallback)
- **Database**: Pure-JS JSON (no native compilation needed) → `data/database.json`
- **Entry point**: `main.js`
- **Commands**: `commands/` directory
- **Plugins**: `plugins/` directory (auto-loaded on startup)

## How to Run

```bash
node main.js
```

First run: enter your WhatsApp number (digits + country code, e.g. `2348012345678`). A pairing code appears — enter it in WhatsApp → Settings → Linked Devices → Link Device.

## Required Secrets (Replit Secrets panel)

| Secret | Required | Description |
|--------|----------|-------------|
| `OWNER_NUMBER` | ✅ Yes | Your number with country code, digits only (e.g. `2348012345678`) |
| `OWNER_NAME` | Optional | Your name (default: Olasubomi) |
| `BOT_MODE` | Optional | `private` (owner only) or `public` (default: `private`) |
| `BOT_PREFIX` | Optional | Command prefix (default: `.`) |
| `OPENAI_API_KEY` | Optional | Real ChatGPT/GPT-4/Copilot responses |
| `ANTHROPIC_API_KEY` | Optional | Real Claude responses |
| `GOOGLE_AI_API_KEY` | Optional | Real Gemini responses |

> Without AI keys the bot falls back to pollinations.ai (free, no key needed).

## File Structure

```
main.js                 Entry point — connection, event dispatch
lib/
  database.js           JSON database (users, groups, economy, warnings, bans)
  helpers.js            Shared utilities (URL detection, cooldowns, admin checks)
commands/
  index.js              Auto-loads all commands + plugins/ directory
  main.js               Menu (category-based), ping, alive, uptime, status
  ai.js                 GPT, GPT-4, Claude, Gemini, Copilot, translate, summarize
  group.js              Promote, demote, kick, mute, tagall + protection toggles
  moderation.js         Warn, unwarn, setwelcome, setgoodbye, setmaxwarn
  economy.js            Balance, daily, work, pay, leaderboard, profile
  owner.js              Dashboard, setmode, setprefix, ban, broadcast, autostatus
  fun.js                Joke, quote, ship, dare, truth, 8ball, roast, compliment
  audio.js              Bass, deep, fast, slow, reverse, robot, chipmunk
  tools.js              Font, sticker, enhance, upscale, removebg, blur
  download.js           TikTok, Facebook, Instagram, YouTube, play
  settings.js           Settings, prefix, privacy
events/
  welcome.js            Auto welcome/goodbye on group participant changes
  protection.js         Anti-delete, anti-link, anti-spam, anti-view-once, auto-react
  autoStatus.js         Auto-view + auto-react to WhatsApp status updates
plugins/
  example.js            Example plugin — copy to add your own commands
data/
  database.json         Auto-created on first run
```

## Menu System

```
.menu              → shows all category shortcuts
.menu ai           → AI commands
.menu group        → Group management + protection
.menu mod          → Moderation (warn, ban, welcome)
.menu economy      → Coins, daily, work, pay
.menu owner        → Owner dashboard (owner only)
.menu fun          → Jokes, games, quotes
.menu audio        → Audio effects
.menu tools        → Image tools
.menu download     → Media downloaders
```

## Plugin System

Drop a `.js` file into `plugins/` — it's auto-loaded on startup. Export a `commands` object:

```js
// plugins/myfeature.js
module.exports = {
  commands: {
    mycommand: {
      desc: 'Description shown in menu',
      exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
        await sock.sendMessage(jid, { text: 'Hello!' });
      }
    }
  }
};
```

## Group Protection Features (per-group, persisted in DB)

Toggle with admin commands in any group:

| Command | What it does |
|---------|-------------|
| `.antilink` | Auto-delete links, warn sender, kick at limit |
| `.antidelete` | Re-post deleted messages to the group |
| `.antispam` | Rate-limit members (>6 msgs/5s = warning) |
| `.antiviewonce` | Re-send view-once photos/videos for everyone |
| `.autoreact` | React to messages with random emoji |
| `.welcome` | Send welcome message when members join |
| `.goodbye` | Send goodbye message when members leave |
| `.groupsettings` | View all current toggles |

## Economy System

- `.daily` — 500 coins/day
- `.work` — 50–300 coins, 3h cooldown
- `.pay @user <amount>` — transfer coins
- `.leaderboard` — top 10 richest
- XP earned from daily and work, levels up every 500 XP

## User Preferences
- Pairing-code login (no QR scanning)
- Preserve existing command structure and file layout
- AI commands fall back to pollinations.ai (free) when API keys are not set
- Pure-JS database — no native module compilation required
