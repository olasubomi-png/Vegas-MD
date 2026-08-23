'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// This smoke test deliberately avoids any user-provided or stored provider key.
process.env.ZST_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.OPEN_API_KEY = '';

const db = require('../lib/database');
const assistant = require('../commands/assistant');
const databasePath = path.join(__dirname, '..', 'data', 'database.json');
const originalDatabase = fs.readFileSync(databasePath, 'utf8');
const ownerJid = '9999999999999@s.whatsapp.net';
const botConfig = {
  ownerJid,
  ownerNumber: '9999999999999',
  mode: 'private',
  name: 'Vegas-MD',
};

function makeSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      return { key: { id: `smoke-${sent.length}` } };
    },
    sendPresenceUpdate: async () => {},
  };
}

(async () => {
  if (process.env.RUN_LIVE_AI_SMOKE !== '1') {
    console.log('Assistant provider smoke test skipped; set RUN_LIVE_AI_SMOKE=1 to call external providers.');
    return;
  }
  try {
    db.setOwnerSetting(ownerJid, 'freeChat', true);
    db.setOwnerSetting(ownerJid, 'freeChatGroups', false);

    const freeChatSock = makeSock();
    const freeChatHandled = await assistant.handleFreeChat({
      text: 'Reply with a short greeting.',
      sock: freeChatSock,
      jid: ownerJid,
      sender: ownerJid,
      botConfig,
      isGroup: false,
      message: { key: { fromMe: true, remoteJid: ownerJid, id: 'freechat-smoke' } },
    });
    assert.strictEqual(freeChatHandled, true);
    assert.ok(freeChatSock.sent.some(item => typeof item.content?.text === 'string' && item.content.text.length > 0));

    const codeSock = makeSock();
    await assistant.code.exec(['Return', 'a', 'one-line', 'JavaScript', 'function'], codeSock, ownerJid, false, ownerJid, { key: { fromMe: true, remoteJid: ownerJid } }, botConfig);
    assert.ok(codeSock.sent.some(item => item.content?.text?.includes('Coding Assistant')));
    assert.ok(codeSock.sent.at(-1).content.text.length > 0);

    console.log('Assistant provider smoke test passed.');
  } finally {
    fs.writeFileSync(databasePath, originalDatabase);
    db.data = JSON.parse(originalDatabase);
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
