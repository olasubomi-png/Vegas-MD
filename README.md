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
