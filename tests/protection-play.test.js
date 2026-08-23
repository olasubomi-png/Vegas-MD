'use strict';

const assert = require('assert');
const Module = require('module');
const db = require('../lib/database');

const originalLoad = Module._load;
const originalGetGroup = db.getGroup;
const originalGetOwnerSetting = db.getOwnerSetting;
const downloaded = Buffer.from('test-media');
const realBaileys = originalLoad('baileys', module, false);
Module._load = function(request, parent, isMain) {
  if (request === 'baileys') return { ...realBaileys, downloadMediaMessage: async () => downloaded };
  return originalLoad.call(this, request, parent, isMain);
};

const {
  cacheMessage,
  handleAntiDelete,
  handleAntiViewOnce,
  handleOwnerViewOnceForward,
} = require('../events/protection');
const generalCommands = require('../commands/general');
const downloadCommands = require('../commands/download');

const botConfig = {
  ownerJid: '999@s.whatsapp.net',
  ownerNumber: '999',
};

function makeSock() {
  const sent = [];
  return {
    sent,
    updateMediaMessage: async () => {},
    sendMessage: async (jid, payload) => {
      sent.push({ jid, payload });
      return { key: { id: String(sent.length) } };
    },
  };
}

function quotedViewOnceMessage({ type = 'image', marked = true } = {}) {
  const media = type === 'video'
    ? { videoMessage: { mimetype: 'video/mp4', ...(marked ? { viewOnce: true } : {}) } }
    : { imageMessage: { mimetype: 'image/jpeg', ...(marked ? { viewOnce: true } : {}) } };
  return marked ? { viewOnceMessage: { message: media } } : media;
}

async function run() {
  db.getGroup = () => ({ antiDelete: true, antiViewOnce: true });
  db.getOwnerSetting = (_ownerJid, key, fallback) => key === 'antiDelete' ? true : fallback;

  const antiDeleteSock = makeSock();
  const deletedId = `deleted-${Date.now()}`;
  cacheMessage({
    key: { remoteJid: '123@g.us', participant: '111@s.whatsapp.net', id: deletedId },
    message: { conversation: 'private recovery text' },
  });
  await handleAntiDelete(antiDeleteSock, [{ id: deletedId, remoteJid: '123@g.us' }], botConfig);
  assert.strictEqual(antiDeleteSock.sent.length, 1, 'anti-delete should send exactly one recovery message');
  assert.strictEqual(antiDeleteSock.sent[0].jid, '999@s.whatsapp.net', 'anti-delete must target the owner DM');
  assert.strictEqual(antiDeleteSock.sent[0].payload.text.includes('private recovery text'), true);

  const passiveSock = makeSock();
  const passiveMessage = {
    key: { remoteJid: '123@g.us', participant: '111@s.whatsapp.net', id: `view-${Date.now()}` },
    message: quotedViewOnceMessage({ type: 'video', marked: true }),
  };
  await handleAntiViewOnce(passiveSock, passiveMessage, botConfig);
  assert.strictEqual(passiveSock.sent.length, 1, 'automatic view-once forwarding should be silent in the source chat');
  assert.strictEqual(passiveSock.sent[0].jid, '999@s.whatsapp.net');
  assert.ok(passiveSock.sent[0].payload.video, 'automatic forwarding should preserve video media');

  const ownerReplySock = makeSock();
  const ownerReply = {
    key: { fromMe: true, remoteJid: '123@g.us', id: `reply-${Date.now()}` },
    message: {
      extendedTextMessage: {
        text: 'reply without .vv',
        contextInfo: {
          stanzaId: `quoted-${Date.now()}`,
          participant: '111@s.whatsapp.net',
          quotedMessage: quotedViewOnceMessage({ type: 'image', marked: true }),
        },
      },
    },
  };
  await handleOwnerViewOnceForward(ownerReplySock, ownerReply, botConfig);
  assert.strictEqual(ownerReplySock.sent.length, 1, 'an owner reply should forward one view-once media item');
  assert.strictEqual(ownerReplySock.sent[0].jid, '999@s.whatsapp.net');

  const ordinaryReplySock = makeSock();
  const ordinaryReply = {
    key: { fromMe: true, remoteJid: '123@g.us', id: `ordinary-${Date.now()}` },
    message: {
      extendedTextMessage: {
        text: 'ordinary media reply',
        contextInfo: {
          stanzaId: `ordinary-quoted-${Date.now()}`,
          participant: '111@s.whatsapp.net',
          quotedMessage: quotedViewOnceMessage({ type: 'image', marked: false }),
        },
      },
    },
  };
  await handleOwnerViewOnceForward(ordinaryReplySock, ordinaryReply, botConfig);
  assert.strictEqual(ordinaryReplySock.sent.length, 0, 'ordinary quoted media must not be auto-forwarded');

  const vvSock = makeSock();
  const vvMessage = {
    key: { fromMe: true, remoteJid: '123@g.us', id: `vv-${Date.now()}` },
    message: {
      extendedTextMessage: {
        text: '.vv',
        contextInfo: {
          stanzaId: `vv-quoted-${Date.now()}`,
          participant: '111@s.whatsapp.net',
          quotedMessage: quotedViewOnceMessage({ type: 'image', marked: false }),
        },
      },
    },
  };
  await generalCommands.vv.exec([], vvSock, '123@g.us', true, '999@s.whatsapp.net', vvMessage, botConfig);
  assert.strictEqual(vvSock.sent.length, 1, '.vv should send only the private recovery copy');
  assert.strictEqual(vvSock.sent[0].jid, '999@s.whatsapp.net');

  assert.strictEqual(typeof downloadCommands.play.exec, 'function', '.play must remain registered');
  assert.strictEqual(downloadCommands.play.exec, downloadCommands.play.exec);

  console.log('Protection and play regression tests passed.');
}

run()
  .finally(() => {
    Module._load = originalLoad;
    db.getGroup = originalGetGroup;
    db.getOwnerSetting = originalGetOwnerSetting;
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
