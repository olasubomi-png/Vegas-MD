const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, isJidGroup } = require('baileys');
const { Boom } = require('@hapi/boom');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const allCommands = require('./commands/index');
require('dotenv').config();

// Bot configuration
const botConfig = {
  name: 'OLASUBOMI-MD',
  version: '3.0.0',
  beta: 'Beta',
  prefix: '.',
  mode: 'private',
  ownerNumber: process.env.OWNER_NUMBER || '',
  ownerName: 'Olasubomi',
  description: 'Advanced WhatsApp Bot with 727 commands'
};

let sock;
let isLogged = false;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '121.0.6167.160'],
    maxMsListenerCount: 1000,
    pairingCode: true
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, isNewLogin, qr } = update;

    if (isNewLogin) isLogged = true;

    if (qr) {
      console.log('\n⚠️  QR Code mode detected. Requesting pairing code...');
      const phoneNumber = await askPhoneNumber();
      console.log(`\n✅ Phone number received: ${phoneNumber}`);
      console.log('Generating pairing code...\n');
      const code = await sock.requestPairingCode(phoneNumber);
      console.log(`\n📱 YOUR PAIRING CODE:\n`);
      console.log(code);
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        await delay(3000);
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log(`\n✅ ${botConfig.name} Connected!\n`);
      console.log(`${'═'.repeat(30)}`);
      console.log(`Name: ${botConfig.name}`);
      console.log(`Version: ${botConfig.version} ${botConfig.beta}`);
      console.log(`Prefix: ${botConfig.prefix}`);
      console.log(`Mode: ${botConfig.mode}`);
      console.log(`Commands: 727`);
      console.log(`${'═'.repeat(30)}\n`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      if (!message.message) continue;

      const text = message.message.conversation || 
                   message.message.extendedTextMessage?.text || 
                   '';

      if (!text.startsWith(botConfig.prefix)) continue;

      const args = text.slice(botConfig.prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      try {
        await handleCommand(command, args, message, sock, botConfig);
      } catch (err) {
        console.error('Error processing command:', err.message);
      }
    }
  });
}

async function askPhoneNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('📱 Enter your WhatsApp phone number (with country code, e.g., 234812345678): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function handleCommand(command, args, message, sock, botConfig) {
  const jid = message.key.remoteJid;
  const isGroup = isJidGroup(jid);
  const sender = message.key.participant || jid;

  // Get command from all commands
  const cmd = allCommands[command];

  if (cmd) {
    try {
      await cmd.exec(args, sock, jid, isGroup, sender, message);
    } catch (err) {
      console.error('Error executing command:', err.message);
      await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` });
    }
  } else {
    await sock.sendMessage(jid, { text: `❌ Command "${command}" not found. Type "${botConfig.prefix}menu" for help.` });
  }
}

async function showMenu(jid, sock) {
  const menu = `╭┈───〔 OLASUBOMI-MD 〕┈───⊷
├⬗ Owner: Olasubomi
├⬗ Commands: 727
├⬗ Runtime: 5h 45m 9s
├⬗ Prefix: .
├⬗ Mode: private
├⬗ Version: 3.0.0 Beta
╰───────────────────⊷

\`『 MAIN 』\`
┋ ▸ help
┋ ▸ menu
┋ ▸ ping
┋ ▸ owner
┋ ▸ alive
┋ ▸ uptime

\`『 AI 』\`
┋ ▸ gpt
┋ ▸ copilot
┋ ▸ claude
┋ ▸ gemini

\`『 DOWNLOAD 』\`
┋ ▸ tiktok
┋ ▸ fb
┋ ▸ igdl
┋ ▸ yt
┋ ▸ play

\`『 FUN 』\`
┋ ▸ joke
┋ ▸ quote
┋ ▸ ship
┋ ▸ dare
┋ ▸ truth

\`『 GROUP 』\`
┋ ▸ promote
┋ ▸ demote
┋ ▸ kick
┋ ▸ mute
┋ ▸ unmute
┋ ▸ tagall

\`『 AUDIO 』\`
┋ ▸ bass
┋ ▸ deep
┋ ▸ fast
┋ ▸ slow
┋ ▸ reverse

\`『 TOOLS 』\`
┋ ▸ font
┋ ▸ sticker
┋ ▸ enhance
┋ ▸ upscale

> *© Powered by OLASUBOMI-MD*`;

  await sock.sendMessage(jid, { text: menu });
}

async function showHelp(jid, sock) {
  const help = `🤖 *OLASUBOMI-MD Help*

Use prefix "." before any command.

Examples:
.menu - Show command menu
.gpt <query> - Ask GPT
.tiktok <url> - Download TikTok
.joke - Get a joke
.promote - Promote member (group only)

Type .menu to see all commands!`;

  await sock.sendMessage(jid, { text: help });
}

async function showSettings(jid, sock, botConfig) {
  const settings = `⚙️ *Bot Settings*

Owner: ${botConfig.ownerName}
Prefix: ${botConfig.prefix}
Mode: ${botConfig.mode}
Version: ${botConfig.version}
Commands: 727`;

  await sock.sendMessage(jid, { text: settings });
}

// Start the bot
console.log('🚀 Starting OLASUBOMI-MD Bot...');
connectToWhatsApp().catch(err => console.error('Failed to start bot:', err.message));
