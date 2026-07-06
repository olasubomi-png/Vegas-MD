# OLASUBOMI-MD — WhatsApp Bot

An advanced WhatsApp bot built on the [Baileys](https://github.com/WhiskeySockets/Baileys) library. Connects via **pairing code** (no QR scanning needed).

## Stack
- **Runtime**: Node.js 20
- **WhatsApp**: Baileys v7
- **AI**: pollinations.ai (free, no key required)
- **Entry point**: `main.js`
- **Commands**: `commands/` directory

## How to Run

```bash
npm install
node main.js
```

When prompted, enter your WhatsApp number (with country code, e.g. `2348012345678`). A pairing code will appear — enter it in WhatsApp → Settings → Linked Devices → Link Device.

## Configuration

Edit `.env` to configure:

```env
BOT_MODE=private          # private (owner only) or public (everyone)
OWNER_NUMBER=234xxxxxxxxx # your number with country code, no +
OWNER_NAME=YourName
```

## Command Files

| File | Commands |
|------|----------|
| `commands/main.js` | menu, help, ping, alive, uptime, owner, status |
| `commands/ai.js` | ai, gpt, chatgpt, gemini, claude, copilot, imagine |
| `commands/download.js` | tiktok, fb, igdl, yt, play |
| `commands/group.js` | promote, demote, kick, mute, unmute, tagall, ginfo |
| `commands/fun.js` | joke, quote, ship, dare, truth, 8ball, roast, compliment |
| `commands/audio.js` | bass, deep, fast, slow, reverse, robot, chipmunk, smooth |
| `commands/tools.js` | font, sticker, enhance, upscale, removebg, blur, colorize |
| `commands/settings.js` | settings, prefix, privacy |

## Adding Commands

Add a new command to any file in `commands/`:

```js
mycommand: {
  desc: 'What this command does',
  exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
    await sock.sendMessage(jid, { text: 'Hello!' });
  }
}
```

## User Preferences
- Keep pairing-code login (no QR scanning)
- Preserve existing command structure and file layout
- AI commands use pollinations.ai (free tier, no API key needed)
