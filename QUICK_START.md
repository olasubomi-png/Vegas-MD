# OLASUBOMI-MD Bot - Quick Start Guide

## 🚀 Getting Started

### Step 1: Install Dependencies
```bash
cd olasubomi-md-bot
npm install
```

### Step 2: Start the Bot
```bash
npm start
```
or
```bash
node main.js
```

### Step 3: Get Pairing Code
1. When you run the bot, a **pairing code** will appear in the terminal
2. The code will look like: `123456789012`
3. Copy this code

### Step 4: Link WhatsApp
1. Open WhatsApp on your phone
2. Go to **Settings** → **Linked Devices** → **Link a Device**
3. You'll see an option to enter the pairing code
4. Paste the code you copied from the terminal
5. Tap **Link**

### Step 5: Bot Ready!
Wait a few seconds and you'll see:
```
✅ OLASUBOMI-MD Connected!
═══════════════════════════════
Name: OLASUBOMI-MD
Version: 3.0.0 Beta
Prefix: .
Mode: private
Commands: 727
═══════════════════════════════
```

## 📋 Available Commands

### Quick Test Commands
```
.menu          → See all commands
.help          → Get help
.ping          → Check if bot is responding
.alive         → Verify bot status
.owner         → Get owner info
```

### AI Commands
```
.gpt <query>      → Ask ChatGPT
.claude <query>   → Claude AI
.copilot <query>  → GitHub Copilot
.gemini <query>   → Google Gemini
```

### Download Commands
```
.tiktok <url>   → Download TikTok videos
.fb <url>       → Download Facebook videos
.igdl <url>     → Download Instagram content
.yt <url>       → Download YouTube videos
.play <song>    → Search & download music
```

### Fun Commands
```
.joke      → Random joke
.quote     → Inspirational quote
.ship      → Ship calculator
.dare      → Get a dare
.truth     → Truth question
```

### Group Commands (Admin Only)
```
.promote       → Promote to admin
.demote        → Demote admin
.kick          → Remove member
.mute          → Mute group
.unmute        → Unmute group
.tagall        → Tag all members
```

### Audio Commands
```
.bass       → Apply bass boost
.deep       → Deepen audio
.fast       → Speed up audio
.slow       → Slow down audio
.reverse    → Reverse audio
.robot      → Robot voice effect
```

### Tools Commands
```
.font <text>    → Generate fancy text
.sticker        → Convert to sticker
.enhance        → Enhance image
.upscale        → Upscale image
.removebg       → Remove background
```

## ⚙️ Configuration

Edit `.env` file to customize:
```env
BOT_NAME=OLASUBOMI-MD
BOT_VERSION=3.0.0
BOT_PREFIX=.
BOT_MODE=private
OWNER_NUMBER=your_number_here
OWNER_NAME=Your Name
BOT_DESCRIPTION=Your Description
```

## 📁 Project Structure

```
olasubomi-md-bot/
├── main.js                    # Main bot file
├── package.json              # Dependencies
├── .env                      # Configuration
├── README.md                 # Full documentation
├── QUICK_START.md           # This file
└── commands/
    ├── index.js             # Command loader
    ├── main.js              # Main commands
    ├── ai.js                # AI integrations
    ├── download.js          # Download commands
    ├── group.js             # Group management
    ├── fun.js               # Fun commands
    ├── audio.js             # Audio effects
    ├── tools.js             # Image tools
    └── settings.js          # Settings
```

## 🐛 Troubleshooting

### Bot doesn't start
```bash
# Check Node version (need 14+)
node --version

# Clear auth and restart
rm -rf auth_info_baileys
npm start
```

### QR code won't scan
- Ensure good lighting
- Try again after 5 seconds
- Check WhatsApp app is up to date

### Commands not working
- Check prefix (default: `.`)
- Verify WhatsApp number is active
- Check bot has necessary permissions

## 💡 Tips

✅ Keep the bot running in the background  
✅ Use `.menu` to see all available commands  
✅ Group commands require admin rights  
✅ Prefix can be customized in `.env`  
✅ Bot stores sessions in `auth_info_baileys/`  

## 🔐 Security Notes

- ⚠️ Never share auth files (`auth_info_baileys/`)
- ⚠️ Keep `.env` file private
- ⚠️ Use strong owner credentials
- ⚠️ Respect user privacy when using bot

## 📞 Support

For issues:
1. Check terminal logs for errors
2. Verify internet connection
3. Restart bot with `npm start`
4. Review README.md for detailed info

## 🎉 You're All Set!

Start using your OLASUBOMI-MD bot now!

**Example:**
```
User: .gpt How do I learn JavaScript?
Bot: 🤖 GPT Response: JavaScript is a programming language...

User: .joke
Bot: 😂 Why did the bot go to school? To improve its debugging skills!

User: .ping
Bot: 🏓 Pong! Bot is responding...
```

Happy botting! 🚀
