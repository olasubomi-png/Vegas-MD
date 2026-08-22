'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const db = require('../lib/database');
const ownerCommands = require('../commands/owner');
const assistant = require('../commands/assistant');
const databasePath = path.join(__dirname, '..', 'data', 'database.json');
const originalDatabase = fs.readFileSync(databasePath, 'utf8');

const sent = [];
const sock = {
  sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: `smoke-${sent.length}` } }; },
  sendPresenceUpdate: async () => {},
};
const botConfig = {
  ownerJid: '9999999999999@s.whatsapp.net',
  ownerNumber: '9999999999999',
  mode: 'public',
  name: 'Vegas-MD',
};
const ownerMessage = { key: { fromMe: true, remoteJid: botConfig.ownerJid } };

(async () => {
  try {
    await ownerCommands.freechat.exec([], sock, botConfig.ownerJid, false, botConfig.ownerJid, ownerMessage, botConfig);
    assert.strictEqual(db.getOwnerSetting(botConfig.ownerJid, 'freeChat', false), false, 'status should not enable chat');

    await ownerCommands.freechat.exec(['on'], sock, botConfig.ownerJid, false, botConfig.ownerJid, ownerMessage, botConfig);
    assert.strictEqual(db.getOwnerSetting(botConfig.ownerJid, 'freeChat', false), true);

    const blocked = await assistant.handleFreeChat({
      text: 'hello',
      sock,
      jid: '2222222222222@s.whatsapp.net',
      sender: '2222222222222@s.whatsapp.net',
      botConfig: { ...botConfig, mode: 'private' },
      isGroup: false,
      message: { key: { fromMe: false, remoteJid: '2222222222222@s.whatsapp.net' } },
    });
    assert.strictEqual(blocked, false, 'private mode must block non-owner free chat');

    assert.strictEqual(typeof assistant.code.exec, 'function');
    assert.strictEqual(typeof assistant.speak.exec, 'function');
    assert.strictEqual(typeof assistant.clearchat.exec, 'function');
    console.log('Feature smoke tests passed.');
  } finally {
    fs.writeFileSync(databasePath, originalDatabase);
    db.data = JSON.parse(originalDatabase);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
