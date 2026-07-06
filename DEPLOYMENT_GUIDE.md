# OLASUBOMI-MD Bot - Deployment Guide

## Deployment Methods

### 1. **Local Development**
```bash
npm start
```

### 2. **PM2 Deployment** (Recommended for Production)

#### Install PM2
```bash
npm install -g pm2
```

#### Start Bot with PM2
```bash
pm2 start ecosystem.config.js
```

#### Monitor Bot
```bash
pm2 monit
```

#### View Logs
```bash
pm2 logs OLASUBOMI-MD
```

#### Stop Bot
```bash
pm2 stop OLASUBOMI-MD
```

#### Restart Bot
```bash
pm2 restart OLASUBOMI-MD
```

#### Remove Bot
```bash
pm2 delete OLASUBOMI-MD
```

#### Save PM2 Process List
```bash
pm2 save
```

#### Auto-Start on System Boot
```bash
pm2 startup
pm2 save
```

---

## Requirements

- **Node.js**: v14 or higher
- **npm**: v6 or higher
- **WhatsApp**: Active account
- **Internet**: Stable connection

---

## Configuration

Edit `.env` file before deployment:

```env
BOT_NAME=OLASUBOMI-MD
BOT_VERSION=3.0.0
BOT_PREFIX=.
BOT_MODE=private
OWNER_NUMBER=<your-number-with-country-code>
OWNER_NAME=Olasubomi
BOT_DESCRIPTION=Advanced WhatsApp Bot
```

---

## First Time Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start bot**
   ```bash
   npm start
   ```

3. **Get pairing code** (first run only)
   - Enter your phone number when prompted
   - Copy the pairing code shown
   - Open WhatsApp → Settings → Linked Devices → Link Device
   - Paste the code

4. **Bot connects automatically** ✅

---

## Troubleshooting

### Bot won't connect
- Check internet connection
- Verify WhatsApp is active
- Delete `auth_info_baileys` folder and re-pair

### PM2 won't start
```bash
pm2 delete OLASUBOMI-MD
pm2 start ecosystem.config.js
```

### Port conflicts
- Check if another process uses port 8080 (if using API)
- Kill the process or change port in code

---

## Features Enabled

✅ Pairing code authentication  
✅ 727+ commands  
✅ Auto reconnection  
✅ Group management  
✅ Error logging  
✅ PM2 monitoring  

---

## Support

For issues:
1. Check logs: `pm2 logs OLASUBOMI-MD`
2. Review `.env` configuration
3. Verify WhatsApp account is active
4. Restart with: `pm2 restart OLASUBOMI-MD`

---

**Created by Olasubomi**  
**OLASUBOMI-MD v3.0.0 Beta**
