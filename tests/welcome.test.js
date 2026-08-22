'use strict';

const assert = require('assert');
const db = require('../lib/database');
const { handleParticipantUpdate, normalizeParticipantUpdates } = require('../events/welcome');

(async () => {
  const originalGetGroup = db.getGroup;
  db.getGroup = () => ({
    welcome: true,
    goodbye: true,
    welcomeMsg: 'Welcome @user to @group (#@count)',
    goodbyeMsg: 'Goodbye @user from @group (#@count)',
  });

  const sent = [];
  const sock = {
    groupMetadata: async () => ({ subject: 'Vegas Test', participants: [{ id: '111@s.whatsapp.net' }, { id: '222@s.whatsapp.net' }] }),
    profilePictureUrl: async () => { throw new Error('no profile picture'); },
    sendMessage: async (jid, payload) => { sent.push({ jid, payload }); return { key: { id: String(sent.length) } }; },
  };

  assert.deepStrictEqual(normalizeParticipantUpdates({ id: '123@g.us', participants: ['111@s.whatsapp.net'], action: 'add' }).length, 1);
  assert.strictEqual(normalizeParticipantUpdates([{ id: '123@g.us', participants: ['111@s.whatsapp.net'], action: 'add' }]).length, 1);

  await handleParticipantUpdate(sock, { id: '123@g.us', participants: '111@s.whatsapp.net', action: 'add' });
  assert.strictEqual(sent.length, 1, 'a single participant must generate one welcome');
  assert.match(sent[0].payload.text, /@111/);
  assert.match(sent[0].payload.text, /Vegas Test/);

  sent.length = 0;
  await handleParticipantUpdate(sock, { id: '123@g.us', participants: ['111@s.whatsapp.net'], action: 'remove' });
  assert.strictEqual(sent.length, 1, 'a removed participant must generate one goodbye');
  assert.match(sent[0].payload.text, /Goodbye @111/);

  sent.length = 0;
  await handleParticipantUpdate(sock, [{ id: '123@g.us', participants: ['111@s.whatsapp.net', '222@s.whatsapp.net'], action: 'remove' }]);
  assert.strictEqual(sent.length, 2, 'a batch update must notify every participant');

  sent.length = 0;
  await handleParticipantUpdate(sock, { id: '123@g.us', participants: [{ id: '333@s.whatsapp.net' }], action: 'kick' });
  assert.strictEqual(sent.length, 1, 'a kicked participant must generate a goodbye');
  assert.match(sent[0].payload.text, /Goodbye @333/);

  sent.length = 0;
  await handleParticipantUpdate(sock, { id: '123@g.us', participants: ['444@s.whatsapp.net'], action: 'leave' });
  assert.strictEqual(sent.length, 1, 'a voluntary leave must generate a goodbye');

  db.getGroup = originalGetGroup;
  console.log('Welcome/goodbye event tests passed.');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
