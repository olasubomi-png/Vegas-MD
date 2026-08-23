'use strict';

const assert = require('assert');
const { fetchMusic, isSafeRemoteUrl } = require('../lib/david-cyril-api');

(async () => {
  const music = await fetchMusic('Shape of You', 'play');
  assert.ok(music.title, 'music provider should return a title');
  assert.ok(music.downloadUrl, 'music provider should return an audio URL');
  assert.strictEqual(isSafeRemoteUrl(music.downloadUrl), true, 'music URL must be HTTPS and remote');
  console.log('David Cyril /play provider smoke test passed.');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
