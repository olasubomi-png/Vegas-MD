'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const db = require('../lib/database');

const databasePath = path.join(__dirname, '..', 'data', 'database.json');
const originalDatabase = fs.readFileSync(databasePath, 'utf8');
const originalLoad = Module._load;
const providerCalls = [];

const fakeAiService = {
  askChat: async (messages, options) => {
    providerCalls.push({ kind: 'chat', messages, options });
    return 'Stubbed assistant response';
  },
  askText: async (messages, options) => {
    providerCalls.push({ kind: 'text', messages, options });
    return 'Stubbed text response';
  },
  askPrivateText: async () => 'Stubbed private coding response',
  getOpenAIKey: () => 'test-key',
  getFreeChatSystemPrompt: () => 'free-chat-system',
  getCodingSystemPrompt: () => 'coding-system',
  generateSpeech: async () => Buffer.from('audio'),
  trimText: (value, limit = 12_000) => String(value || '').trim().slice(0, limit),
};

Module._load = function(request, parent, isMain) {
  if (request === '../lib/ai-service' && parent?.filename?.endsWith(`${path.sep}commands${path.sep}assistant.js`)) {
    return fakeAiService;
  }
  if (request === '../lib/ai-service' && parent?.filename?.endsWith(`${path.sep}commands${path.sep}repo.js`)) {
    return fakeAiService;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const assistant = require('../commands/assistant');
const general = require('../commands/general');
const repo = require('../commands/repo');
const commandRegistry = require('../commands');
Module._load = originalLoad;

const ownerJid = '9999999999999@s.whatsapp.net';
const botConfig = {
  ownerJid,
  ownerNumber: '9999999999999',
  mode: 'private',
  name: 'Vegas-MD',
};
const ownerMessage = { key: { fromMe: true, remoteJid: ownerJid, id: 'owner-message' } };

function makeSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      return { key: { id: `stub-${sent.length}` } };
    },
    sendPresenceUpdate: async () => {},
  };
}

(async () => {
  try {
    db.setOwnerSetting(ownerJid, 'freeChat', true);
    db.setOwnerSetting(ownerJid, 'freeChatGroups', false);

    const freeChatSock = makeSock();
    const handled = await assistant.handleFreeChat({
      text: 'hello bot',
      sock: freeChatSock,
      jid: ownerJid,
      sender: ownerJid,
      botConfig,
      isGroup: false,
      message: ownerMessage,
    });
    assert.strictEqual(handled, true, 'enabled owner free-chat should handle ordinary text');
    assert.strictEqual(freeChatSock.sent.at(-1).content.text, 'Stubbed assistant response');
    assert.strictEqual(providerCalls.at(-1).kind, 'chat');

    const visitorDirectSock = makeSock();
    const visitorDirectHandled = await assistant.handleFreeChat({
      text: 'hello from a visitor',
      sock: visitorDirectSock,
      jid: '2222222222222@s.whatsapp.net',
      sender: '2222222222222@s.whatsapp.net',
      botConfig,
      isGroup: false,
      message: { key: { fromMe: false, remoteJid: '2222222222222@s.whatsapp.net', id: 'visitor-dm' } },
    });
    assert.strictEqual(visitorDirectHandled, true, 'enabled free-chat should reply to non-owners in direct messages');
    assert.strictEqual(visitorDirectSock.sent.at(-1).content.text, 'Stubbed assistant response');

    db.setOwnerSetting(ownerJid, 'freeChatGroups', true);
    const visitorGroupSock = makeSock();
    const visitorGroupHandled = await assistant.handleFreeChat({
      text: 'hello from a group member',
      sock: visitorGroupSock,
      jid: '123456789@g.us',
      sender: '2222222222222@s.whatsapp.net',
      botConfig,
      isGroup: true,
      message: { key: { fromMe: false, remoteJid: '123456789@g.us', participant: '2222222222222@s.whatsapp.net', id: 'visitor-group' } },
    });
    assert.strictEqual(visitorGroupHandled, true, 'enabled group free-chat should reply to non-owner group members');
    assert.strictEqual(visitorGroupSock.sent.at(-1).content.text, 'Stubbed assistant response');

    const codeSock = makeSock();
    await assistant.code.exec(['Explain', 'Promises'], codeSock, ownerJid, false, ownerJid, ownerMessage, botConfig);
    assert.strictEqual(codeSock.sent.length, 2, '.code should send progress and an answer');
    assert.match(codeSock.sent.at(-1).content.text, /Stubbed assistant response/);

    const chatSock = makeSock();
    await assistant.chat.exec(['Explain', 'APIs'], chatSock, ownerJid, false, ownerJid, ownerMessage, botConfig);
    assert.match(chatSock.sent.at(-1).content.text, /Stubbed assistant response/);

    assert.strictEqual(typeof commandRegistry.vibe?.exec, 'function', '.vibe must be registered');
    assert.strictEqual(typeof commandRegistry.workrepo?.exec, 'function', '.workrepo must be registered');

    let bridgeCalled = false;
    const originalHandleRepo = repo._internals.handleRepo;
    repo._internals.handleRepo = async (args, sock, jid) => {
      bridgeCalled = true;
      await sock.sendMessage(jid, { text: `bridged:${args[0]}` });
    };
    const bridgeSock = makeSock();
    await general.repo.exec(['status'], bridgeSock, ownerJid, false, ownerJid, ownerMessage, botConfig);
    repo._internals.handleRepo = originalHandleRepo;
    assert.strictEqual(bridgeCalled, true, 'legacy .repo subcommands should reach the new workspace handler');
    assert.strictEqual(bridgeSock.sent[0].content.text, 'bridged:status');

    const blockedBridgeSock = makeSock();
    await general.repo.exec(['status'], blockedBridgeSock, '2222222222222@s.whatsapp.net', false, '2222222222222@s.whatsapp.net', { key: { fromMe: false, remoteJid: '2222222222222@s.whatsapp.net' } }, botConfig);
    assert.strictEqual(blockedBridgeSock.sent.length, 1, 'non-owners should receive one permission response');
    assert.match(blockedBridgeSock.sent[0].content.text, /owner-only/i);

    console.log('Assistant routing tests passed.');
  } finally {
    fs.writeFileSync(databasePath, originalDatabase);
    db.data = JSON.parse(originalDatabase);
    Module._load = originalLoad;
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
