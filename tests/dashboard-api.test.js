'use strict';

const assert = require('assert');
const http = require('http');
const { startBotApi, __test__ } = require('../bot-api/server');

const request = {
  signingSecret: 'test-signing-secret',
  timestamp: '2026-08-22T14:00:00.000Z',
  nonce: '01c6c271-8737-4f7e-832a-1ea75bdf7b41',
  method: 'POST',
  path: '/v1/dashboard/groups/120363000000000000/settings',
  body: '{"welcomeEnabled":true}',
};

const signature = __test__.makeDashboardSignature(request);
assert.match(signature, /^[a-f0-9]{64}$/);
assert.notStrictEqual(signature, __test__.makeDashboardSignature({ ...request, body: '{}' }));
assert.strictEqual(__test__.safeEqual('same-value', 'same-value'), true);
assert.strictEqual(__test__.safeEqual('same-value', 'different'), false);

const updates = __test__.groupUpdateFromDashboard({
  welcomeEnabled: true,
  goodbyeEnabled: false,
  welcomeTemplate: 'Welcome @user',
  moderation: { antiLink: true, unsafeProperty: true },
  automation: { autoReact: true },
  arbitraryWrite: 'must be ignored',
});
assert.deepStrictEqual(updates, { welcome: true, goodbye: false, welcomeMsg: 'Welcome @user', antiLink: true, autoReact: true });
assert.throws(() => __test__.groupUpdateFromDashboard({ welcomeTemplate: 'x'.repeat(2001) }), /too long/);

const serialized = __test__.serializeGroup({ id: '120363000000000000', welcome: true, goodbye: false, antiSpam: true });
assert.strictEqual(serialized.id, '120363000000000000');
assert.strictEqual(serialized.welcomeEnabled, true);
assert.strictEqual(serialized.moderation.antiSpam, true);
assert.strictEqual(serialized.moderation.antiLink, false);

function requestJson({ port, method, path, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const previousShared = process.env.BOT_API_SHARED_SECRET;
  const previousSigning = process.env.BOT_API_SIGNING_SECRET;
  const previousBind = process.env.DASHBOARD_API_BIND_HOST;
  process.env.BOT_API_SHARED_SECRET = 'integration-shared-secret';
  process.env.BOT_API_SIGNING_SECRET = 'integration-signing-secret';
  process.env.DASHBOARD_API_BIND_HOST = '127.0.0.1';

  const { server } = startBotApi({
    port: 0,
    getGroups: async () => [{ id: '120363000000000000', welcome: true, goodbye: false }],
    getCommandCount: () => 17,
  });
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const timestamp = new Date().toISOString();
  const nonce = '9f51c745-05cb-4d1d-a3c8-bda03f48175a';
  const path = '/v1/dashboard/snapshot';
  const signature = __test__.makeDashboardSignature({
    signingSecret: process.env.BOT_API_SIGNING_SECRET,
    timestamp,
    nonce,
    method: 'GET',
    path,
    body: '',
  });
  const accepted = await requestJson({
    port,
    method: 'GET',
    path,
    headers: {
      'x-vegas-shared-secret': process.env.BOT_API_SHARED_SECRET,
      'x-vegas-timestamp': timestamp,
      'x-vegas-nonce': nonce,
      'x-vegas-signature': signature,
    },
  });
  assert.strictEqual(accepted.status, 200);
  assert.strictEqual(accepted.body.commandCount, 17);
  assert.strictEqual(accepted.body.groups[0].welcomeEnabled, true);
  assert.strictEqual(accepted.body.providers.length, 6);
  assert.ok(accepted.body.providers.every(provider => typeof provider.name === 'string' && typeof provider.configured === 'boolean'));
  assert.doesNotMatch(JSON.stringify(accepted.body), /integration-(shared|signing)-secret/);

  const denied = await requestJson({ port, method: 'GET', path });
  assert.strictEqual(denied.status, 401);

  await new Promise(resolve => server.close(resolve));
  process.env.BOT_API_SHARED_SECRET = previousShared;
  process.env.BOT_API_SIGNING_SECRET = previousSigning;
  process.env.DASHBOARD_API_BIND_HOST = previousBind;
  console.log('Signed dashboard API tests passed.');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
