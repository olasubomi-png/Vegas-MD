const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, isJidGroup } = require('baileys');
const readline = require('readline');
const allCommands = require('./commands/index');
require('dotenv').config();

// Bot configuration
const botConfig = {
  name: 'OLASUBOMI-MD',
  version: '3.0.0',
  beta: 'Beta',
  prefix: '.',
  mode: process.env.BOT_MODE || 'private',
  ownerNumber: process.env.OWNER_NUMBER || '',
  ownerName: process.env.OWNER_NAME || 'Olasubomi',
  description: 'Advanced WhatsApp Bot with 727 commands',
  startTime: Date.now()
};

// Export startTime so commands can use it for uptime
global.botStartTime = Date.now();
global.botConfig = botConfig;

let sock;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '121.0.6167.160'],
    maxMsListenerCount: 1000
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n⚠️  QR Code detected. Requesting pairing code instead...');
      const phoneNumber = await askPhoneNumber();
      console.log(`\n✅ Phone number received: ${phoneNumber}`);
      console.log('Generating pairing code...\n');
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n📱 YOUR PAIRING CODE: ${code}\n`);
        console.log('Go to WhatsApp → Settings → Linked Devices → Link Device → Enter code\n');
      } catch (err) {
        console.error('Failed to get pairing code:', err.message);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        await delay(3000);
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log(`\n✅ ${botConfig.name} Connected!`);
      console.log(`${'═'.repeat(30)}`);
      console.log(`Name    : ${botConfig.name}`);
      console.log(`Version : ${botConfig.version} ${botConfig.beta}`);
      console.log(`Prefix  : ${botConfig.prefix}`);
      console.log(`Mode    : ${botConfig.mode}`);
      console.log(`Commands: ${Object.keys(allCommands).length}`);
      console.log(`${'═'.repeat(30)}\n`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      if (!message.message) continue;
      if (message.key.fromMe) continue; // Ignore own messages

      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        '';

      if (!text.startsWith(botConfig.prefix)) continue;

      const args = text.slice(botConfig.prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      try {
        await handleCommand(command, args, message, sock, botConfig);
      } catch (err) {
        console.error(`Error processing command "${command}":`, err.message);
      }
    }
  });
}

async function askPhoneNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('📱 Enter your WhatsApp phone number (with country code, e.g., 2348012345678): ', (answer) => {
      rl.close();
      resolve(answer.trim().replace(/\D/g, '')); // Strip non-digits
    });
  });
}

// Normalize JID for comparison (strip @s.whatsapp.net / @g.us)
function normalizeNumber(jid) {
  return jid ? jid.replace(/[@:].*/g, '') : '';
}

async function isGroupAdmin(sock, jid, senderJid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants.some(p => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin'));
  } catch {
    return false;
  }
}

async function handleCommand(command, args, message, sock, botConfig) {
  const jid = message.key.remoteJid;
  const isGroup = isJidGroup(jid);
  const sender = message.key.participant || jid;
  const senderNumber = normalizeNumber(sender);
  const ownerNumber = normalizeNumber(botConfig.ownerNumber);

  // Enforce private mode — only owner can use commands
  if (botConfig.mode === 'private' && ownerNumber && senderNumber !== ownerNumber) {
    return; // Silently ignore non-owner in private mode
  }

  const cmd = allCommands[command];

  if (cmd) {
    // Attach admin check helper to message so group commands can use it
    message._isGroupAdmin = isGroup ? () => isGroupAdmin(sock, jid, sender) : async () => false;
    message._ownerNumber = ownerNumber;
    message._senderNumber = senderNumber;
    message._isOwner = ownerNumber ? senderNumber === ownerNumber : false;

    try {
      await cmd.exec(args, sock, jid, isGroup, sender, message, botConfig);
    } catch (err) {
      console.error(`Error executing command "${command}":`, err.message);
      await sock.sendMessage(jid, { text: `❌ Error running .${command}: ${err.message}` });
    }
  } else {
    await sock.sendMessage(jid, {
      text: `❌ Unknown command: *${command}*\nType *${botConfig.prefix}menu* to see all commands.`
    });
  }
}

// Start
console.log('🚀 Starting OLASUBOMI-MD Bot...');
connectToWhatsApp().catch(err => console.error('Failed to start bot:', err.message));
